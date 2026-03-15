const { getDb } = require('./database');
const bcrypt = require('bcryptjs');

const db = getDb();

try {
  // Check if already seeded
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (adminExists) {
    console.log('✅ Veritabanı zaten tohumlanmış (seeded), atlanıyor.');
    process.exit(0);
  }

  // Clear existing
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM dealer_project_items; DELETE FROM dealer_projects; DELETE FROM product_cross_sells; DELETE FROM products; DELETE FROM categories; DELETE FROM brands; DELETE FROM users; DELETE FROM settings;');

  // Insert Settings
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('site_name', 'Klima Kombi Merkezi');
  insertSetting.run('tax_rate', '20');

  // Insert Admin User
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('Admin123!', salt);
  const insertUser = db.prepare('INSERT INTO users (uuid, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)');
  insertUser.run('u-admin', 'Sistem Yöneticisi', 'admin@klimakombimerkezi.com', hash, 'admin');

  // Insert Dealer User
  const dealerHash = bcrypt.hashSync('Bayi123!', salt);
  insertUser.run('u-dealer', 'Örnek Tesisat Ltd.', 'bayi@klimakombimerkezi.com', dealerHash, 'dealer');
  db.prepare('UPDATE users SET company_name=?, dealer_code=?, discount_rate=? WHERE uuid=?').run('Örnek Tesisat Ltd. Şti.', 'BAYI001', 15, 'u-dealer');

  // Insert Categories
  const insertCat = db.prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)');
  insertCat.run('Kombiler', 'kombi', 1);
  insertCat.run('Klimalar', 'klima', 2);
  insertCat.run('Kazanlar', 'kazan', 3);
  insertCat.run('Termostatlar', 'termostat', 4);
  const catRows = db.prepare('SELECT id, slug FROM categories').all();
  const getCatId = (slug) => catRows.find(c => c.slug === slug)?.id;

  // Insert Brands
  const insertBrand = db.prepare('INSERT INTO brands (name, slug) VALUES (?, ?)');
  insertBrand.run('Buderus', 'buderus');
  insertBrand.run('E.C.A.', 'eca');
  insertBrand.run('Viessmann', 'viessmann');
  insertBrand.run('Daikin', 'daikin');
  const brandRows = db.prepare('SELECT id, slug FROM brands').all();
  const getBrandId = (slug) => brandRows.find(b => b.slug === slug)?.id;

  // Insert Products
  const insertProduct = db.prepare(`
    INSERT INTO products (
      name, slug, sku, category_id, brand_id, 
      base_price, dealer_cash_price, dealer_card_price,
      stock_status, stock_quantity, supply_days,
      short_description, images, is_opportunity, is_hidden_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Product 1: Kombi (Normal)
  insertProduct.run(
    'Buderus Logamax Plus GB122i 24 kW Tam Yoğuşmalı Kombi', 'buderus-gb122i-24kw', 'BUD-GB122-24',
    getCatId('kombi'), getBrandId('buderus'),
    45000.00, 39500.00, 41000.00, // prices
    'in_stock', 15, 0, // stock
    '24 kW ısıtma ve 30 kW sıcak su kapasiteli, A sınıfı yüksek enerji verimli tam yoğuşmalı kombi.',
    JSON.stringify(['/images/no-image.png']), 0, 0
  );

  // Product 2: Klima (Opportunity)
  insertProduct.run(
    'Daikin Sensira 12000 BTU Inverter Duvar Tipi Klima', 'daikin-sensira-12k', 'DAI-SEN-12',
    getCatId('klima'), getBrandId('daikin'),
    32000.00, 26000.00, 27500.00,
    'in_stock', 5, 0,
    'Sınırlı stok fırsatıyla sessiz, ekonomik ve çevre dostu Sensira Inverter serisi.',
    JSON.stringify(['/images/no-image.png']), 1, 0
  );

  // Product 3: Kazan (On Request)
  insertProduct.run(
    'Viessmann Vitocrossal 200 87 kW Yer Tipi Yoğuşmalı Kazan', 'viessmann-vitocrossal-200-87kw', 'VIE-VC200-87',
    getCatId('kazan'), getBrandId('viessmann'),
    0, 0, 0, // prices hidden
    'on_request', 0, 15,
    'Merkezi ısıtma sistemleri için yüksek teknolojili tam yoğuşmalı çelik kazan.',
    JSON.stringify(['/images/no-image.png']), 0, 1
  );

  // Product 4: Termostat
  insertProduct.run(
    'E.C.A. Ert-176 Kablosuz Oda Termostatı', 'eca-ert-176-kablosuz', 'ECA-ERT176',
    getCatId('termostat'), getBrandId('eca'),
    1800.00, 1200.00, 1300.00,
    'in_stock', 120, 0,
    'Hassas sıcaklık kontrolü sağlayan kablosuz dijital oda termostatı.',
    JSON.stringify(['/images/no-image.png']), 0, 0
  );

  // Set Cross Sell
  const pRows = db.prepare('SELECT id, slug FROM products').all();
  const buderusId = pRows.find(p => p.slug === 'buderus-gb122i-24kw')?.id;
  const thermostatId = pRows.find(p => p.slug === 'eca-ert-176-kablosuz')?.id;
  if (buderusId && thermostatId) {
    db.prepare('INSERT INTO product_cross_sells (product_id, cross_sell_product_id) VALUES (?, ?)').run(buderusId, thermostatId);
  }

  // Insert Engineering Tools Data
  const insertTools = db.prepare('INSERT INTO engineering_tools (tool_type, data) VALUES (?, ?)');
  insertTools.run('boiler_rules', JSON.stringify({
    models: [
      { product_id: buderusId, power_kw: 24, min_area: 80, max_area: 160 }
    ]
  }));

  console.log('✅ Veritabanı başarıyla tohumlandı (Seeded).');
  console.log('Admin Bilgileri:');
  console.log('Email: admin@klimakombimerkezi.com');
  console.log('Şifre: Admin123!');
  console.log('\nBayi Bilgileri:');
  console.log('Email: bayi@klimakombimerkezi.com');
  console.log('Şifre: Bayi123!');

} catch (error) {
  console.error('❌ Tohumlama (Seeding) Hatası:', error);
}
