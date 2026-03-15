/**
 * PDF Teklif Üretici - Bayi ve Çalışanlar için
 * HTML template → Puppeteer → PDF dosyası
 */

const path = require('path');
const fs = require('fs');

async function generateQuotePdf({ project, dealer, items, logoBase64, outputPath }) {
  // Try puppeteer, fallback to HTML if not available
  let html;
  try {
    const puppeteer = require('puppeteer');
    html = buildHtml({ project, dealer, items, logoBase64 });
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({ path: outputPath, format: 'A4', margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' }, printBackground: true });
    await browser.close();
  } catch (err) {
    // Fallback: write as HTML (for environments without puppeteer)
    html = html || buildHtml({ project, dealer, items, logoBase64 });
    const htmlPath = outputPath.replace('.pdf', '.html');
    fs.writeFileSync(htmlPath, html);
    return { type: 'html', path: htmlPath };
  }
  return { type: 'pdf', path: outputPath };
}

function buildHtml({ project, dealer, items, logoBase64 }) {
  const date = new Date().toLocaleDateString('tr-TR');
  const taxRate = 0.20;

  // Calculate totals
  let subtotal = 0;
  const rows = items.map((item, i) => {
    const basePrice = item.unit_price || 0;
    const margin = item.margin_rate || 0;
    const sellingPrice = basePrice * (1 + margin / 100);
    const lineTotal = sellingPrice * (item.quantity || 1);
    subtotal += lineTotal;

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${item.label || item.product_name || '-'}</td>
        <td style="text-align:center">${item.quantity || 1}</td>
        <td style="text-align:center">${item.unit || 'Adet'}</td>
        <td style="text-align:right">${formatPrice(sellingPrice)}</td>
        <td style="text-align:right"><strong>${formatPrice(lineTotal)}</strong></td>
      </tr>
    `;
  }).join('');

  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const logoHtml = logoBase64
    ? `<img src="data:image/png;base64,${logoBase64}" style="max-height:80px; max-width:200px;">`
    : `<div style="font-size:24px;font-weight:700;color:#1a56db;">KLİMA KOMBİ MERKEZİ</div>`;

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1f2937; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 0 15px; border-bottom: 3px solid #1a56db; margin-bottom: 20px; }
  .meta { text-align: right; }
  .meta h1 { font-size: 22px; color: #1a56db; font-weight: 800; }
  .meta p { color: #6b7280; margin-top: 4px; }
  .parties { display: flex; gap: 30px; margin-bottom: 20px; }
  .party-box { flex: 1; background: #f9fafb; border-radius: 8px; padding: 12px 15px; border: 1px solid #e5e7eb; }
  .party-box h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; letter-spacing: 0.05em; }
  .party-box p { margin: 2px 0; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #1a56db; color: #fff; }
  thead th { padding: 9px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #e5e7eb; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-table { width: 280px; }
  .totals-table tr td { padding: 6px 10px; }
  .totals-table tr.grand-total { background: #1a56db; color: #fff; font-size: 14px; font-weight: 700; border-radius: 6px; }
  .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; text-align: center; }
  .validity { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 8px 12px; margin-bottom: 15px; font-size: 11px; color: #92400e; }
</style>
</head>
<body>
  <div class="header">
    <div>${logoHtml}</div>
    <div class="meta">
      <h1>TEKLİF</h1>
      <p>Teklif No: TKF-${Date.now().toString().slice(-6)}</p>
      <p>Tarih: ${date}</p>
      <p>Proje: ${project.project_name || '-'}</p>
    </div>
  </div>

  <div class="parties">
    <div class="party-box">
      <h3>Teklifi Hazırlayan</h3>
      <p><strong>${dealer.company_name || dealer.name || 'Yetkili Bayi'}</strong></p>
      ${dealer.tax_number ? `<p>V.N.: ${dealer.tax_number}</p>` : ''}
      ${dealer.phone ? `<p>Tel: ${dealer.phone}</p>` : ''}
      ${dealer.email ? `<p>E-posta: ${dealer.email}</p>` : ''}
    </div>
    <div class="party-box">
      <h3>Müşteri</h3>
      <p><strong>${project.customer_name || 'Sayın Yetkili'}</strong></p>
      ${project.description ? `<p>${project.description}</p>` : ''}
    </div>
  </div>

  <div class="validity">
    ⏱ Bu teklif, teklif tarihinden itibaren <strong>30 gün</strong> geçerlidir. Fiyatlar KDV hariçtir.
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:35px">#</th>
        <th>Ürün / Hizmet</th>
        <th style="width:60px;text-align:center">Miktar</th>
        <th style="width:60px;text-align:center">Birim</th>
        <th style="width:100px;text-align:right">Birim Fiyat</th>
        <th style="width:110px;text-align:right">Toplam</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <table class="totals-table">
      <tr><td>Ara Toplam</td><td style="text-align:right">${formatPrice(subtotal)}</td></tr>
      <tr><td>KDV (%20)</td><td style="text-align:right">${formatPrice(tax)}</td></tr>
      <tr class="grand-total"><td style="padding:10px">GENEL TOPLAM</td><td style="text-align:right;padding:10px">${formatPrice(total)}</td></tr>
    </table>
  </div>

  <div class="footer">
    <p>Bu teklif <strong>Klima Kombi Merkezi</strong> yetkili bayisi tarafından hazırlanmıştır.</p>
    <p>klimakombimerkezi.com | info@klimakombimerkezi.com</p>
  </div>
</body>
</html>`;
}

function formatPrice(val) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val || 0);
}

module.exports = { generateQuotePdf };
