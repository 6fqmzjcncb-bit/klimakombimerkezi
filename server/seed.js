const { getDb } = require('./database');
const bcrypt = require('bcryptjs');

const db = getDb();

try {
  // Handle RESET_DB
  const shouldReset = process.env.RESET_DB === 'true';

  // Check if already seeded
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (adminExists && !shouldReset) {
    console.log('✅ Veritabanı zaten tohumlanmış (seeded), atlanıyor.');
    process.exit(0);
  }

  if (shouldReset) {
    console.log('🔄 RESET_DB aktif, mevcut veriler temizleniyor...');
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
      name, slug, sku, category_id, brand_id, 
      base_price, dealer_cash_price, dealer_card_price,
      stock_status, stock_quantity, supply_days,
      short_description, description, images, is_opportunity, is_hidden_price, is_bundle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // --- KOMBİLER ---
  insertProduct.run(
    'Buderus Logamax Plus GB122i 24 kW Tam Yoğuşmalı Kombi', 'buderus-gb122i-24kw', 'BUD-GB122-24',
    getCatId('kombi'), getBrandId('buderus'),
    45000.00, 39500.00, 41000.00, 'in_stock', 15, 0,
    '24 kW ısıtma kapasiteli, yüksek verimli tam yoğuşmalı kombi.',
    '<p>Buderus Logamax serisi, 24 kW kapasitesi ile 120-150 m2 evler için mükemmel çözümdür. A sınıfı enerji verimliliği sağlar.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/841/buderus-logamax-plus-gb062-24-kw-tam-yogusmali-kombi.jpg']), 0, 0, 0
  );

  insertProduct.run(
    'E.C.A. Proteus Premix 28 kW Tam Yoğuşmalı Kombi', 'eca-proteus-premix-28kw', 'ECA-PRO-28',
    getCatId('kombi'), getBrandId('eca'),
    38000.00, 31000.00, 32500.00, 'in_stock', 25, 0,
    'ErP yönetmeliğine uygun 28 kW kapasiteli E.C.A kombi.',
    '<p>Yüksek kapasiteli, sessiz çalışan 28 kW kombi. Büyük daireler ve çift banyolu evler için ideal.</p>',
    JSON.stringify(['https://st.myideasoft.com/idea/cb/83/myassets/products/688/eca-proteus-premix-24-kw-yogusmali-kombi.jpg']), 1, 0, 0
  );

  insertProduct.run(
    'Bosch Condens 2200i W 24/25 kW Tam Yoğuşmalı Kombi', 'bosch-condens-2200i', 'BOS-CON-2200',
    getCatId('kombi'), getBrandId('bosch'),
    42000.00, 36000.00, 37500.00, 'out_of_stock', 0, 3,
    'Kompakt tasarımı ile dar alanlar için yüksek verimli kombi.',
    '<p>Bosch teknolojisiyle üretilmiş, fısıltı sessizliğinde çalışan yoğuşmalı kombi.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/665/bosch-condens-2200-i-w-24-25-kw-tam-yogusmali-kombi.jpg']), 0, 0, 0
  );

  insertProduct.run(
    'Viessmann Vitodens 050-W 25 kW Kombi', 'viessmann-vitodens-050-25kw', 'VIE-VD050-25',
    getCatId('kombi'), getBrandId('viessmann'),
    48000.00, 42000.00, 43500.00, 'in_stock', 8, 0,
    'Alman teknolojisi, dayanıklı paslanmaz çelik eşanjörlü.',
    '<p>Viessmann kalitesiyle uzun ömürlü, akıllı Wi-Fi bağlantısı opsiyonlu kombi.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/847/viessmann-vitodens-050-w-yogusmali-kombi.jpg']), 0, 0, 0
  );


  // --- KLİMALAR ---
  insertProduct.run(
    'Daikin Sensira 12000 BTU Inverter Duvar Tipi Klima', 'daikin-sensira-12k', 'DAI-SEN-12',
    getCatId('klima'), getBrandId('daikin'),
    32000.00, 26000.00, 27500.00, 'in_stock', 40, 0,
    'Sınırlı stok fırsatıyla sessiz, ekonomik Sensira Inverter serisi.',
    '<p>A++ enerji verimliliği, R32 soğutucu akışkan, titanyum apatit koku giderici filtre.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/834/daikin-sensira-ftxc35c-12000-btu-inverter-klima.jpg']), 1, 0, 0
  );

  insertProduct.run(
    'Mitsubishi Heavy SRK35ZSP-W 12000 BTU Klima', 'mitsubishi-srk35zsp', 'MIT-SRK35',
    getCatId('klima'), getBrandId('mitsubishi'),
    35000.00, 29000.00, 30500.00, 'in_stock', 12, 0,
    'Yüksek performans ve sessizlik bir arada.',
    '<p>Japon mühendisliği, kendi kendini temizleme fonksiyonu ve jet hava akımı teknolojisi.</p>',
    JSON.stringify(['https://st1.myideasoft.com/idea/cb/83/myassets/products/700/mitsubishi-heavy-srk35zsp-w-12000-btu-inverter-klima.jpg']), 0, 0, 0
  );

  insertProduct.run(
    'Gree Fairy 18000 BTU A++ Inverter Klima', 'gree-fairy-18k', 'GRE-FAI-18',
    getCatId('klima'), getBrandId('gree'),
    42000.00, 34500.00, 36000.00, 'on_request', 0, 5,
    'Büyük salonlar için geniş kapasiteli Inverter klima.',
    '<p>Gree Fairy serisi, dahili Wi-Fi modülü ve 7 kademeli fan hızı ile üstün konfor sunar.</p>',
    JSON.stringify(['https://www.iklimplus.com.tr/wp-content/uploads/2020/06/gree-fairy-serisi-klimalar.jpg']), 0, 0, 0
  );


  // --- KAZANLAR / MERKEZİ SİSTEMLER (GİZLİ FİYATLAR) ---
  insertProduct.run(
    'Viessmann Vitocrossal 200 CM2 87 kW Yoğuşmalı Kazan', 'viessmann-vitocrossal-200-87kw', 'VIE-VC200-87',
    getCatId('kazan'), getBrandId('viessmann'),
    0, 0, 0, 'on_request', 0, 15,
    'Merkezi ısıtma sistemleri için teknolojili tam yoğuşmalı çelik kazan.',
    '<p>Büyük apartmanlar, oteller ve iş merkezleri için geliştirilmiş, paslanmaz çelikten üretilen uzun ömürlü kazan. İstenirse kaskad bağlanabilir.</p>',
    JSON.stringify(['https://st3.myideasoft.com/idea/cb/83/myassets/products/930/viessmann-vitocrossal-200-cm2.jpg']), 0, 1, 0
  );

  insertProduct.run(
    'Buderus Logano plus GB312 280 kW Yer Tipi Yoğuşmalı Kazan', 'buderus-logano-gb312-280kw', 'BUD-GB312-280',
    getCatId('kazan'), getBrandId('buderus'),
    0, 0, 0, 'price_on_request', 0, 30,
    'Alüminyum döküm eşanjörlü, yüksek kapasiteli yer tipi kazan.',
    '<p>Sanayi tesisleri ve büyük siteler için tasarlanmış kompakt ve yüksek güçlü kazan sistemi.</p>',
    JSON.stringify(['https://www.borenerji.com/wp-content/uploads/2019/07/buderus-logano-plus-gb312-yer-tipi-yogusmali-kazan-1.jpg']), 0, 1, 0
  );

  insertProduct.run(
    'Baymak Lectus 115 Duvar Tipi Premix Yoğuşmalı Kaskad Kazan', 'baymak-lectus-115', 'BAY-LEC-115',
    getCatId('kazan'), getBrandId('baymak'),
    115000.00, 95000.00, 98000.00, 'in_stock', 3, 0,
    'Kaskad sistemler için modüler 115 kW kapasiteli duvar tipi kazan.',
    '<p>Kaskad panel üzerinden 15 cihaza kadar paralel çalışma imkanı. Paslanmaz çelik eşanjör.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/843/baymak-lectus.jpg']), 0, 0, 0
  );


  // --- VRF SİSTEMLERİ ---
  insertProduct.run(
    'Daikin VRV IV+ S Serisi Dış Ünite 5 HP', 'daikin-vrv-iv-5hp', 'DAI-VRV-5HP',
    getCatId('vrf-sistemleri'), getBrandId('daikin'),
    0, 0, 0, 'on_request', 0, 20,
    'Villalar ve küçük ticari binalar için kompakt dış ünite.',
    '<p>VRV IV teknolojisi: değişken soğutucu akışkan sıcaklığı, montaj kolaylığı, ince tasarım.</p>',
    JSON.stringify(['https://daikin-p.ru/images/joomgallery/originals/vrv_13/vrv_iv-s_compact_79/daikin_vrv_iv-s_compact_20200318_1478546123.jpg']), 0, 1, 0
  );


  // --- YARDIMCI / DİĞER ÜRÜNLER ---
  insertProduct.run(
    'E.C.A. Ert-176 Kablosuz Oda Termostatı', 'eca-ert-176-kablosuz', 'ECA-ERT176',
    getCatId('termostat'), getBrandId('eca'),
    1800.00, 1200.00, 1300.00, 'in_stock', 120, 0,
    'Hassas sıcaklık kontrolü sağlayan kablosuz dijital oda termostatı.',
    '<p>0.5 derece hassasiyet, pil azaldı uyarısı, günlük programlama özellikleri.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/377/eca-ert-176.jpg']), 0, 0, 0
  );

  insertProduct.run(
    'Danfoss Termostatik Radyatör Vanası Papatya', 'danfoss-termostatik-vana', 'DAN-VANA-01',
    getCatId('termostat'), getBrandId('viessmann'), // using viessmann brand randomly for danfoss context
    450.00, 300.00, 320.00, 'in_stock', 500, 0,
    'Radyatör bazlı sıcaklık kontrolü.',
    '<p>Doğalgaz tasarrufu sağlayan sıvı sensörlü termostatik radyatör valfi.</p>',
    JSON.stringify(['https://st.myideasoft.com/idea/cb/83/myassets/products/769/danfoss-ras-c-termostatik-vana.jpg']), 0, 0, 0
  );

  insertProduct.run(
    'E.C.A. 600x1000 PKKP Tip 22 Panel Radyatör', 'eca-panel-600x1000', 'ECA-RAD-610',
    getCatId('radyator'), getBrandId('eca'),
    2500.00, 1900.00, 2000.00, 'in_stock', 150, 0,
    '1.2 mm saç kalınlığı ile uzun ömürlü beyaz panel radyatör.',
    '<p>TS EN 442 standartlarında üretilmiş 10 yıl garantili ısı yayan panel petek.</p>',
    JSON.stringify(['https://st2.myideasoft.com/idea/cb/83/myassets/products/390/eca-panel-radyator.jpg']), 0, 0, 0
  );


  // --- PAKET SİSTEMLER (BUNDLE) ---
  insertProduct.run(
    'Buderus 24 kW Yoğuşmalı Kombi + Tesisat Başlangıç Paketi', 'buderus-24kw-baslangic-paketi', 'BUN-BUD-01',
    getCatId('paket-sistemler'), getBrandId('buderus'),
    49000.00, 42000.00, 43500.00, 'in_stock', 10, 0,
    'Kombi + Termostat + Vana bir arada avantajlı başlangıç paketi.',
    '<p>Evinize tam set çözüm: Buderus GB122i 24 kW Kombi, E.C.A Kablosuz Termostat ve 4 adet Danfoss Vana içeren tasarruf paketi.</p>',
    JSON.stringify(['https://st1.myideasoft.com/idea/cb/83/myassets/products/841/buderus-logamax-plus-gb062-24-kw-tam-yogusmali-kombi.jpg']), 1, 0, 1
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
    db.prepare('INSERT INTO product_cross_sells (product_id, cross_sell_product_id) VALUES (?, ?)').run(buderusId, thermostatId);
    db.prepare('INSERT INTO product_cross_sells (product_id, cross_sell_product_id) VALUES (?, ?)').run(buderusId, radValfId);
  }

  // Insert Engineering Tools Data
  const boilerId1 = pRows.find(p => p.slug === 'viessmann-vitocrossal-200-87kw')?.id;
  const boilerId2 = pRows.find(p => p.slug === 'buderus-logano-gb312-280kw')?.id;
  const combiId1 = pRows.find(p => p.slug === 'eca-proteus-premix-28kw')?.id;
  
  const insertTools = db.prepare('INSERT INTO engineering_tools (tool_type, data) VALUES (?, ?)');
  insertTools.run('boiler_rules', JSON.stringify({
    models: [
      { product_id: buderusId, power_kw: 24, min_area: 80, max_area: 160 },
      { product_id: combiId1, power_kw: 28, min_area: 160, max_area: 250 },
      { product_id: boilerId1, power_kw: 87, min_area: 800, max_area: 1500 },
      { product_id: boilerId2, power_kw: 280, min_area: 2500, max_area: 5000 }
    ]
  }));

  // Create additional users
  insertUser.run('u-employee', 'Proje Mühendisi', 'calisan@klimakombimerkezi.com', bcrypt.hashSync('Calisan123!', salt), 'employee');
  insertUser.run('u-customer', 'Ahmet Yılmaz', 'ahmet@gmail.com', bcrypt.hashSync('Ahmet123!', salt), 'customer');

  console.log('✅ Veritabanı başarıyla tohumlandı (Seeded).');
  console.log('--- TEST KULLANICILARI ---');
  console.log('1. Admin: admin@klimakombimerkezi.com (Şifre: Admin123!)');
  console.log('2. Bayi: bayi@klimakombimerkezi.com (Şifre: Bayi123!)');
  console.log('3. Çalışan: calisan@klimakombimerkezi.com (Şifre: Calisan123!)');
  console.log('4. Müşteri: ahmet@gmail.com (Şifre: Ahmet123!)');

} catch (error) {
  console.error('❌ Tohumlama (Seeding) Hatası:', error);
}
