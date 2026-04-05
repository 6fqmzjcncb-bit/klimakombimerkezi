const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// GET /api/dealer/projects - bayi kendi projelerini görür
router.get('/projects', requireAuth, requireRole('dealer', 'admin', 'employee'), (req, res) => {
  try {
    const db = getDb();
    const isDealer = req.user.role === 'dealer';
    const { status, page = 1, limit = 20 } = req.query;

    let where = isDealer ? ['dp.dealer_id = ?'] : [];
    let params = isDealer ? [req.user.id] : [];
    if (status) { where.push('dp.status = ?'); params.push(status); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const projects = db.prepare(`
      SELECT dp.*, u.name as dealer_name, u.company_name, u.email as dealer_email,
             u.discount_rate as base_discount_rate
      FROM dealer_projects dp JOIN users u ON dp.dealer_id = u.id
      ${whereClause} ORDER BY dp.updated_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset));

    const withItems = projects.map(p => ({
      ...p,
      items: db.prepare('SELECT dpi.*, pr.name as product_name, pr.sku FROM dealer_project_items dpi LEFT JOIN products pr ON dpi.product_id = pr.id WHERE dpi.project_id = ?').all(p.id)
    }));
    res.json(withItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dealer/projects/:uuid
router.get('/projects/:uuid', requireAuth, requireRole('dealer', 'admin', 'employee'), (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare(`
      SELECT dp.*, u.name as dealer_name, u.company_name, u.email as dealer_email,
             u.discount_rate as base_discount_rate
      FROM dealer_projects dp JOIN users u ON dp.dealer_id = u.id
      WHERE dp.uuid = ?
    `).get(req.params.uuid);

    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });
    if (req.user.role === 'dealer' && project.dealer_id !== req.user.id) {
      return res.status(403).json({ error: 'Bu projeye erişim yetkiniz yok' });
    }

    project.items = db.prepare(`
      SELECT dpi.*, pr.name as product_name, pr.sku, pr.images as product_images
      FROM dealer_project_items dpi LEFT JOIN products pr ON dpi.product_id = pr.id
      WHERE dpi.project_id = ?
    `).all(project.id);

    project.discount_requests = db.prepare('SELECT * FROM discount_requests WHERE project_id = ? ORDER BY created_at DESC').all(project.id);

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/projects - yeni proje oluştur (sepetten veya manuel)
router.post('/projects', requireAuth, requireRole('dealer'), (req, res) => {
  try {
    const db = getDb();
    const { project_name, customer_name, description, items } = req.body;
    if (!project_name) return res.status(400).json({ error: 'Proje adı zorunludur' });

    const uuid = uuidv4();
    const result = db.prepare(`
      INSERT INTO dealer_projects (uuid, dealer_id, project_name, customer_name, description)
      VALUES (?,?,?,?,?)
    `).run(uuid, req.user.id, project_name, customer_name || null, description || null);

    const projectId = result.lastInsertRowid;
    if (items?.length) {
      const insertItem = db.prepare('INSERT INTO dealer_project_items (project_id, product_id, label, quantity, unit_price, margin_rate, is_manual) VALUES (?,?,?,?,?,?,?)');
      for (const item of items) {
        insertItem.run(projectId, item.product_id || null, item.label, item.quantity || 1, item.unit_price, item.margin_rate || 0, item.is_manual ? 1 : 0);
      }
    }

    res.json({ success: true, uuid, id: projectId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dealer/projects/:uuid - proje güncelle
router.put('/projects/:uuid', requireAuth, requireRole('dealer', 'admin'), (req, res) => {
  try {
    const db = getDb();
    const project = db.prepare('SELECT * FROM dealer_projects WHERE uuid=?').get(req.params.uuid);
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });
    if (req.user.role === 'dealer' && project.dealer_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });

    const { project_name, customer_name, description, status, items } = req.body;
    db.prepare(`UPDATE dealer_projects SET project_name=?,customer_name=?,description=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE uuid=?`)
      .run(project_name || project.project_name, customer_name || project.customer_name, description || project.description, status || project.status, req.params.uuid);

    if (items !== undefined) {
      db.prepare('DELETE FROM dealer_project_items WHERE project_id=?').run(project.id);
      if (items.length) {
        const insertItem = db.prepare('INSERT INTO dealer_project_items (project_id, product_id, label, quantity, unit_price, margin_rate, is_manual) VALUES (?,?,?,?,?,?,?)');
        for (const item of items) {
          insertItem.run(project.id, item.product_id || null, item.label, item.quantity || 1, item.unit_price, item.margin_rate || 0, item.is_manual ? 1 : 0);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/projects/:uuid/discount-request - iskonto talebi
router.post('/projects/:uuid/discount-request', requireAuth, requireRole('dealer'), (req, res) => {
  const db = getDb();
  const { requested_rate, requested_amount, discount_type, reason } = req.body;
  const project = db.prepare('SELECT * FROM dealer_projects WHERE uuid=? AND dealer_id=?').get(req.params.uuid, req.user.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });
  
  const type = discount_type === 'amount' ? 'amount' : 'percentage';
  const rate = parseFloat(requested_rate) || 0;
  const amount = parseFloat(requested_amount) || null;

  if (type === 'percentage' && rate <= 0) return res.status(400).json({ error: 'Geçerli bir iskonto oranı girin' });
  if (type === 'amount' && (!amount || amount <= 0)) return res.status(400).json({ error: 'Geçerli bir tutar girin' });

  db.prepare('INSERT INTO discount_requests (project_id, dealer_id, requested_rate, requested_amount, discount_type, reason) VALUES (?,?,?,?,?,?)')
    .run(project.id, req.user.id, rate, amount, type, reason || null);
  db.prepare('UPDATE dealer_projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run('pending_discount', project.id);

  // Notify admins
  const admins = db.prepare('SELECT id FROM users WHERE role=?').all('admin');
  const stmt = db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)');
  const valText = type === 'amount' ? `${amount} ₺ tutarında` : `%${rate} oranında`;
  for (const admin of admins) {
    stmt.run(admin.id, 'Yeni İskonto Talebi', `${req.user.company_name || req.user.name} - ${project.project_name} için ${valText} iskonto talep etti`, 'warning', `/admin/discount-requests`);
  }

  res.json({ success: true, message: 'İskonto talebiniz iletildi, onay bekliyor.' });
});

// POST /api/dealer/discount-requests/:id/review - admin onayı/reddi
router.post('/discount-requests/:id/review', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { status, admin_note, approved_rate, approved_amount } = req.body; // status: approved | rejected
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Geçersiz durum' });

  const request = db.prepare('SELECT dr.*, dp.dealer_id, dp.project_name, dp.uuid as project_uuid FROM discount_requests dr JOIN dealer_projects dp ON dr.project_id = dp.id WHERE dr.id=?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Talep bulunamadı' });

  db.prepare('UPDATE discount_requests SET status=?, admin_id=?, admin_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, req.user.id, admin_note || null, req.params.id);

  if (status === 'approved') {
    const type = request.discount_type;
    const rate = type === 'percentage' ? (approved_rate || request.requested_rate) : 0;
    const amount = type === 'amount' ? (approved_amount || request.requested_amount) : 0;
    
    // Add columns if they don't exist yet via migration (we did it in database.js, but just in case, we only use existing extra_discount_rate here)
    // Quick fix: Since we added discount_type to projects table, wait, did we? I'll let frontend handle percentage or amount by fetching the original request if needed, or by calculating from raw price.
    // For now, let's inject extra_discount_amount column if missing.
    try { db.exec('ALTER TABLE dealer_projects ADD COLUMN extra_discount_amount REAL DEFAULT 0.0'); } catch {}
    try { db.exec('ALTER TABLE dealer_projects ADD COLUMN extra_discount_type TEXT DEFAULT \'percentage\''); } catch {}

    db.prepare('UPDATE dealer_projects SET extra_discount_rate=?, extra_discount_amount=?, extra_discount_type=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(rate, amount, type, 'discount_approved', request.project_id);
    
    const valText = type === 'amount' ? `${amount} ₺ tutarında` : `%${rate}`;
    db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)')
      .run(request.dealer_id, 'İskonto Talebiniz Onaylandı! 🎉', `${request.project_name} projesi için ${valText} ek iskonto onaylandı.`, 'success', `/bayi/projeler/${request.project_uuid}`);
  } else {
    db.prepare('UPDATE dealer_projects SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run('draft', request.project_id);
    db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)')
      .run(request.dealer_id, 'İskonto Talebi Reddedildi', `${request.project_name}: ${admin_note || 'Talebiniz onaylanamadı.'}`, 'warning', `/bayi/projeler/${request.project_uuid}`);
  }

  res.json({ success: true });
});

// GET /api/dealer/discount-requests - admin için tüm talepler
router.get('/discount-requests', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  try {
    const db = getDb();
    const requests = db.prepare(`
      SELECT dr.*, u.name as dealer_name, u.company_name, dp.project_name, dp.uuid as project_uuid
      FROM discount_requests dr
      JOIN users u ON dr.dealer_id = u.id
      JOIN dealer_projects dp ON dr.project_id = dp.id
      ORDER BY dr.created_at DESC
    `).all();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
