const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// GET /api/admin/stats
router.get('/stats', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const stats = {
    orders: {
      total: db.prepare('SELECT COUNT(*) as cnt FROM orders').get().cnt,
      today: db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE date(created_at)=?").get(today).cnt,
      pending_stock: db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='pending_stock_check'").get().cnt,
      payment_link_sent: db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status='payment_link_sent'").get().cnt,
    },
    revenue: {
      total: db.prepare("SELECT COALESCE(SUM(total_amount),0) as s FROM orders WHERE status NOT IN ('cancelled','refunded')").get().s,
      today: db.prepare("SELECT COALESCE(SUM(total_amount),0) as s FROM orders WHERE date(created_at)=? AND status NOT IN ('cancelled','refunded')").get(today).s,
    },
    users: {
      total: db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_active=1').get().cnt,
      dealers: db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role='dealer' AND is_active=1").get().cnt,
      pending_dealers: db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role='dealer' AND is_active=0").get().cnt,
    },
    products: {
      total: db.prepare('SELECT COUNT(*) as cnt FROM products WHERE is_active=1').get().cnt,
      out_of_stock: db.prepare("SELECT COUNT(*) as cnt FROM products WHERE stock_status='out_of_stock' AND is_active=1").get().cnt,
    },
    quote_requests: {
      new: db.prepare("SELECT COUNT(*) as cnt FROM quote_requests WHERE status='new'").get().cnt,
    },
    discount_requests: {
      pending: db.prepare("SELECT COUNT(*) as cnt FROM discount_requests WHERE status='pending'").get().cnt,
    }
  };
  res.json(stats);
});

// GET /api/admin/users
router.get('/users', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { role, search, page = 1, limit = 20 } = req.query;
  let where = [];
  let params = [];
  if (role) { where.push('role=?'); params.push(role); }
  if (search) { where.push('(name LIKE ? OR email LIKE ? OR company_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (page - 1) * limit;
  const users = db.prepare(`SELECT id,uuid,name,email,role,company_name,tax_number,phone,dealer_code,discount_rate,is_active,created_at FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM users ${whereClause}`).get(...params).cnt;
  res.json({ users, total });
});

// POST /api/admin/users - admin creates user (including dealers/employees)
router.post('/users', requireAuth, requireRole('admin', 'employee'), async (req, res) => {
  try {
    const db = getDb();
    const { name, email, password, role, company_name, tax_number, phone, address, dealer_code, discount_rate } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) return res.status(400).json({ error: 'Bu e-posta zaten kayıtlı' });
    const hashed = await bcrypt.hash(password || 'Klima2024!', 10);
    const uuid = uuidv4();
    const generatedCode = role === 'dealer' ? (dealer_code || `BAY-${Date.now()}`) : null;
    const result = db.prepare(`INSERT INTO users (uuid, name, email, password, role, company_name, tax_number, phone, address, dealer_code, discount_rate) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(uuid, name, email, hashed, role || 'customer', company_name || null, tax_number || null, phone || null, address || null, generatedCode, discount_rate || 0);
    res.json({ id: result.lastInsertRowid, uuid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/users/:id
router.put('/users/:id', requireAuth, requireRole('admin', 'employee'), async (req, res) => {
  try {
    const db = getDb();
    const { name, email, role, company_name, tax_number, phone, discount_rate, is_active, new_password } = req.body;
    if (new_password) {
      const hashed = await bcrypt.hash(new_password, 10);
      db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, req.params.id);
    }
    db.prepare('UPDATE users SET name=?,email=?,role=?,company_name=?,tax_number=?,phone=?,discount_rate=?,is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, email, role, company_name || null, tax_number || null, phone || null, discount_rate || 0, is_active ? 1 : 0, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/categories
router.get('/categories', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all());
});

router.post('/categories', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { name, slug, description, parent_id, sort_order } = req.body;
  const safeSlug = slug || slugify(name);
  const result = db.prepare('INSERT INTO categories (name, slug, description, parent_id, sort_order) VALUES (?,?,?,?,?)').run(name, safeSlug, description || null, parent_id || null, sort_order || 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/categories/:id', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { name, slug, description, parent_id, sort_order, is_active } = req.body;
  db.prepare('UPDATE categories SET name=?,slug=?,description=?,parent_id=?,sort_order=?,is_active=? WHERE id=?').run(name, slug, description || null, parent_id || null, sort_order || 0, is_active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// GET /api/admin/brands
router.get('/brands', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM brands WHERE is_active=1 ORDER BY name').all());
});

router.post('/brands', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { name, slug, logo_url } = req.body;
  const safeSlug = slug || slugify(name);
  const result = db.prepare('INSERT OR IGNORE INTO brands (name, slug, logo_url) VALUES (?,?,?)').run(name, safeSlug, logo_url || null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/brands/:id', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { name, logo_url } = req.body;
  const brand = db.prepare('SELECT * FROM brands WHERE id=?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Marka bulunamadı' });
  const safeSlug = slugify(name || brand.name);
  db.prepare('UPDATE brands SET name=?,slug=?,logo_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(name || brand.name, safeSlug, logo_url !== undefined ? (logo_url || null) : brand.logo_url, req.params.id);
  res.json({ success: true });
});

// GET /api/admin/settings
router.get('/settings', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

router.put('/settings', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  for (const [key, value] of Object.entries(req.body)) {
    update.run(key, String(value));
  }
  res.json({ success: true });
});

// GET /api/admin/price-requests
router.get('/price-requests', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const requests = db.prepare(`
    SELECT pr.*, p.name as product_name, p.slug as product_slug
    FROM price_requests pr JOIN products p ON pr.product_id = p.id
    ORDER BY pr.created_at DESC
  `).all();
  res.json(requests);
});

router.put('/price-requests/:id/status', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE price_requests SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ success: true });
});

// PATCH /api/admin/users/:id/active
router.patch('/users/:id/active', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { is_active } = req.body;
  db.prepare('UPDATE users SET is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(is_active ? 1 : 0, req.params.id);
  res.json({ success: true });
});

// ===== PAYMENT LINKS =====
// Safe migration: create payment_links table if missing
try {
  getDb().exec(`CREATE TABLE IF NOT EXISTS payment_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    description TEXT,
    order_uuid TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch {}

router.get('/payment-links', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM payment_links ORDER BY created_at DESC').all());
});

router.post('/payment-links', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { url, description, order_uuid, expires_at } = req.body;
  if (!url) return res.status(400).json({ error: 'URL zorunludur' });
  const result = db.prepare('INSERT INTO payment_links (url, description, order_uuid, expires_at) VALUES (?,?,?,?)')
    .run(url, description || null, order_uuid || null, expires_at || null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/payment-links/:id', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { url, description, order_uuid, expires_at } = req.body;
  db.prepare('UPDATE payment_links SET url=?,description=?,order_uuid=?,expires_at=? WHERE id=?')
    .run(url, description || null, order_uuid || null, expires_at || null, req.params.id);
  res.json({ success: true });
});

router.delete('/payment-links/:id', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM payment_links WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

function slugify(text) {
  return (text || '').toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = router;
