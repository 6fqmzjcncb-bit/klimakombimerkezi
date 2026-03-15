const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory
fs.mkdirSync(path.join(__dirname, '../public/uploads'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '../public/uploads/quotes'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '../public/uploads/pdfs'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '../public/uploads/orders'), { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Initialize DB
require('./database').getDb();

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/dealer', require('./routes/dealer'));
app.use('/api/quotes', require('./routes/quoteRequests'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/pdf', require('./routes/pdf'));

// Public API for categories and brands
const { getDb } = require('./database');
const { optionalAuth } = require('./middleware/auth');

app.get('/api/categories', optionalAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order, name').all());
});

app.get('/api/brands', optionalAuth, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM brands WHERE is_active=1 ORDER BY name').all());
});

app.get('/api/settings/public', (req, res) => {
  const db = getDb();
  const publicKeys = ['site_name', 'site_phone', 'site_email', 'site_address'];
  const rows = db.prepare(`SELECT * FROM settings WHERE key IN (${publicKeys.map(() => '?').join(',')})`)
    .all(...publicKeys);
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

// Order file upload
const multer = require('multer');
const { requireAuth } = require('./middleware/auth');
const orderFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/orders');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const orderUpload = multer({ storage: orderFileStorage, limits: { fileSize: 20 * 1024 * 1024 } });

app.post('/api/orders/:uuid/files', requireAuth, orderUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenemedi' });
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE uuid=?').get(req.params.uuid);
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const isOwner = order.user_id === req.user.id;
  const isStaff = ['admin', 'employee'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: 'Yetkisiz' });

  db.prepare('INSERT INTO order_files (order_id, user_id, filename, original_name, file_size, mime_type) VALUES (?,?,?,?,?,?)')
    .run(order.id, req.user.id, req.file.filename, req.file.originalname, req.file.size, req.file.mimetype);
  res.json({ success: true, filename: req.file.filename, url: `/uploads/orders/${req.file.filename}` });
});

// SPA fallback - all unmatched routes serve index.html for client-side routing
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint bulunamadı' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
});

app.listen(PORT, () => {
  console.log(`\n🔥 Klima Kombi Merkezi E-Ticaret Platformu`);
  console.log(`📡 Sunucu çalışıyor: http://localhost:${PORT}`);
  console.log(`🔑 Admin Paneli:    http://localhost:${PORT}/admin.html`);
  console.log(`🏪 Müşteri Mağaza:  http://localhost:${PORT}/index.html`);
  console.log(`👤 Bayi Portalı:    http://localhost:${PORT}/bayi.html\n`);
});

module.exports = app;
