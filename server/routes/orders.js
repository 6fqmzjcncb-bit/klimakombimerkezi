const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// GET /api/orders - kullanıcının siparişleri
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const isAdmin = req.user.role === 'admin';
  const isEmployee = req.user.role === 'employee';

  let orders;
  if (isAdmin || isEmployee) {
    const { status, page = 1, limit = 20 } = req.query;
    let where = [];
    let params = [];
    if (status) { where.push('o.status = ?'); params.push(status); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;
    orders = db.prepare(`
      SELECT o.*, u.name as user_name, u.email as user_email, u.role as user_role,
             u.company_name, u.phone
      FROM orders o LEFT JOIN users u ON o.user_id = u.id
      ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset));
  } else {
    orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  }

  // Attach items
  const withItems = orders.map(order => ({
    ...order,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id)
  }));
  res.json(withItems);
});

// GET /api/orders/:uuid
router.get('/:uuid', requireAuth, (req, res) => {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, u.name as user_name, u.email as user_email, u.phone, u.company_name,
           u.role as user_role, u.discount_rate
    FROM orders o LEFT JOIN users u ON o.user_id = u.id
    WHERE o.uuid = ?
  `).get(req.params.uuid);

  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  const isOwner = order.user_id === req.user.id;
  const isStaff = ['admin', 'employee'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: 'Yetkisiz erişim' });

  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  order.notes = db.prepare(`
    SELECT n.*, u.name as author_name, u.role as author_role
    FROM order_notes n JOIN users u ON n.user_id = u.id
    WHERE n.order_id = ? ${!isStaff ? 'AND n.is_internal = 0' : ''}
    ORDER BY n.created_at ASC
  `).all(order.id);
  order.files = db.prepare('SELECT * FROM order_files WHERE order_id = ?').all(order.id);

  res.json(order);
});

// POST /api/orders - sipariş oluştur (sepetten)
router.post('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { payment_method, shipping_address, billing_address, notes } = req.body;
    if (!payment_method || !shipping_address) return res.status(400).json({ error: 'Ödeme yöntemi ve teslimat adresi gerekli' });

    // Cart items — look up by user_id first, then session header
    let cart = db.prepare('SELECT * FROM carts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    if (!cart) {
      const sessionId = req.headers['x-session-id'];
      if (sessionId) cart = db.prepare('SELECT * FROM carts WHERE session_id = ? ORDER BY id DESC LIMIT 1').get(sessionId);
    }
    if (!cart) return res.status(400).json({ error: 'Sepet bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin.' });

    // Assign cart to user if not already
    if (!cart.user_id) {
      db.prepare('UPDATE carts SET user_id = ? WHERE id = ?').run(req.user.id, cart.id);
    }

    const cartItems = db.prepare(`
      SELECT ci.*, p.name, p.sku, p.base_price, p.dealer_cash_price, p.dealer_card_price, p.stock_status
      FROM cart_items ci JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
    `).all(cart.id);

    if (cartItems.length === 0) return res.status(400).json({ error: 'Sepet boş' });

    const isDealer = req.user.role === 'dealer';
    const taxRate = parseFloat(db.prepare('SELECT value FROM settings WHERE key=?').get('tax_rate')?.value || '20') / 100;
    const threshold = parseFloat(db.prepare('SELECT value FROM settings WHERE key=?').get('high_value_order_threshold')?.value || '50000');

    let subtotal = 0;
    const orderItems = cartItems.map(item => {
      const price = isDealer
        ? (payment_method === 'credit_card' ? item.dealer_card_price : item.dealer_cash_price)
        : item.unit_price;
      const total = price * item.quantity;
      subtotal += total;
      return { product_id: item.product_id, product_name: item.name, product_sku: item.sku, quantity: item.quantity, unit_price: price, total_price: total };
    });

    const discountAmount = 0;
    const taxAmount = (subtotal - discountAmount) * taxRate;
    const totalAmount = subtotal - discountAmount + taxAmount;

    // High-value orders go to pending_stock_check
    const needsApproval = totalAmount >= threshold || payment_method === 'credit_card' && totalAmount >= threshold;
    const status = needsApproval ? 'pending_stock_check' : 'confirmed';

    const uuid = uuidv4();
    const orderResult = db.prepare(`
      INSERT INTO orders (uuid, user_id, status, payment_method, subtotal, discount_amount, tax_amount, total_amount, shipping_address, billing_address, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(uuid, req.user.id, status, payment_method, subtotal, discountAmount, taxAmount, totalAmount,
           JSON.stringify(shipping_address), JSON.stringify(billing_address || shipping_address), notes || null);

    const orderId = orderResult.lastInsertRowid;
    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?,?)');
    for (const item of orderItems) {
      insertItem.run(orderId, item.product_id, item.product_name, item.product_sku, item.quantity, item.unit_price, item.total_price);

      // Deduct stock for bundle components
      const product = db.prepare('SELECT is_bundle FROM products WHERE id=?').get(item.product_id);
      if (product?.is_bundle) {
        const components = db.prepare('SELECT * FROM product_bundles WHERE parent_product_id=?').all(item.product_id);
        for (const comp of components) {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity > 0').run(comp.quantity * item.quantity, comp.component_product_id);
        }
      } else {
        db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity > 0').run(item.quantity, item.product_id);
      }
    }

    // Clear cart
    db.prepare('DELETE FROM cart_items WHERE cart_id=?').run(cart.id);

    // Notify admin if needs approval
    if (needsApproval) {
      const admins = db.prepare('SELECT id FROM users WHERE role = ?').all('admin');
      const stmt = db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)');
      for (const admin of admins) {
        stmt.run(admin.id, 'Yüksek Tutarlı Sipariş', `Sipariş #${uuid.slice(0, 8)} onay bekliyor (${totalAmount.toFixed(2)} ₺)`, 'warning', `/admin/orders/${uuid}`);
      }
    }

    res.json({ success: true, uuid, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:uuid/status - admin/employee
router.put('/:uuid/status', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { status, payment_link, admin_note } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE uuid=?').get(req.params.uuid);
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  const validStatuses = ['pending','pending_stock_check','payment_link_sent','project_discount_set','confirmed','processing','shipped','delivered','cancelled','refunded'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Geçersiz statü' });

  db.prepare('UPDATE orders SET status=?, payment_link=?, updated_at=CURRENT_TIMESTAMP WHERE uuid=?')
    .run(status, payment_link || order.payment_link, req.params.uuid);

  // Notify customer
  const notifMap = {
    payment_link_sent: { title: 'Ödeme Linki Gönderildi', msg: 'Siparişiniz onaylandı, ödeme yapabilirsiniz.', type: 'success' },
    confirmed: { title: 'Sipariş Onaylandı', msg: 'Siparişiniz onaylandı.', type: 'success' },
    shipped: { title: 'Sipariş Kargoya Verildi', msg: 'Siparişiniz kargoya verildi.', type: 'info' },
    delivered: { title: 'Sipariş Teslim Edildi', msg: 'Siparişiniz teslim edildi.', type: 'success' },
    cancelled: { title: 'Sipariş İptal Edildi', msg: admin_note || 'Siparişiniz iptal edildi.', type: 'error' }
  };

  if (notifMap[status] && order.user_id) {
    const n = notifMap[status];
    db.prepare('INSERT INTO notifications (user_id, title, message, type, link) VALUES (?,?,?,?,?)')
      .run(order.user_id, n.title, n.msg, n.type, `/hesabim/siparisler/${order.uuid}`);
  }

  res.json({ success: true });
});

// POST /api/orders/:uuid/notes - add note
router.post('/:uuid/notes', requireAuth, (req, res) => {
  const db = getDb();
  const { note, is_internal = false } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE uuid=?').get(req.params.uuid);
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  const isStaff = ['admin', 'employee'].includes(req.user.role);
  if (order.user_id !== req.user.id && !isStaff) return res.status(403).json({ error: 'Yetkisiz' });

  db.prepare('INSERT INTO order_notes (order_id, user_id, note, is_internal) VALUES (?,?,?,?)')
    .run(order.id, req.user.id, note, is_internal && isStaff ? 1 : 0);
  res.json({ success: true });
});

// POST /api/orders/:uuid/items - add order item (admin/employee)
router.post('/:uuid/items', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { product_id, product_name, quantity, unit_price } = req.body;
  
  if (!product_name || !quantity || quantity <= 0 || unit_price == null || unit_price < 0) {
    return res.status(400).json({ error: 'Geçersiz parametreler' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE uuid=?').get(req.params.uuid);
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  const total_price = quantity * unit_price;
  
  db.transaction(() => {
    // 1. Ekleme
    db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(order.id, product_id || null, product_name, quantity, unit_price, total_price);

    // 2. Sipariş toplamını güncelle
    const newSubtotal = order.subtotal + total_price;
    const taxRate = 0.20; // 20%
    const newTax = newSubtotal * taxRate;
    const newTotal = newSubtotal + newTax - (order.discount_amount || 0);

    db.prepare('UPDATE orders SET subtotal=?, tax_amount=?, total_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(newSubtotal, newTax, newTotal, order.id);

    // Opsiyonel: Admin notu ekle
    db.prepare(`
      INSERT INTO order_notes (order_id, user_id, note, is_internal)
      VALUES (?, ?, ?, 1)
    `).run(order.id, req.user.id, `Siparişe manuel kalem eklendi: ${product_name} (${quantity} adet, ${total_price} ₺)`);
  })();

  res.json({ success: true, subtotal: order.subtotal + total_price });
});

module.exports = router;
