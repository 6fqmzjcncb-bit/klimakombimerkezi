const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'customer', company_name, tax_number, phone, address, dealer_code } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Bu e-posta adresi zaten kayıtlı' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const uuid = uuidv4();
    const allowedRoles = ['customer', 'dealer'];
    const safeRole = allowedRoles.includes(role) ? role : 'customer';
    const generatedDealerCode = safeRole === 'dealer' ? (dealer_code || `BAY-${Date.now()}`) : null;

    const result = db.prepare(`
      INSERT INTO users (uuid, name, email, password, role, company_name, tax_number, phone, address, dealer_code, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuid, name, email, hashedPassword, safeRole, company_name || null, tax_number || null, phone || null, address || null, generatedDealerCode, safeRole === 'dealer' ? 0 : 1);

    if (safeRole === 'dealer') {
      return res.json({ pending: true, message: 'Bayi başvurunuz alındı. Yönetici onayından sonra giriş yapabilirsiniz.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);
    
    // Merge cart
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
      db.prepare('UPDATE carts SET user_id = ? WHERE session_id = ? AND user_id IS NULL').run(user.id, sessionId);
    }

    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-posta ve şifre gerekli' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user) return res.status(401).json({ error: 'Geçersiz e-posta veya şifre' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Geçersiz e-posta veya şifre' });

    const token = generateToken(user);
    
    // Merge cart
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
      db.prepare('UPDATE carts SET user_id = ? WHERE session_id = ? AND user_id IS NULL').run(user.id, sessionId);
    }

    res.json({ token, user: safeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  res.json(safeUser(user));
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, phone, address, company_name, tax_number, current_password, new_password } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (new_password) {
      const valid = await bcrypt.compare(current_password, user.password);
      if (!valid) return res.status(400).json({ error: 'Mevcut şifre yanlış' });
      const hashed = await bcrypt.hash(new_password, 10);
      db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashed, req.user.id);
    }

    db.prepare(`
      UPDATE users SET name=?, phone=?, address=?, company_name=?, tax_number=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name || user.name, phone || user.phone, address || user.address,
           company_name || user.company_name, tax_number || user.tax_number, req.user.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(safeUser(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Profil güncellenirken hata oluştu' });
  }
});

// ===== ADDRESS BOOK =====
// GET /api/auth/addresses
router.get('/addresses', requireAuth, (req, res) => {
  const db = getDb();
  const addresses = db.prepare('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id ASC').all(req.user.id);
  res.json(addresses);
});

// POST /api/auth/addresses
router.post('/addresses', requireAuth, (req, res) => {
  const db = getDb();
  const { title, name, phone, city, district, address, is_default = 0 } = req.body;
  if (!name || !city || !address) return res.status(400).json({ error: 'Ad, şehir ve adres gerekli' });
  if (is_default) db.prepare('UPDATE user_addresses SET is_default=0 WHERE user_id=?').run(req.user.id);
  const r = db.prepare('INSERT INTO user_addresses (user_id, title, name, phone, city, district, address, is_default) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.user.id, title || 'Adresim', name, phone || null, city, district || null, address, is_default ? 1 : 0);
  res.json({ id: r.lastInsertRowid });
});

// PUT /api/auth/addresses/:id
router.put('/addresses/:id', requireAuth, (req, res) => {
  const db = getDb();
  const addr = db.prepare('SELECT * FROM user_addresses WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!addr) return res.status(404).json({ error: 'Adres bulunamadı' });
  const { title, name, phone, city, district, address, is_default } = req.body;
  if (is_default) db.prepare('UPDATE user_addresses SET is_default=0 WHERE user_id=?').run(req.user.id);
  db.prepare('UPDATE user_addresses SET title=?,name=?,phone=?,city=?,district=?,address=?,is_default=? WHERE id=?')
    .run(title||addr.title, name||addr.name, phone||addr.phone, city||addr.city, district||addr.district, address||addr.address, is_default?1:0, addr.id);
  res.json({ success: true });
});

// DELETE /api/auth/addresses/:id
router.delete('/addresses/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_addresses WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

function safeUser(u) {
  const { password, ...safe } = u;
  return safe;
}

module.exports = router;
