/**
 * safe_patch.js — Safe, non-destructive shell injection
 * ONLY adds:
 *   1. shell-override.css link in <head>
 *   2. shell.js before </body>
 *   3. A "Back to Portal" button injected via JS
 * Does NOT touch HTML structure.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

const MODULES = ['dispatch','vendor','production','transport','erp','stock',
                 'maintenance','electricity','dwpas','sales','stores',
                 'complaint','reports','crm'];

const FONT_TAG = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;

const CSS_TAG = `<link rel="stylesheet" href="../shell-override.css">`;
const JS_TAG = `<script src="../shell.js"></script>`;

// Small inline script that injects a back-to-portal button at top of sidebar
const INJECT_BACK = `<script>
document.addEventListener('DOMContentLoaded', function(){
  // Inject "Back to Portal" at the TOP of the sidebar nav
  var targets = ['#sidebar .menu','#sidebar nav','#sidebar ul','nav.sb','aside#sidebar','#sidebar'];
  var injected = false;
  for(var i=0;i<targets.length;i++){
    var el = document.querySelector(targets[i]);
    if(el){
      var btn = document.createElement('a');
      btn.className='shell-back-btn';
      btn.href='../index.html';
      btn.title='Back to Portal';
      btn.innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg> Portal';
      btn.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#667085;background:#F8F9FA;border:1px solid #E6E8EC;border-radius:7px;padding:6px 12px;cursor:pointer;transition:all .12s;text-decoration:none;margin:8px 10px 4px;';
      btn.onmouseover=function(){this.style.background='#FFF1F2';this.style.color='#D71920';this.style.borderColor='#fecaca'};
      btn.onmouseout=function(){this.style.background='#F8F9FA';this.style.color='#667085';this.style.borderColor='#E6E8EC'};
      el.insertBefore(btn, el.firstChild);
      injected = true;
      break;
    }
  }
});
</script>`;

MODULES.forEach(mod => {
  const filePath = path.join(ROOT, mod, 'index.html');
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${mod} — not found`);
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');

  // Skip if already patched
  if (html.includes('shell-override.css') || html.includes('shell_patched_v2')) {
    console.log(`SKIP: ${mod} — already patched`);
    return;
  }

  let changed = false;

  // 1. Add font + CSS in <head>
  if (!html.includes('shell-override.css')) {
    // After <head> or before </head>
    if (html.includes('</head>')) {
      html = html.replace('</head>', `  <!-- shell_patched_v2 -->\n  ${FONT_TAG}\n  ${CSS_TAG}\n</head>`);
      changed = true;
    }
  }

  // 2. Add shell.js + back-button injector before </body>
  if (!html.includes('shell.js') && !html.includes('INJECT_BACK')) {
    // Find the REAL </body> — not one inside a string
    // Use a safer approach: find last occurrence of </body> that's not inside a <script> block
    const lastBodyClose = findRealBodyClose(html);
    if (lastBodyClose >= 0) {
      html = html.substring(0, lastBodyClose) + INJECT_BACK + '\n' + JS_TAG + '\n' + html.substring(lastBodyClose);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`PATCHED: ${mod}`);
  } else {
    console.log(`NO CHANGE: ${mod}`);
  }
});

/**
 * Find the real </body> closing tag that's not inside a <script> block.
 * Scans the HTML, tracking whether we're inside a script element.
 */
function findRealBodyClose(html) {
  // Strip script contents, then find last </body>
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, (m) => ' '.repeat(m.length));
  const idx = stripped.lastIndexOf('</body>');
  return idx;
}

console.log('\nDone.');
