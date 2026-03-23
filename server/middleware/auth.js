const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'klimakombimerkezi-secret-2024';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      role: user.role,
      name: user.name,
      dealer_code: user.dealer_code,
      discount_rate: user.discount_rate
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Giriş yapınız' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getDb } = require('../database');
    const user = getDb().prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
    if (!user) throw new Error('User not found or inactive');
    req.user = decoded; // Keep the token payload or use full user DB object
    next();
  } catch (err) {
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum (Lütfen çıkış yapıp tekrar girin)' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Giriş yapınız' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }
    next();
  };
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token;
  if (token) {
    try { 
      const decoded = jwt.verify(token, JWT_SECRET);
      const { getDb } = require('../database');
      const user = getDb().prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
      if (user) req.user = decoded;
    } catch {}
  }
  next();
}

module.exports = { generateToken, requireAuth, requireRole, optionalAuth, JWT_SECRET };
