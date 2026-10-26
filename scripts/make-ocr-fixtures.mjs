// Synthetic receipts rendered by Chromium with correct Arabic shaping.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const root = 'tests/fixtures/ocr';
await mkdir(root, { recursive: true });
const samples = {
  english: ['SAMPLE RECEIPT - NOT A REAL PURCHASE', 'Store: Sample Electronics',
    'Product: Studio Headphones', 'Brand: Acme', 'Model: Studio 100', 'Serial: SN123456',
    'Purchase date: 2026-10-15', 'Price: 199.99 USD', 'Warranty: 12 months', 'Warranty start: 2026-10-15'],
  arabic: ['فاتورة تجريبية', 'المتجر: متجر النور', 'المنتج: سماعات', 'الماركة: سامسونج',
    'الموديل: ستوديو', 'تاريخ الشراء: 2026-10-15', 'السعر: 1250.50 EGP',
    'مدة الضمان: 12 شهر', 'بداية الضمان: 2026-10-15'],
};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
  for (const [language, lines] of Object.entries(samples)) {
    const html = `<html lang="${language === 'arabic' ? 'ar' : 'en'}" dir="${language === 'arabic' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>@page {size:1400px 1100px;margin:0}body{margin:0;padding:60px;font:40px Arial;background:white;color:black;box-sizing:border-box;height:1100px}p{margin:0 0 42px}</style></head><body>${lines.map(line => `<p>${line}</p>`).join('')}</body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: `${root}/${language}.png` });
    await page.screenshot({ path: `${root}/${language}.jpg`, quality: 95 });
    await page.pdf({ path: `${root}/${language}.pdf`, preferCSSPageSize: true });
    if (language === 'english') {
      await page.setContent(html.replace('</body>', '<div style="break-before:page;height:1100px">Page 2</div>'.repeat(5) + '</body>'));
      await page.pdf({ path: `${root}/six-pages.pdf`, preferCSSPageSize: true });
    }
  }
} finally { await browser.close(); }
console.log(`Created Arabic and English synthetic receipt fixtures: ${root}`);
