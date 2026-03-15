const express = require('express');
const { getDb } = require('../database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// GET /api/cart
router.get('/', optionalAuth, (req, res) => {
  const db = getDb();
  const cart = getOrCreateCart(db, req);
  const items = db.prepare(`
    SELECT ci.*, p.name, p.slug, p.sku, p.images, p.stock_status, p.stock_quantity,
           p.base_price, p.dealer_cash_price, p.dealer_card_price, p.is_hidden_price
    FROM cart_items ci JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = ?
  `).all(cart.id);
  const isDealer = req.user?.role === 'dealer';
  const parsed = items.map(i => ({
    ...i,
    images: tryParse(i.images, []),
    effective_price: isDealer ? i.dealer_cash_price : i.base_price
  }));
  res.json({ cart_id: cart.id, items: parsed });
});

// POST /api/cart/add
router.post('/add', optionalAuth, (req, res) => {
  const db = getDb();
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Ürün ID gerekli' });

  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });

  if (product.is_hidden_price || product.stock_status === 'on_request' || product.stock_status === 'price_on_request') {
    return res.status(400).json({ error: 'Bu ürün için teklif isteyiniz' });
  }

  const isDealer = req.user?.role === 'dealer';
  const unit_price = isDealer ? product.dealer_cash_price : product.base_price;

  const cart = getOrCreateCart(db, req);
  const existing = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cart.id, product_id);

  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES (?,?,?,?)').run(cart.id, product_id, quantity, unit_price);
  }
  db.prepare('UPDATE carts SET updated_at=CURRENT_TIMESTAMP WHERE id=?').run(cart.id);
  res.json({ success: true, message: 'Ürün sepete eklendi' });
});

// PUT /api/cart/update
router.put('/update', optionalAuth, (req, res) => {
  const db = getDb();
  const { item_id, quantity } = req.body;
  const cart = getOrCreateCart(db, req);

  if (quantity <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(item_id, cart.id);
  } else {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?').run(quantity, item_id, cart.id);
  }
  res.json({ success: true });
});

// DELETE /api/cart/remove/:itemId
router.delete('/remove/:itemId', optionalAuth, (req, res) => {
  const db = getDb();
  const cart = getOrCreateCart(db, req);
  db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(req.params.itemId, cart.id);
  res.json({ success: true });
});

// DELETE /api/cart/clear
router.delete('/clear', optionalAuth, (req, res) => {
  const db = getDb();
  const cart = getOrCreateCart(db, req);
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
  res.json({ success: true });
});

function getOrCreateCart(db, req) {
  const userId = req.user?.id || null;
  const sessionId = req.headers['x-session-id'] || 'anon';

  let cart = userId
    ? db.prepare('SELECT * FROM carts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)
    : db.prepare('SELECT * FROM carts WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId);

  if (!cart) {
    const res = db.prepare('INSERT INTO carts (user_id, session_id) VALUES (?,?)').run(userId, sessionId);
    cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(res.lastInsertRowid);
  }
  return cart;
}

function tryParse(val, def) { try { return JSON.parse(val); } catch { return def; } }

module.exports = router;
