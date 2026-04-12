const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../database');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/products - list with filters
router.get('/', optionalAuth, (req, res) => {
  const db = getDb();
  const { category, brand, search, opportunity, page = 1, limit = 20, sort = 'id' } = req.query;
  const offset = (page - 1) * limit;

  let where = ['p.is_active = 1'];
  let params = [];

  if (category) { where.push('c.slug = ?'); params.push(category); }
  if (brand) { where.push('b.slug = ?'); params.push(brand); }
  if (search) { where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (opportunity === '1') { where.push('p.is_opportunity = 1'); }
  if (req.query.stock_status) { where.push('p.stock_status = ?'); params.push(req.query.stock_status); }

  // Dynamic specification filters
  const reserved = ['category', 'brand', 'search', 'opportunity', 'page', 'limit', 'sort', 'stock_status'];
  for (const [k, v] of Object.entries(req.query)) {
    if (!reserved.includes(k) && v) {
      where.push(`json_extract(p.specifications, '$.' || ?) = ?`);
      params.push(k, v);
    }
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortMap = { id: 'p.id', price: 'p.base_price', name: 'p.name' };
  const orderBy = sortMap[sort] || 'p.id';

  const total = db.prepare(`
    SELECT COUNT(*) as cnt FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    ${whereClause}
  `).get(...params)?.cnt || 0;

  const products = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           b.name as brand_name, b.slug as brand_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    ${whereClause}
    ORDER BY ${orderBy} ASC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  const isDealer = req.user?.role === 'dealer';
  const sanitized = products.map(p => sanitizeProduct(p, isDealer));
  res.json({ products: sanitized, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/products/:slug
router.get('/:slug', optionalAuth, (req, res) => {
  const db = getDb();
  const product = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
           b.name as brand_name, b.slug as brand_slug
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE p.slug = ? AND p.is_active = 1
  `).get(req.params.slug);

  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });

  const isDealer = req.user?.role === 'dealer';
  const isStaff = ['admin', 'employee'].includes(req.user?.role);

  // Cross-sell products
  const crossSells = db.prepare(`
    SELECT p2.id, p2.name, p2.slug, p2.images, p2.base_price, p2.stock_status, p2.is_hidden_price
    FROM product_cross_sells pcs
    JOIN products p2 ON pcs.related_product_id = p2.id
    WHERE pcs.product_id = ? AND p2.is_active = 1
  `).all(product.id);

  // Bundle components
  let components = [];
  if (product.is_bundle) {
    components = db.prepare(`
      SELECT pb.quantity, p2.id, p2.name, p2.slug, p2.sku, p2.stock_quantity
      FROM product_bundles pb
      JOIN products p2 ON pb.component_product_id = p2.id
      WHERE pb.parent_product_id = ?
    `).all(product.id);
  }

  // Installment plans
  const installmentPlans = db.prepare('SELECT * FROM installment_plans WHERE is_active = 1 ORDER BY installments').all();

  res.json({
    product: sanitizeProduct(product, isDealer, isStaff),
    crossSells: crossSells.map(p => sanitizeProduct(p, isDealer)),
    components,
    installmentPlans
  });
});

// Helper to auto-calculate prices
function autoCalcPrices(db, overrides) {
  let { cost_price, base_price, dealer_cash_price, dealer_card_price } = overrides;
  cost_price = parseFloat(cost_price) || 0;
  base_price = parseFloat(base_price) || 0;
  dealer_cash_price = parseFloat(dealer_cash_price) || 0;
  dealer_card_price = parseFloat(dealer_card_price) || 0;

  if (cost_price > 0 && (!base_price || !dealer_cash_price || !dealer_card_price)) {
    const settings = {};
    db.prepare("SELECT key, value FROM settings WHERE key IN ('retail_margin', 'dealer_cash_margin', 'dealer_card_margin')")
      .all().forEach(r => settings[r.key] = parseFloat(r.value) || 0);

    if (!base_price) base_price = cost_price * (1 + (settings.retail_margin||40)/100);
    if (!dealer_cash_price) dealer_cash_price = cost_price * (1 + (settings.dealer_cash_margin||15)/100);
    if (!dealer_card_price) dealer_card_price = cost_price * (1 + (settings.dealer_card_margin||20)/100);
  }
  return { cost_price, base_price, dealer_cash_price, dealer_card_price };
}

// POST /api/products - admin only
router.post('/', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  try {
    const db = getDb();
    const { name, sku, description, short_description, category_id, brand_id, stock_status, stock_quantity, supply_days,
            is_hidden_price, is_opportunity, is_bundle, images, specifications, meta_title, meta_description } = req.body;

    const prices = autoCalcPrices(db, req.body);
    const slug = slugify(name);
    const uuid = uuidv4();

    const result = db.prepare(`
      INSERT INTO products (uuid, name, slug, sku, description, short_description, category_id, brand_id,
        cost_price, base_price, dealer_cash_price, dealer_card_price, stock_status, stock_quantity, supply_days,
        is_hidden_price, is_opportunity, is_bundle, images, specifications, meta_title, meta_description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(uuid, name, slug, sku || null, description || '', short_description || '',
           category_id || null, brand_id || null, prices.cost_price, prices.base_price, prices.dealer_cash_price,
           prices.dealer_card_price, stock_status || 'in_stock', stock_quantity || 0, supply_days || 0,
           is_hidden_price ? 1 : 0, is_opportunity ? 1 : 0, is_bundle ? 1 : 0,
           JSON.stringify(images || []), JSON.stringify(specifications || {}),
           meta_title || name, meta_description || '');

    res.json({ id: result.lastInsertRowid, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id - admin only
router.put('/:id', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  try {
    const db = getDb();
    const { name, sku, description, short_description, category_id, brand_id, stock_status, stock_quantity, supply_days,
            is_hidden_price, is_opportunity, is_bundle, is_active, images, specifications,
            meta_title, meta_description } = req.body;

    const prices = autoCalcPrices(db, req.body);

    db.prepare(`
      UPDATE products SET name=?,sku=?,description=?,short_description=?,category_id=?,brand_id=?,
        cost_price=?,base_price=?,dealer_cash_price=?,dealer_card_price=?,stock_status=?,stock_quantity=?,supply_days=?,
        is_hidden_price=?,is_opportunity=?,is_bundle=?,is_active=?,images=?,specifications=?,
        meta_title=?,meta_description=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name, sku||null, description||'', short_description||'', category_id||null, brand_id||null,
           prices.cost_price, prices.base_price, prices.dealer_cash_price, prices.dealer_card_price, stock_status||'in_stock',
           stock_quantity||0, supply_days||0, is_hidden_price?1:0, is_opportunity?1:0, is_bundle?1:0,
           is_active!==false?1:0, JSON.stringify(images||[]), JSON.stringify(specifications||{}),
           meta_title||null, meta_description||null, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id - admin
router.delete('/:id', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE products SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/products/:id/cross-sells - admin
router.post('/:id/cross-sells', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { related_ids } = req.body;
  db.prepare('DELETE FROM product_cross_sells WHERE product_id=?').run(req.params.id);
  const insert = db.prepare('INSERT INTO product_cross_sells (product_id, related_product_id) VALUES (?,?)');
  for (const rid of (related_ids || [])) insert.run(req.params.id, rid);
  res.json({ success: true });
});

// POST /api/products/:id/bundles - admin
router.post('/:id/bundles', requireAuth, requireRole('admin', 'employee'), (req, res) => {
  const db = getDb();
  const { components } = req.body;
  db.prepare('DELETE FROM product_bundles WHERE parent_product_id=?').run(req.params.id);
  const insert = db.prepare('INSERT INTO product_bundles (parent_product_id, component_product_id, quantity) VALUES (?,?,?)');
  for (const c of (components || [])) insert.run(req.params.id, c.product_id, c.quantity || 1);
  res.json({ success: true });
});

// POST /api/products/:id/price-request
router.post('/:id/price-request', optionalAuth, (req, res) => {
  const db = getDb();
  const { name, email, phone, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Ad ve e-posta gerekli' });
  db.prepare('INSERT INTO price_requests (product_id, user_id, name, email, phone, message) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, req.user?.id || null, name, email, phone || null, message || null);
  res.json({ success: true, message: 'Fiyat talebiniz alındı, en kısa sürede dönüş yapılacaktır.' });
});

function sanitizeProduct(p, isDealer, isStaff) {
  const product = { ...p };
  if (typeof product.images === 'string') { try { product.images = JSON.parse(product.images); } catch { product.images = []; } }
  if (typeof product.specifications === 'string') { try { product.specifications = JSON.parse(product.specifications); } catch { product.specifications = {}; } }

  if (!isDealer && !isStaff) {
    delete product.dealer_cash_price;
    delete product.dealer_card_price;
  }
  if (product.is_hidden_price && !isStaff) {
    product.base_price = null;
    product.dealer_cash_price = null;
    product.dealer_card_price = null;
  }
  return product;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = router;
