const express = require('express');
const { getDb } = require('../database');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// --- KAZAN SEÇIM SİHİRBAZI ---
// POST /api/tools/boiler-selector
router.post('/boiler-selector', optionalAuth, (req, res) => {
  const { area, region, insulation, floors } = req.body;
  if (!area) return res.status(400).json({ error: 'Alan (m²) bilgisi gerekli' });

  // Isı kaybı katsayısı - bölgeye ve yalıtıma göre
  const regionFactor = { '1': 40, '2': 50, '3': 60, '4': 70, '5': 80, '6': 90 }[region] || 60;
  const insulationFactor = { 'iyi': 0.8, 'orta': 1.0, 'kotu': 1.3 }[insulation] || 1.0;
  const floorFactor = floors > 1 ? 1.1 : 1.0;

  const requiredKw = Math.ceil((area * regionFactor * insulationFactor * floorFactor) / 1000);

  const db = getDb();
  let models = db.prepare(`
    SELECT bm.*, p.name, p.slug, p.images, p.base_price, p.dealer_cash_price, p.stock_status
    FROM boiler_models bm JOIN products p ON bm.product_id = p.id
    WHERE p.is_active = 1 AND bm.min_area <= ? AND bm.max_area >= ?
    ORDER BY bm.power_kw ASC
  `).all(area, area);

  // If no DB models, return calculation only
  const isDealer = req.user?.role === 'dealer';
  if (!isDealer) models = models.map(m => { delete m.dealer_cash_price; return m; });

  res.json({
    required_kw: requiredKw,
    recommended_models: models,
    calculation: {
      area, region, insulation, floors,
      region_factor: regionFactor,
      insulation_factor: insulationFactor,
      floor_factor: floorFactor
    }
  });
});

// --- KOMBİ SEÇİM SİHİRBAZI ---
// POST /api/tools/combi-wizard
router.post('/combi-wizard', optionalAuth, (req, res) => {
  const { area, rooms, bathrooms, building_type } = req.body;
  if (!area) return res.status(400).json({ error: 'Alan (m²) bilgisi gerekli' });

  const buildingFactor = { 'apartment': 1.0, 'house': 1.2, 'office': 0.9 }[building_type] || 1.0;
  const requiredKw = Math.ceil((area * 60 * buildingFactor) / 1000);
  const dhwFactor = bathrooms > 2 ? 1.3 : bathrooms === 2 ? 1.1 : 1.0;
  const combiKw = Math.ceil(requiredKw * dhwFactor);

  const db = getDb();
  let models = db.prepare(`
    SELECT cm.*, p.name, p.slug, p.images, p.base_price, p.dealer_cash_price, p.stock_status
    FROM combi_models cm JOIN products p ON cm.product_id = p.id
    WHERE p.is_active = 1 AND cm.min_area <= ? AND cm.max_area >= ?
    AND cm.min_bathrooms <= ? AND cm.max_bathrooms >= ?
    ORDER BY cm.power_kw ASC
  `).all(area, area, bathrooms || 1, bathrooms || 1);

  const isDealer = req.user?.role === 'dealer';
  if (!isDealer) models = models.map(m => { delete m.dealer_cash_price; return m; });

  res.json({ required_kw: combiKw, recommended_models: models, calculation: { area, rooms, bathrooms, building_type, combi_kw: combiKw } });
});

// --- MULTI KLİMA KONFİGÜRATÖRÜ ---
// POST /api/tools/ac-configurator
router.post('/ac-configurator', optionalAuth, (req, res) => {
  const { rooms } = req.body; // [{name: "Salon", area: 30}, ...]
  if (!rooms?.length) return res.status(400).json({ error: 'En az bir oda bilgisi gerekli' });

  const db = getDb();
  const config = [];
  let totalBtu = 0;

  for (const room of rooms) {
    const requiredBtu = room.area * 400; // ~400 BTU per m²
    totalBtu += requiredBtu;

    const indoor = db.prepare(`
      SELECT acu.*, p.name, p.slug, p.images, p.base_price, p.dealer_cash_price, p.stock_status
      FROM ac_units acu JOIN products p ON acu.product_id = p.id
      WHERE acu.unit_type = 'indoor' AND p.is_active = 1
      AND acu.min_area <= ? AND acu.max_area >= ?
      ORDER BY ABS(acu.power_btu - ?) ASC LIMIT 3
    `).all(room.area, room.area, requiredBtu);

    config.push({ room: room.name, area: room.area, required_btu: requiredBtu, recommended_indoors: indoor });
  }

  // Recommend outdoor unit
  const outdoors = db.prepare(`
    SELECT acu.*, p.name, p.slug, p.images, p.base_price, p.stock_status
    FROM ac_units acu JOIN products p ON acu.product_id = p.id
    WHERE acu.unit_type = 'outdoor' AND p.is_active = 1
    AND acu.power_btu >= ?
    ORDER BY acu.power_btu ASC LIMIT 3
  `).all(totalBtu);

  const isDealer = req.user?.role === 'dealer';
  if (!isDealer) outdoors.forEach(o => { delete o.dealer_cash_price; });

  res.json({ rooms_config: config, recommended_outdoors: outdoors, total_btu: totalBtu, rooms_count: rooms.length });
});

// --- ADMIN: Boiler models CRUD ---
router.post('/boiler-models', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  const { product_id, power_kw, min_area, max_area, suitable_regions } = req.body;
  db.prepare('INSERT INTO boiler_models (product_id, power_kw, min_area, max_area, suitable_regions) VALUES (?,?,?,?,?)').run(product_id, power_kw, min_area, max_area, JSON.stringify(suitable_regions || []));
  res.json({ success: true });
});

router.post('/combi-models', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  const { product_id, power_kw, min_rooms, max_rooms, min_bathrooms, max_bathrooms, min_area, max_area } = req.body;
  db.prepare('INSERT INTO combi_models (product_id, power_kw, min_rooms, max_rooms, min_bathrooms, max_bathrooms, min_area, max_area) VALUES (?,?,?,?,?,?,?,?)').run(product_id, power_kw, min_rooms, max_rooms, min_bathrooms, max_bathrooms, min_area, max_area);
  res.json({ success: true });
});

router.post('/ac-units', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  const { product_id, unit_type, power_btu, min_area, max_area, compatible_outdoor_ids } = req.body;
  db.prepare('INSERT INTO ac_units (product_id, unit_type, power_btu, min_area, max_area, compatible_outdoor_ids) VALUES (?,?,?,?,?,?)').run(product_id, unit_type, power_btu, min_area, max_area, JSON.stringify(compatible_outdoor_ids || []));
  res.json({ success: true });
});

module.exports = router;
