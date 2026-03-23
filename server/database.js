const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../database.sqlite');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = DELETE');
    db.pragma('synchronous = NORMAL');
    // NOTE: foreign_keys kept OFF globally to avoid Railway cart/session FK issues
    // Individual routes handle data integrity
    db.pragma('foreign_keys = OFF');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    -- USERS
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',  -- customer, dealer, employee, admin
      company_name TEXT,
      tax_number TEXT,
      phone TEXT,
      address TEXT,
      dealer_code TEXT UNIQUE,
      discount_rate REAL DEFAULT 0.0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- CATEGORIES
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      image_url TEXT,
      parent_id INTEGER REFERENCES categories(id),
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- BRANDS
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- PRODUCTS
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      sku TEXT UNIQUE,
      description TEXT,
      short_description TEXT,
      category_id INTEGER REFERENCES categories(id),
      brand_id INTEGER REFERENCES brands(id),
      base_price REAL DEFAULT 0.0,
      dealer_cash_price REAL DEFAULT 0.0,
      dealer_card_price REAL DEFAULT 0.0,
      stock_status TEXT DEFAULT 'in_stock',  -- in_stock, out_of_stock, on_request, price_on_request
      stock_quantity INTEGER DEFAULT 0,
      supply_days INTEGER DEFAULT 0,
      is_hidden_price INTEGER DEFAULT 0,
      is_opportunity INTEGER DEFAULT 0,
      is_bundle INTEGER DEFAULT 0,
      images TEXT DEFAULT '[]',
      specifications TEXT DEFAULT '{}',
      meta_title TEXT,
      meta_description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- PRODUCT BUNDLES (bileşenli paket)
    CREATE TABLE IF NOT EXISTS product_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_product_id INTEGER NOT NULL REFERENCES products(id),
      component_product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1
    );

    -- CROSS-SELL RELATIONS
    CREATE TABLE IF NOT EXISTS product_cross_sells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      related_product_id INTEGER NOT NULL REFERENCES products(id)
    );

    -- INSTALLMENT PLANS (taksit planları)
    CREATE TABLE IF NOT EXISTS installment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank TEXT,
      installments INTEGER NOT NULL,
      interest_rate REAL DEFAULT 0.0,
      min_amount REAL DEFAULT 0.0,
      is_active INTEGER DEFAULT 1
    );

    -- CARTS
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ORDERS
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      -- Statuses: pending, pending_stock_check, payment_link_sent, project_discount_set,
      --           confirmed, processing, shipped, delivered, cancelled, refunded
      payment_method TEXT,  -- credit_card, bank_transfer, cash
      payment_status TEXT DEFAULT 'unpaid',  -- unpaid, pending, paid, refunded
      payment_link TEXT,
      subtotal REAL NOT NULL DEFAULT 0.0,
      discount_amount REAL DEFAULT 0.0,
      tax_amount REAL DEFAULT 0.0,
      total_amount REAL NOT NULL DEFAULT 0.0,
      shipping_address TEXT,
      billing_address TEXT,
      notes TEXT,
      invoice_id TEXT,
      invoice_url TEXT,
      employee_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      product_sku TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );

    -- ORDER NOTES / FILES (çalışan notları)
    CREATE TABLE IF NOT EXISTS order_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      note TEXT NOT NULL,
      is_internal INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- DEALER PROJECTS / QUOTES (bayi proje ve teklifler)
    CREATE TABLE IF NOT EXISTS dealer_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      dealer_id INTEGER NOT NULL REFERENCES users(id),
      project_name TEXT NOT NULL,
      customer_name TEXT,
      description TEXT,
      status TEXT DEFAULT 'draft',  -- draft, pending_discount, discount_approved, sent, accepted, rejected, completed
      extra_discount_rate REAL DEFAULT 0.0,
      extra_discount_requested REAL DEFAULT 0.0,
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dealer_project_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES dealer_projects(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      label TEXT NOT NULL,  -- For manual items like "Montaj Bedeli"
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      margin_rate REAL DEFAULT 0.0,  -- Bayi kâr marjı
      is_manual INTEGER DEFAULT 0     -- 1 = manual item (montaj, işçilik vb.)
    );

    -- DISCOUNT REQUESTS
    CREATE TABLE IF NOT EXISTS discount_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES dealer_projects(id),
      dealer_id INTEGER NOT NULL REFERENCES users(id),
      requested_rate REAL NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',  -- pending, approved, rejected
      admin_id INTEGER REFERENCES users(id),
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- QUOTE REQUESTS (esnek teklif form)
    CREATE TABLE IF NOT EXISTS quote_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new',  -- new, in_review, replied, closed
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quote_request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_request_id INTEGER NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- NOTIFICATIONS
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',  -- info, success, warning, error
      is_read INTEGER DEFAULT 0,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- PRODUCT PRICE REQUESTS
    CREATE TABLE IF NOT EXISTS price_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT,
      status TEXT DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- SITE SETTINGS
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ENGINEERING TOOLS DATA
    CREATE TABLE IF NOT EXISTS boiler_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      power_kw REAL NOT NULL,
      min_area REAL NOT NULL,
      max_area REAL NOT NULL,
      suitable_regions TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS combi_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      power_kw REAL NOT NULL,
      min_rooms INTEGER NOT NULL,
      max_rooms INTEGER NOT NULL,
      min_bathrooms INTEGER NOT NULL,
      max_bathrooms INTEGER NOT NULL,
      min_area REAL NOT NULL,
      max_area REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ac_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      unit_type TEXT NOT NULL,  -- indoor, outdoor
      power_btu INTEGER NOT NULL,
      min_area REAL NOT NULL,
      max_area REAL NOT NULL,
      compatible_outdoor_ids TEXT DEFAULT '[]'
    );
  `);

  // Default settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  insertSetting.run('site_name', 'Klima Kombi Merkezi');
  insertSetting.run('site_phone', '+90 212 000 0000');
  insertSetting.run('site_email', 'info@klimakombimerkezi.com');
  insertSetting.run('site_address', 'İstanbul, Türkiye');
  insertSetting.run('high_value_order_threshold', '50000');
  insertSetting.run('tax_rate', '20');
}

module.exports = { getDb };
