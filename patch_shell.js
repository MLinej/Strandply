/**
 * patch_shell.js
 * Injects the standard Strandply ERP sidebar shell into every module.
 * Run: node patch_shell.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// Module metadata for nav label + sub-nav items
const MODULES = {
  dispatch: { name: 'SampleTrack Pro', icon: '📦', back: true },
  vendor:   { name: 'Vendor Portal',   icon: '🏭', back: true },
  production:{ name: 'Production MIS', icon: '⚙️', back: true },
  transport: { name: 'Transport',      icon: '🚛', back: true },
  erp:       { name: 'Purchase ERP',   icon: '📋', back: true },
  stock:     { name: 'Stock Mgmt',     icon: '🗃️', back: true },
  maintenance:{ name: 'Maintenance',   icon: '🔧', back: true },
  electricity:{ name: 'Electricity',   icon: '⚡', back: true },
  dwpas:     { name: 'DWPAS',          icon: '📅', back: true },
  sales:     { name: 'Sales ERP',      icon: '🧾', back: true },
  stores:    { name: 'Stores MRN/GRN', icon: '📦', back: true },
  complaint:  { name: 'Complaints',    icon: '📮', back: true },
  reports:   { name: 'Reports Hub',    icon: '📊', back: true },
  crm:       { name: 'Marketing CRM',  icon: '🎯', back: true },
};

const SHELL_HEAD = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../shell.css">`;

// Standard sidebar HTML to inject
function buildSidebar(modId, modMeta) {
  return `
  <!-- STRANDPLY SHELL SIDEBAR (auto-patched) -->
  <div class="sidebar-mob-overlay" id="mob-overlay"></div>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-head">
      <div class="sidebar-logo-full">
        <div class="sidebar-logo-mark">S</div>
        <div class="logo-text-block">
          <div class="sidebar-logo-text">Strandply ERP</div>
          <div class="sidebar-logo-tagline">${modMeta.name}</div>
        </div>
      </div>
      <div class="sidebar-logo-icon">S</div>
      <button class="sidebar-toggle" id="sidebarToggle" title="Toggle sidebar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4l-8 8 8 8"/></svg>
      </button>
    </div>
    <nav class="sidebar-nav" id="sidebar-nav-shell">
      <a class="navlink" data-label="← Portal Home" data-portal-back onclick="window.location.href='../index.html'" style="margin-bottom:4px">
        <svg class="navicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/></svg>
        <span class="navlabel">← Portal Home</span>
      </a>
      <!-- Module sub-nav injected by each module's own JS -->
    </nav>
    <div class="sidebar-bottom">
      <div class="sidebar-user">
        <div class="user-av" id="sb-av" style="background:#D71920">AD</div>
        <div class="user-info-block">
          <div class="user-av-name" id="sb-name">User</div>
          <div class="user-av-role" id="sb-role">Strandply ERP</div>
        </div>
        <svg class="sb-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </div>
    </div>
  </aside>`;
}

const SHELL_TOPBAR = `
    <!-- STRANDPLY SHELL TOPBAR (auto-patched) -->
    <div class="topbar" id="shell-topbar">
      <button class="tb-hamburger" id="tb-hamburger">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <div class="topbar-bc">
        <div class="topbar-bc-path" id="tb-breadcrumb">
          <span>Portal</span><span class="topbar-bc-sep">›</span>
          <span class="topbar-bc-cur" id="tb-cur-page">Module</span>
        </div>
      </div>
      <div class="tb-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" placeholder="Search anything..." id="shell-search">
      </div>
      <div class="tb-actions">
        <div class="tb-icon-btn" title="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <div class="tb-notif-dot"></div>
        </div>
        <div class="tb-divider"></div>
        <div class="tb-avatar-btn">
          <div class="tb-av" id="tb-av" style="background:#D71920">AD</div>
          <div>
            <div class="tb-user-name" id="tb-nm">User</div>
            <div class="tb-user-role" id="tb-rl">Strandply ERP</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#98A2B3;margin-left:2px"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
    </div>`;

const SHELL_SCRIPT = `  <script src="../shell.js"><\/script>`;

function patchModule(modId) {
  const filePath = path.join(ROOT, modId, 'index.html');
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${modId}/index.html not found`);
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');
  const modMeta = MODULES[modId] || { name: modId, icon: '📦' };

  // Skip if already patched
  if (html.includes('STRANDPLY SHELL SIDEBAR (auto-patched)')) {
    console.log(`SKIP: ${modId} already patched`);
    return;
  }

  // 1. Inject shell.css + Inter font in <head>
  if (!html.includes('shell.css')) {
    html = html.replace(/<\/head>/i, SHELL_HEAD + '\n</head>');
  }

  // 2. Inject shell.js before </body>
  if (!html.includes('shell.js')) {
    html = html.replace(/<\/body>/i, SHELL_SCRIPT + '\n</body>');
  }

  // 3. Wrap the entire body content in .app-shell if not already wrapped
  // Look for common patterns: <body...> ... existing sidebar ... <div class="main"> etc.
  // Strategy: find the opening <body tag and add app-shell wrapper + sidebar + .content wrapper

  // Find the body open tag
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (!bodyMatch) {
    console.log(`ERROR: no <body> found in ${modId}`);
    return;
  }

  const bodyTag = bodyMatch[0];
  const bodyIdx = html.indexOf(bodyTag);
  const afterBodyTag = bodyIdx + bodyTag.length;

  // Check if there's already an app-shell
  if (html.includes('class="app-shell"') || html.includes("class='app-shell'")) {
    // Just ensure shell.css is linked and shell.js is included
    console.log(`INFO: ${modId} already has app-shell, ensuring assets linked`);
    fs.writeFileSync(filePath, html, 'utf8');
    return;
  }

  // Find the existing sidebar element to REPLACE it with the standard one
  // Common patterns used across modules:
  const existingSidebarPatterns = [
    /<aside[^>]+class="[^"]*sidebar[^"]*"[\s\S]*?<\/aside>/i,
    /<div[^>]+class="[^"]*sidebar[^"]*"[\s\S]*?<\/div>\s*(?=<(?:main|div[^>]+(?:main|content)))/i,
  ];

  let sidebarReplaced = false;
  for (const pat of existingSidebarPatterns) {
    if (pat.test(html)) {
      html = html.replace(pat, buildSidebar(modId, modMeta).trim());
      sidebarReplaced = true;
      break;
    }
  }

  // Find the existing topbar/header to replace with standard topbar
  // (only if we could replace the sidebar, to keep structure consistent)
  if (sidebarReplaced) {
    const topbarPatterns = [
      /<header[^>]+class="[^"]*topbar[^"]*"[\s\S]*?<\/header>/i,
      /<div[^>]+class="[^"]*topbar[^"]*"[\s\S]*?<\/div>\s*(?=<(?:main|div[^>]+(?:page|content)))/i,
    ];
    for (const pat of topbarPatterns) {
      if (pat.test(html)) {
        html = html.replace(pat, SHELL_TOPBAR.trim());
        break;
      }
    }
    console.log(`PATCHED: ${modId}`);
  } else {
    // Fallback: just wrap body content  
    const beforeClose = html.lastIndexOf('</body>');
    const beforeContent = afterBodyTag;
    const bodyContent = html.substring(beforeContent, beforeClose);
    
    const newBody = `\n<div class="app-shell">\n${buildSidebar(modId, modMeta)}\n  <div class="content">\n${SHELL_TOPBAR}\n    <div class="page-area">\n${bodyContent}\n    </div>\n  </div>\n</div>`;
    html = html.substring(0, beforeContent) + newBody + '\n</body>\n</html>';
    console.log(`WRAPPED: ${modId} (fallback wrap)`);
  }

  fs.writeFileSync(filePath, html, 'utf8');
}

// Patch all modules
Object.keys(MODULES).forEach(patchModule);
console.log('\nDone! All modules processed.');
