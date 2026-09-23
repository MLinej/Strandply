const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== '.git' && f !== '.wrangler') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

let count = 0;
walkDir(__dirname, function(filePath) {
  if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace font-family: Inter or font-family: \'Inter\' or font-family: Inter, sans-serif inside single quotes
    let updated = content.replace(/font-family:\s*['"]?Inter['"]?/gi, "font-family: Inter);
    
    if (content !== updated) {
      fs.writeFileSync(filePath, updated, 'utf8');
      console.log('Fixed quotes in:', filePath);
      count++;
    }
  }
});

console.log(`Total files repaired: ${count}`);
