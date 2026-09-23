/**
 * patch_logos.js
 * Injects and updates Strandply logo images across all module HTML files.
 */
const fs = require('fs');
const path = require('path');

const modules = [
  'dispatch', 'vendor', 'production', 'transport', 'erp',
  'stock', 'maintenance', 'electricity', 'dwpas', 'sales',
  'stores', 'complaint', 'reports', 'crm'
];

modules.forEach(m => {
  const filePath = path.join(__dirname, m, 'index.html');
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace placeholder 'S' or 'SP' or text-only marks with logo images
  content = content.replace(/<div class="topbar-logo">S<\/div>/g, '<div class="topbar-logo"><img src="strandply-icon.png" alt="Strandply" style="width:26px;height:26px;object-fit:contain;"></div>');
  content = content.replace(/<div class="sidebar-logo-mark">S<\/div>/g, '<div class="sidebar-logo-mark" style="background:transparent;"><img src="strandply-icon.png" alt="Strandply" style="width:26px;height:26px;object-fit:contain;"></div>');
  content = content.replace(/<div class="logo-icon">SP<\/div>/g, '<div class="logo-icon" style="background:transparent;"><img src="strandply-icon.png" alt="Strandply" style="width:30px;height:30px;object-fit:contain;"></div>');
  content = content.replace(/<div class="rpt-logo-box">SP<\/div>/g, '<div class="rpt-logo-box" style="background:transparent;"><img src="strandply-icon.png" alt="Strandply" style="width:30px;height:30px;object-fit:contain;"></div>');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated logos in ${m}/index.html`);
});

console.log('Logo update completed for all modules.');
