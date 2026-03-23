const { getDb } = require('./database');
const bcrypt = require('bcryptjs');

const db = getDb();

try {
  // Handle RESET_DB
  const shouldReset = process.env.RESET_DB === 'true';

  // Hata yapmamak adına her sunucu başladığında DB'yi sıfırlamaya zorluyoruz
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  
  if (adminExists) {
      console.log('🔄 Mevcut veriler temizleniyor ve test datası basılıyor...');
  } else {
      console.log('🔄 İlk veri tohumlaması başlıyor...');
  }
  
  // Clear existing data (disable FK checks to allow deletes in any order)
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM discount_requests;
    DELETE FROM dealer_project_items;
    DELETE FROM dealer_projects;
    DELETE FROM order_notes;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM cart_items;
    DELETE FROM carts;
    DELETE FROM product_cross_sells;
    DELETE FROM product_bundles;
    DELETE FROM boiler_models;
    DELETE FROM combi_models;
    DELETE FROM quote_requests;
    DELETE FROM notifications;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM brands;
    DELETE FROM users;
    DELETE FROM settings;
    PRAGMA foreign_keys = ON;
  `);

  // Insert Settings
  const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('site_name', 'Klima Kombi Merkezi');
  insertSetting.run('tax_rate', '20');

  // Insert Admin User
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync('Admin123!', salt);
  const insertUser = db.prepare('INSERT INTO users (uuid, name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?, 1)');
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
  insertCat.run('Radyatörler', 'radyator', 5);
  insertCat.run('VRF Sistemleri', 'vrf-sistemleri', 6);
  insertCat.run('Paket Sistemler', 'paket-sistemler', 7);
  const catRows = db.prepare('SELECT id, slug FROM categories').all();
  const getCatId = (slug) => catRows.find(c => c.slug === slug)?.id;

  // Insert Brands
  const insertBrand = db.prepare('INSERT INTO brands (name, slug) VALUES (?, ?)');
  insertBrand.run('Buderus', 'buderus');
  insertBrand.run('E.C.A.', 'eca');
  insertBrand.run('Viessmann', 'viessmann');
  insertBrand.run('Daikin', 'daikin');
  insertBrand.run('Bosch', 'bosch');
  insertBrand.run('Baymak', 'baymak');
  insertBrand.run('Gree', 'gree');
  insertBrand.run('Mitsubishi', 'mitsubishi');
  const brandRows = db.prepare('SELECT id, slug FROM brands').all();
  const getBrandId = (slug) => brandRows.find(b => b.slug === slug)?.id;

  // Insert Products
  const insertProduct = db.prepare(`
    INSERT INTO products (
      uuid, name, slug, sku, category_id, brand_id, 
      base_price, dealer_cash_price, dealer_card_price,
      stock_status, stock_quantity, supply_days,
      short_description, description, images, is_opportunity, is_hidden_price, is_bundle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // --- KOMBİLER ---
  insertProduct.run(
    'p-bud-01', 'Buderus Logamax Plus GB122i 24 kW Tam Yoğuşmalı Kombi', 'buderus-gb122i-24kw', 'BUD-GB122-24',
    getCatId('kombi'), getBrandId('buderus'),
    45000.00, 39500.00, 41000.00, 'in_stock', 15, 0,
    '24 kW ısıtma kapasiteli, yüksek verimli tam yoğuşmalı kombi.',
    '<p>Buderus Logamax serisi, 24 kW kapasitesi ile 120-150 m2 evler için mükemmel çözümdür. A sınıfı enerji verimliliği sağlar.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );

  insertProduct.run(
    'p-eca-01', 'E.C.A. Proteus Premix 28 kW Tam Yoğuşmalı Kombi', 'eca-proteus-premix-28kw', 'ECA-PRO-28',
    getCatId('kombi'), getBrandId('eca'),
    38000.00, 31000.00, 32500.00, 'in_stock', 25, 0,
    'ErP yönetmeliğine uygun 28 kW kapasiteli E.C.A kombi.',
    '<p>Yüksek kapasiteli, sessiz çalışan 28 kW kombi. Büyük daireler ve çift banyolu evler için ideal.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 1, 0, 0
  );

  insertProduct.run(
    'p-bos-01', 'Bosch Condens 2200i W 24/25 kW Tam Yoğuşmalı Kombi', 'bosch-condens-2200i', 'BOS-CON-2200',
    getCatId('kombi'), getBrandId('bosch'),
    42000.00, 36000.00, 37500.00, 'out_of_stock', 0, 3,
    'Kompakt tasarımı ile dar alanlar için yüksek verimli kombi.',
    '<p>Bosch teknolojisiyle üretilmiş, fısıltı sessizliğinde çalışan yoğuşmalı kombi.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );

  insertProduct.run(
    'p-vie-01', 'Viessmann Vitodens 050-W 25 kW Kombi', 'viessmann-vitodens-050-25kw', 'VIE-VD050-25',
    getCatId('kombi'), getBrandId('viessmann'),
    48000.00, 42000.00, 43500.00, 'in_stock', 8, 0,
    'Alman teknolojisi, dayanıklı paslanmaz çelik eşanjörlü.',
    '<p>Viessmann kalitesiyle uzun ömürlü, akıllı Wi-Fi bağlantısı opsiyonlu kombi.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );


  // --- KLİMALAR ---
  insertProduct.run(
    'p-dai-01', 'Daikin Sensira 12000 BTU Inverter Duvar Tipi Klima', 'daikin-sensira-12k', 'DAI-SEN-12',
    getCatId('klima'), getBrandId('daikin'),
    32000.00, 26000.00, 27500.00, 'in_stock', 40, 0,
    'Sınırlı stok fırsatıyla sessiz, ekonomik Sensira Inverter serisi.',
    '<p>A++ enerji verimliliği, R32 soğutucu akışkan, titanyum apatit koku giderici filtre.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 1, 0, 0
  );

  insertProduct.run(
    'p-mit-01', 'Mitsubishi Heavy SRK35ZSP-W 12000 BTU Klima', 'mitsubishi-srk35zsp', 'MIT-SRK35',
    getCatId('klima'), getBrandId('mitsubishi'),
    35000.00, 29000.00, 30500.00, 'in_stock', 12, 0,
    'Yüksek performans ve sessizlik bir arada.',
    '<p>Japon mühendisliği, kendi kendini temizleme fonksiyonu ve jet hava akımı teknolojisi.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );

  insertProduct.run(
    'p-gre-01', 'Gree Fairy 18000 BTU A++ Inverter Klima', 'gree-fairy-18k', 'GRE-FAI-18',
    getCatId('klima'), getBrandId('gree'),
    42000.00, 34500.00, 36000.00, 'on_request', 0, 5,
    'Büyük salonlar için geniş kapasiteli Inverter klima.',
    '<p>Gree Fairy serisi, dahili Wi-Fi modülü ve 7 kademeli fan hızı ile üstün konfor sunar.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Gree+Klima']), 0, 0, 0
  );


  // --- KAZANLAR / MERKEZİ SİSTEMLER (GİZLİ FİYATLAR) ---
  insertProduct.run(
    'p-vie-02', 'Viessmann Vitocrossal 200 CM2 87 kW Yoğuşmalı Kazan', 'viessmann-vitocrossal-200-87kw', 'VIE-VC200-87',
    getCatId('kazan'), getBrandId('viessmann'),
    0, 0, 0, 'on_request', 0, 15,
    'Merkezi ısıtma sistemleri için teknolojili tam yoğuşmalı çelik kazan.',
    '<p>Büyük apartmanlar, oteller ve iş merkezleri için geliştirilmiş, paslanmaz çelikten üretilen uzun ömürlü kazan. İstenirse kaskad bağlanabilir.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 1, 0
  );

  insertProduct.run(
    'p-bud-02', 'Buderus Logano plus GB312 280 kW Yer Tipi Yoğuşmalı Kazan', 'buderus-logano-gb312-280kw', 'BUD-GB312-280',
    getCatId('kazan'), getBrandId('buderus'),
    0, 0, 0, 'on_request', 0, 30,
    'Alüminyum döküm eşanjörlü, yüksek kapasiteli yer tipi kazan.',
    '<p>Sanayi tesisleri ve büyük siteler için tasarlanmış kompakt ve yüksek güçlü kazan sistemi.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Kazan']), 0, 1, 0
  );

  insertProduct.run(
    'p-bay-01', 'Baymak Lectus 115 Duvar Tipi Premix Yoğuşmalı Kaskad Kazan', 'baymak-lectus-115', 'BAY-LEC-115',
    getCatId('kazan'), getBrandId('baymak'),
    115000.00, 95000.00, 98000.00, 'in_stock', 3, 0,
    'Kaskad sistemler için modüler 115 kW kapasiteli duvar tipi kazan.',
    '<p>Kaskad panel üzerinden 15 cihaza kadar paralel çalışma imkanı. Paslanmaz çelik eşanjör.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );


  // --- VRF SİSTEMLERİ ---
  insertProduct.run(
    'p-dai-02', 'Daikin VRV IV+ S Serisi Dış Ünite 5 HP', 'daikin-vrv-iv-5hp', 'DAI-VRV-5HP',
    getCatId('vrf-sistemleri'), getBrandId('daikin'),
    0, 0, 0, 'on_request', 0, 20,
    'Villalar ve küçük ticari binalar için kompakt dış ünite.',
    '<p>VRV IV teknolojisi: değişken soğutucu akışkan sıcaklığı, montaj kolaylığı, ince tasarım.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Daikin+VRF']), 0, 1, 0
  );


  // --- YARDIMCI / DİĞER ÜRÜNLER ---
  insertProduct.run(
    'p-eca-02', 'E.C.A. Ert-176 Kablosuz Oda Termostatı', 'eca-ert-176-kablosuz', 'ECA-ERT176',
    getCatId('termostat'), getBrandId('eca'),
    1800.00, 1200.00, 1300.00, 'in_stock', 120, 0,
    'Hassas sıcaklık kontrolü sağlayan kablosuz dijital oda termostatı.',
    '<p>0.5 derece hassasiyet, pil azaldı uyarısı, günlük programlama özellikleri.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );

  insertProduct.run(
    'p-dan-01', 'Danfoss Termostatik Radyatör Vanası Papatya', 'danfoss-termostatik-vana', 'DAN-VANA-01',
    getCatId('termostat'), getBrandId('viessmann'),
    450.00, 300.00, 320.00, 'in_stock', 500, 0,
    'Radyatör bazlı sıcaklık kontrolü.',
    '<p>Doğalgaz tasarrufu sağlayan sıvı sensörlü termostatik radyatör valfi.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );

  insertProduct.run(
    'p-eca-03', 'E.C.A. 600x1000 PKKP Tip 22 Panel Radyatör', 'eca-panel-600x1000', 'ECA-RAD-610',
    getCatId('radyator'), getBrandId('eca'),
    2500.00, 1900.00, 2000.00, 'in_stock', 150, 0,
    '1.2 mm saç kalınlığı ile uzun ömürlü beyaz panel radyatör.',
    '<p>TS EN 442 standartlarında üretilmiş 10 yıl garantili ısı yayan panel petek.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 0, 0, 0
  );


  // --- PAKET SİSTEMLER (BUNDLE) ---
  insertProduct.run(
    'p-bun-01', 'Buderus 24 kW Yoğuşmalı Kombi + Tesisat Başlangıç Paketi', 'buderus-24kw-baslangic-paketi', 'BUN-BUD-01',
    getCatId('paket-sistemler'), getBrandId('buderus'),
    49000.00, 42000.00, 43500.00, 'in_stock', 10, 0,
    'Kombi + Termostat + Vana bir arada avantajlı başlangıç paketi.',
    '<p>Evinize tam set çözüm: Buderus GB122i 24 kW Kombi, E.C.A Kablosuz Termostat ve 4 adet Danfoss Vana içeren tasarruf paketi.</p>',
    JSON.stringify(['https://placehold.co/800x800/f8fafc/1e3a8a.png?text=Klima+Kombi']), 1, 0, 1
  );

  // Set Bundle Components
  const pRows = db.prepare('SELECT id, slug FROM products').all();
  const buderusId = pRows.find(p => p.slug === 'buderus-gb122i-24kw')?.id;
  const thermostatId = pRows.find(p => p.slug === 'eca-ert-176-kablosuz')?.id;
  const radValfId = pRows.find(p => p.slug === 'danfoss-termostatik-vana')?.id;
  const bundleId = pRows.find(p => p.slug === 'buderus-24kw-baslangic-paketi')?.id;

  if (bundleId && buderusId && thermostatId && radValfId) {
    const isBundle = db.prepare('INSERT INTO product_bundles (parent_product_id, component_product_id, quantity) VALUES (?, ?, ?)');
    isBundle.run(bundleId, buderusId, 1);
    isBundle.run(bundleId, thermostatId, 1);
    isBundle.run(bundleId, radValfId, 4);
  }

  // Set Cross Sell
  if (buderusId && thermostatId) {
    db.prepare('INSERT INTO product_cross_sells (product_id, related_product_id) VALUES (?, ?)').run(buderusId, thermostatId);
    db.prepare('INSERT INTO product_cross_sells (product_id, related_product_id) VALUES (?, ?)').run(buderusId, radValfId);
  }

  // Insert Engineering Tools Data (into proper boiler_models table)
  const boilerId1 = pRows.find(p => p.slug === 'viessmann-vitocrossal-200-87kw')?.id;
  const boilerId2 = pRows.find(p => p.slug === 'buderus-logano-gb312-280kw')?.id;
  const combiId1 = pRows.find(p => p.slug === 'eca-proteus-premix-28kw')?.id;

  const insertBoilerModel = db.prepare('INSERT INTO boiler_models (product_id, power_kw, min_area, max_area) VALUES (?, ?, ?, ?)');
  if (buderusId)  insertBoilerModel.run(buderusId, 24, 80, 160);
  if (combiId1)   insertBoilerModel.run(combiId1, 28, 160, 250);
  if (boilerId1)  insertBoilerModel.run(boilerId1, 87, 800, 1500);
  if (boilerId2)  insertBoilerModel.run(boilerId2, 280, 2500, 5000);

  const insertCombiModel = db.prepare('INSERT INTO combi_models (product_id, power_kw, min_rooms, max_rooms, min_bathrooms, max_bathrooms, min_area, max_area) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  if (buderusId)  insertCombiModel.run(buderusId, 24, 1, 3, 1, 1, 80, 160);
  if (combiId1)   insertCombiModel.run(combiId1, 28, 3, 5, 1, 2, 160, 250);

  // Create additional users
  insertUser.run('u-employee', 'Proje Mühendisi', 'calisan@klimakombimerkezi.com', bcrypt.hashSync('Calisan123!', salt), 'employee');
  insertUser.run('u-customer', 'Ahmet Yılmaz', 'ahmet@gmail.com', bcrypt.hashSync('Ahmet123!', salt), 'customer');

  // Get user IDs
  const adminUser  = db.prepare('SELECT id FROM users WHERE uuid=?').get('u-admin');
  const dealerUser = db.prepare('SELECT id FROM users WHERE uuid=?').get('u-dealer');
  const custUser   = db.prepare('SELECT id FROM users WHERE uuid=?').get('u-customer');

  // ----- SAMPLE CART & ORDER FOR CUSTOMER -----
  // Cart
  const cartR = db.prepare('INSERT INTO carts (user_id, session_id) VALUES (?, ?)').run(custUser.id, 's-ahmet-01');
  const cartId = cartR.lastInsertRowid;
  const ecaProduct = pRows.find(p => p.slug === 'eca-proteus-premix-28kw');
  const thermostatProduct = pRows.find(p => p.slug === 'eca-ert-176-kablosuz');
  if (ecaProduct) db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES (?,?,?,?)').run(cartId, ecaProduct.id, 1, 38000);
  if (thermostatProduct) db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity, unit_price) VALUES (?,?,?,?)').run(cartId, thermostatProduct.id, 2, 1800);

  // Order 1 (completed / delivered)
  const ord1Uuid = 'ord-ahmet-001';
  const subtotal1 = 38000 + (1800 * 2);
  const tax1 = subtotal1 * 0.20;
  const total1 = subtotal1 + tax1;
  db.prepare(`INSERT INTO orders (uuid, user_id, status, payment_method, payment_status, subtotal, discount_amount, tax_amount, total_amount, shipping_address, billing_address) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ord1Uuid, custUser.id, 'delivered', 'credit_card', 'paid', subtotal1, 0, tax1, total1,
      JSON.stringify({name:'Ahmet Yılmaz',address:'Kadıköy, İstanbul',phone:'+90 555 123 4567'}),
      JSON.stringify({name:'Ahmet Yılmaz',address:'Kadıköy, İstanbul',phone:'+90 555 123 4567'}));
  const ord1 = db.prepare('SELECT id FROM orders WHERE uuid=?').get(ord1Uuid);
  db.prepare('INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?,?)').run(ord1.id, ecaProduct?.id, 'E.C.A. Proteus Premix 28 kW Tam Yoğuşmalı Kombi', 'ECA-PRO-28', 1, 38000, 38000);
  db.prepare('INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?,?)').run(ord1.id, thermostatProduct?.id, 'E.C.A. Ert-176 Kablosuz Oda Termostatı', 'ECA-ERT176', 2, 1800, 3600);

  // Order 2 (pending stock check - high value)
  const budProduct = pRows.find(p => p.slug === 'buderus-gb122i-24kw');
  if (budProduct) {
    const ord2Uuid = 'ord-ahmet-002';
    const subtotal2 = 45000;
    const tax2 = subtotal2 * 0.20;
    const total2 = subtotal2 + tax2;
    db.prepare(`INSERT INTO orders (uuid, user_id, status, payment_method, payment_status, subtotal, discount_amount, tax_amount, total_amount, shipping_address, billing_address) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ord2Uuid, custUser.id, 'pending_stock_check', 'bank_transfer', 'unpaid', subtotal2, 0, tax2, total2,
        JSON.stringify({name:'Ahmet Yılmaz',address:'Kadıköy, İstanbul',phone:'+90 555 123 4567'}),
        JSON.stringify({name:'Ahmet Yılmaz',address:'Kadıköy, İstanbul',phone:'+90 555 123 4567'}));
    const ord2 = db.prepare('SELECT id FROM orders WHERE uuid=?').get(ord2Uuid);
    db.prepare('INSERT INTO order_items (order_id, product_id, product_name, product_sku, quantity, unit_price, total_price) VALUES (?,?,?,?,?,?,?)').run(ord2.id, budProduct.id, 'Buderus Logamax Plus GB122i 24 kW Tam Yoğuşmalı Kombi', 'BUD-GB122-24', 1, 45000, 45000);
  }

  // ----- SAMPLE DEALER PROJECT -----
  const projUuid = 'dp-bayi-001';
  db.prepare(`INSERT INTO dealer_projects (uuid, dealer_id, project_name, customer_name, description, status, extra_discount_rate) VALUES (?,?,?,?,?,?,?)`)
    .run(projUuid, dealerUser.id, 'Fenerbahçe Mahallesi Apartman Projesi', 'Bayraktar İnşaat A.Ş.',
      'Kadıköy Fenerbahçe Mah. 12 daireli apartman ısıtma ve klima sistemi kurulumu. Toplam hesaplanan ısı kaybı 280 kW.',
      'discount_approved', 5);
  const projRow = db.prepare('SELECT id FROM dealer_projects WHERE uuid=?').get(projUuid);
  const insertProjItem = db.prepare('INSERT INTO dealer_project_items (project_id, product_id, label, quantity, unit_price, margin_rate, is_manual) VALUES (?,?,?,?,?,?,?)');
  if (boilerId1) insertProjItem.run(projRow.id, boilerId1, 'Viessmann Vitocrossal 200 CM2 87 kW Yoğuşmalı Kazan', 4, 0, 15, 0);
  if (budProduct) insertProjItem.run(projRow.id, budProduct.id, 'Buderus GB122i 24 kW Kombi (ortak alan)', 2, 39500, 12, 0);
  insertProjItem.run(projRow.id, null, 'Merkezi Enerji Odası Kurulum ve Montaj', 1, 45000, 0, 1);
  insertProjItem.run(projRow.id, null, 'Boru Tesisat ve İzolasyon (12 daire)', 12, 8500, 0, 1);

  // 2nd dealer project (pending discount)
  const proj2Uuid = 'dp-bayi-002';
  db.prepare(`INSERT INTO dealer_projects (uuid, dealer_id, project_name, customer_name, description, status, extra_discount_requested) VALUES (?,?,?,?,?,?,?)`)
    .run(proj2Uuid, dealerUser.id, 'Bağcılar Ticaret Merkezi VRF Projesi', 'Güven Gayrimenkul Ltd.',
      'Bağcılar 6 katlı ofis binası için VRV/VRF klima sistemi. Rekabetçi teklif nedeniyle ek iskonto talebi.',
      'pending_discount', 8);
  const proj2Row = db.prepare('SELECT id FROM dealer_projects WHERE uuid=?').get(proj2Uuid);
  const daiVrfProduct = pRows.find(p => p.slug === 'daikin-vrv-iv-5hp');
  if (daiVrfProduct) {
    db.prepare('INSERT INTO dealer_project_items (project_id, product_id, label, quantity, unit_price, margin_rate, is_manual) VALUES (?,?,?,?,?,?,?)').run(proj2Row.id, daiVrfProduct.id, 'Daikin VRV IV+ S Dış Ünite 5HP', 3, 185000, 10, 0);
  }
  db.prepare('INSERT INTO dealer_project_items (project_id, product_id, label, quantity, unit_price, margin_rate, is_manual) VALUES (?,?,?,?,?,?,?)').run(proj2Row.id, null, 'Sistem Tasarımı ve Mühendislik', 1, 25000, 0, 1);
  // Discount request for project 2
  db.prepare('INSERT INTO discount_requests (project_id, dealer_id, requested_rate, reason, status) VALUES (?,?,?,?,?)').run(proj2Row.id, dealerUser.id, 8, 'Müşteri 3 firma teklifi kıyaslıyor. Rakip firmalar benzer sistemi %8 daha düşüğe teklif verdiğini söylüyor. Projeyi almak için rekabetçi fiyat şart.', 'pending');

  // ----- QUOTE REQUEST -----
  const quoteUuid = 'qr-001';
  db.prepare('INSERT INTO quote_requests (uuid, user_id, name, email, phone, company, message, status) VALUES (?,?,?,?,?,?,?,?)')
    .run(quoteUuid, custUser.id, 'Ahmet Yılmaz', 'ahmet@gmail.com', '+90 555 123 4567', null,
      '200 m² ticari ofisim için klima ve ısıtma sistemi kurulumu hakkında teknik teklif ve fiyat bilgisi almak istiyorum. VRF sistemi veya multi split klima konusunda yönlendirme yapabilir misiniz?',
      'in_review');

  // ----- NOTIFICATIONS -----
  const insertNotif = db.prepare('INSERT INTO notifications (user_id, title, message, type, is_read, link) VALUES (?,?,?,?,?,?)');
  // Admin notifs
  insertNotif.run(adminUser.id, 'Yüksek Tutarlı Sipariş', 'Sipariş #ord-ahmet-002 stok onayı bekliyor (54.000 ₺)', 'warning', 0, '/admin.html#orders');
  insertNotif.run(adminUser.id, 'Yeni Teklif Talebi', 'Ahmet Yılmaz tarafından yeni bir teklif formu gönderildi.', 'info', 0, '/admin.html#quotes');
  insertNotif.run(adminUser.id, 'Ek İskonto Talebi', 'Örnek Tesisat Ltd - Bağcılar Ticaret Merkezi projesi için %8 ek iskonto talep etti.', 'warning', 0, '/admin.html#discount-requests');
  // Dealer notifs
  insertNotif.run(dealerUser.id, 'Ek İskonto Onaylandı', 'Fenerbahçe Mah. Apartman projesi için talep ettiğiniz %5 ek iskonto onaylandı!', 'success', 0, '/bayi.html');
  insertNotif.run(dealerUser.id, 'Yeni Ürün: Baymak Kaskad Kazan', 'Baymak Lectus 115 kW modeli stokta yerini aldı. Avantajlı bayi fiyatını inceleyin.', 'info', 1, '/urunler.html?category=kazan');
  // Customer notifs
  insertNotif.run(custUser.id, 'Siparişiniz Teslim Edildi', '#ord-ahmet-001 numaralı siparişiniz teslim edildi. İyi günler!', 'success', 0, null);
  insertNotif.run(custUser.id, 'Stok Onayı Bekleniyor', '#ord-ahmet-002 numaralı siparişiniz stok kontrolünden geçiyor. En kısa sürede haberdar edileceksiniz.', 'warning', 0, null);

  console.log('✅ Veritabanı başarıyla tohumlandı (Seeded).');
  console.log('--- TEST KULLANICILARI ---');
  console.log('1. Admin: admin@klimakombimerkezi.com (Şifre: Admin123!)');
  console.log('2. Bayi: bayi@klimakombimerkezi.com (Şifre: Bayi123!)');
  console.log('3. Çalışan: calisan@klimakombimerkezi.com (Şifre: Calisan123!)');
  console.log('4. Müşteri: ahmet@gmail.com (Şifre: Ahmet123!)');
  console.log('--- ÖRNEK VERİLER ---');
  console.log('- 2 müşteri siparişi, 2 bayi projesi, 1 teklif talebi, bildirimler eklendi!');

  console.log('--- TEST KULLANICILARI ---');
  console.log('1. Admin: admin@klimakombimerkezi.com (Şifre: Admin123!)');
  console.log('2. Bayi: bayi@klimakombimerkezi.com (Şifre: Bayi123!)');
  console.log('3. Çalışan: calisan@klimakombimerkezi.com (Şifre: Calisan123!)');
  console.log('4. Müşteri: ahmet@gmail.com (Şifre: Ahmet123!)');

} catch (error) {
  console.error('❌ Tohumlama (Seeding) Hatası:', error);
}
