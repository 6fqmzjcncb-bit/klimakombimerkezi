const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateQuotePdf } = require('../utils/pdfGenerator');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/pdf/dealer-quote/:projectUuid
router.post('/dealer-quote/:projectUuid', requireAuth, requireRole('dealer', 'admin', 'employee'), upload.single('logo'), async (req, res) => {
  try {
    const db = getDb();
    const { margin_rate_override } = req.body;

    const project = db.prepare('SELECT dp.*, u.name as dealer_name, u.company_name, u.email as dealer_email, u.phone as dealer_phone, u.tax_number FROM dealer_projects dp JOIN users u ON dp.dealer_id=u.id WHERE dp.uuid=?').get(req.params.projectUuid);
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' });

    if (req.user.role === 'dealer' && project.dealer_id !== req.user.id) {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const items = db.prepare('SELECT dpi.*, p.name as product_name, p.sku FROM dealer_project_items dpi LEFT JOIN products p ON dpi.product_id=p.id WHERE dpi.project_id=?').all(project.id);

    // Apply global margin override if provided
    const processedItems = items.map(item => ({
      ...item,
      margin_rate: margin_rate_override !== undefined ? parseFloat(margin_rate_override) : item.margin_rate
    }));

    const dealer = {
      name: project.dealer_name,
      company_name: project.company_name,
      email: project.dealer_email,
      phone: project.dealer_phone,
      tax_number: project.tax_number
    };

    const logoBase64 = req.file ? req.file.buffer.toString('base64') : null;

    const pdfDir = path.join(__dirname, '../../public/uploads/pdfs');
    fs.mkdirSync(pdfDir, { recursive: true });
    const outputPath = path.join(pdfDir, `teklif-${project.uuid}-${Date.now()}.pdf`);

    const result = await generateQuotePdf({ project, dealer, items: processedItems, logoBase64, outputPath });

    if (result.type === 'html') {
      const relPath = '/uploads/pdfs/' + path.basename(result.path);
      return res.json({ success: true, type: 'html', url: relPath, message: 'PDF oluşturulamadı, HTML teklif hazırlandı.' });
    }

    res.download(outputPath, `Teklif-${project.project_name}.pdf`, (err) => {
      if (!err) setTimeout(() => { try { fs.unlinkSync(outputPath); } catch {} }, 60000);
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF oluşturulurken hata oluştu: ' + err.message });
  }
});

// POST /api/pdf/employee-quote - çalışan teklif PDF
router.post('/employee-quote', requireAuth, requireRole('admin', 'employee'), upload.single('logo'), async (req, res) => {
  try {
    const { project_name, customer_name, items, description } = req.body;
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    const dealer = {
      name: req.user.name,
      company_name: 'Klima Kombi Merkezi',
      email: req.user.email
    };

    const project = { project_name: project_name || 'Teklif', customer_name: customer_name || '', description: description || '' };
    const logoBase64 = req.file ? req.file.buffer.toString('base64') : null;

    const pdfDir = path.join(__dirname, '../../public/uploads/pdfs');
    fs.mkdirSync(pdfDir, { recursive: true });
    const outputPath = path.join(pdfDir, `teklif-employee-${Date.now()}.pdf`);

    const result = await generateQuotePdf({ project, dealer, items: parsedItems, logoBase64, outputPath });

    if (result.type === 'html') {
      return res.json({ success: true, type: 'html', url: '/uploads/pdfs/' + path.basename(result.path) });
    }
    res.download(outputPath, `Teklif-${project_name || 'Klima'}.pdf`, (err) => {
      if (!err) setTimeout(() => { try { fs.unlinkSync(outputPath); } catch {} }, 60000);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
