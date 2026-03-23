const express = require('express');
const { getDb } = require('../database');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  const db = getDb();
  const cart = getOrCreateCart(db, req);
  if (cart.id === -1) return res.json({ cart_id: null, items: [] });
  const items = db.prepare(`
    SELECT ci.*, p.name, p.slug, p.sku, p.images, p.stock_status, p.stock_quantity,
           p.base_price, p.dealer_cash_price, p.dealer_card_price, p.is_hidden_price
    FROM cart_items ci JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = ?
  `).all(cart.id);
  const isDealer = req.user?.role === 'dealer';
  let subtotal = 0;
  
  const parsed = items.map(i => {
    const effective_price = isDealer && i.dealer_cash_price ? i.dealer_cash_price : i.base_price;
    const item_total = effective_price * i.quantity;
    subtotal += item_total;
    
    return {
      id: i.id,
      cart_id: i.cart_id,
      quantity: i.quantity,
      unit_price: effective_price,
      total_price: item_total,
      product: {
        id: i.product_id,
        name: i.name,
        slug: i.slug,
        sku: i.sku,
        images: tryParse(i.images, []),
        stock_status: i.stock_status,
        stock_quantity: i.stock_quantity
      }
    };
  });
  
  const tax_amount = subtotal * 0.20;
  const total_amount = subtotal + tax_amount;
  
  res.json({ cart_id: cart.id, items: parsed, subtotal, tax_amount, total_amount });
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
  // Use a more unique session id from header or generate one
  const sessionId = req.headers['x-session-id'] || req.headers['cookie']?.match(/sess=([^;]+)/)?.[1] || 'anon-' + Math.random().toString(36).slice(2, 9);

  try {
    let cart = userId
      ? db.prepare('SELECT * FROM carts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)
      : db.prepare('SELECT * FROM carts WHERE session_id = ? AND user_id IS NULL ORDER BY id DESC LIMIT 1').get(sessionId);

    if (!cart) {
      try {
        const result = db.prepare('INSERT INTO carts (user_id, session_id) VALUES (?,?)').run(userId, sessionId);
        cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(result.lastInsertRowid);
      } catch (insertErr) {
        // If insert failed (e.g., FK constraint), try to find any existing cart
        cart = db.prepare('SELECT * FROM carts ORDER BY id DESC LIMIT 1').get();
        if (!cart) throw insertErr;
      }
    }
    return cart;
  } catch (err) {
    console.error('getOrCreateCart error:', err.message);
    // Return a minimal cart-like object so routes don't crash
    return { id: -1 };
  }
}

function tryParse(val, def) { try { return JSON.parse(val); } catch { return def; } }

module.exports = router;

