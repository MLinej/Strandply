/**
 * patch_all_fonts.js
 * Ensures Inter font family is linked and universally applied across ALL HTML files in the project.
 */
const fs = require('fs');
const path = require('path');

function getHtmlFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.wrangler') {
        results = results.concat(getHtmlFiles(fullPath));
      }
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

const htmlFiles = getHtmlFiles(__dirname);
const interLink = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">';

htmlFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;

  // 1. Ensure Inter Google font stylesheet is linked in <head>
  if (!content.includes('fonts.googleapis.com/css2?family=Inter') && content.includes('</head>')) {
    content = content.replace('</head>', `  ${interLink}\n</head>`);
    updated = true;
  }

  // 2. Override font-family variables in inline style blocks to Inter
  if (content.includes("var(--fh)") || content.includes("Urbanist")) {
    content = content.replace(/--fh:\s*['"]?Urbanist['"]?[^;]+/g, "--fh: 'Inter', sans-serif");
    content = content.replace(/font-family:\s*['"]?Urbanist['"]?[^;]+/gi, "font-family: Inter, sans-serif");
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated Inter font in: ${path.relative(__dirname, filePath)}`);
  } else {
    console.log(`Verified font in: ${path.relative(__dirname, filePath)}`);
  }
});

console.log(`Font standardization completed across ${htmlFiles.length} HTML files.`);
