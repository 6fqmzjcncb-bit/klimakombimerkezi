const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/uploads/quotes');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.dwg', '.dxf', '.xls', '.xlsx', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// POST /api/quotes - teklif formu gönder
router.post('/', optionalAuth, upload.array('files', 10), (req, res) => {
  try {
    const db = getDb();
    const { name, email, phone, company, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Ad, e-posta ve mesaj zorunludur' });

    const uuid = uuidv4();
    const result = db.prepare('INSERT INTO quote_requests (uuid, user_id, name, email, phone, company, message) VALUES (?,?,?,?,?,?,?)')
      .run(uuid, req.user?.id || null, name, email, phone || null, company || null, message);

    const requestId = result.lastInsertRowid;

    // save files
    if (req.files?.length) {
      const insertFile = db.prepare('INSERT INTO quote_request_files (quote_request_id, filename, original_name, file_size, mime_type) VALUES (?,?,?,?,?)');
      for (const f of req.files) {
        insertFile.run(requestId, f.filename, f.originalname, f.size, f.mimetype);
      }
    }

    // Notify admins
    const admins = db.prepare('SELECT id FROM users WHERE role=?').all('admin');
    const stmt = db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)');
    for (const admin of admins) {
      stmt.run(admin.id, 'Yeni Teklif Talebi', `${name} (${company || email}) yeni teklif talebi gönderdi`, 'info', `/admin/quote-requests/${uuid}`);
    }

    res.json({ success: true, uuid, message: 'Teklif talebiniz alındı. En kısa sürede iletişime geçeceğiz.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/quotes - admin/employee
router.get('/', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let where = [];
  let params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const requests = db.prepare(`SELECT * FROM quote_requests ${whereClause} ORDER BY created_at DESC`).all(...params);
  const withFiles = requests.map(r => ({
    ...r,
    files: db.prepare('SELECT * FROM quote_request_files WHERE quote_request_id=?').all(r.id)
  }));
  res.json(withFiles);
});

// GET /api/quotes/:uuid
router.get('/:uuid', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const r = db.prepare('SELECT * FROM quote_requests WHERE uuid=?').get(req.params.uuid);
  if (!r) return res.status(404).json({ error: 'Teklif talebi bulunamadı' });
  r.files = db.prepare('SELECT * FROM quote_request_files WHERE quote_request_id=?').all(r.id);
  res.json(r);
});

// PUT /api/quotes/:uuid/status
router.put('/:uuid/status', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE quote_requests SET status=?, updated_at=CURRENT_TIMESTAMP WHERE uuid=?').run(status, req.params.uuid);
  res.json({ success: true });
});

module.exports = router;
