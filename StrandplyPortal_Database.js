/*
╔══════════════════════════════════════════════════════════════════════════════╗
║           STRANDPLY LLP — COMPANY PORTAL                                   ║
║           COMPLETE DATABASE REFERENCE                                       ║
║                                                                             ║
║  This file documents ALL database structures used in                       ║
║  StrandplyPortal/index.html                                                ║
║                                                                             ║
║  Storage: Browser localStorage (no server needed)                          ║
║  Keys:                                                                      ║
║    stp_portal_v2  → Users array                                            ║
║    stp_roles_v1   → Custom roles array                                     ║
║                                                                             ║
║  How to edit: Open StrandplyPortal/index.html in any text editor           ║
║  Find the section marked DATABASE and update the values below              ║
╚══════════════════════════════════════════════════════════════════════════════╝
*/


/* ════════════════════════════════════════════════════════════════
   1. MODULES CATALOGUE
   ────────────────────────────────────────────────────────────────
   Defines every module card shown on the portal.
   Add a new module by adding a new object to this array.
   status: 'live' | 'soon' | 'planned'
   url: path to the module file, or null if not ready
   ════════════════════════════════════════════════════════════════ */

const MODULES = [

  /* ── MODULE 1: SampleTrack Pro ── */
  {
    id:         'dispatch',
    name:       'SampleTrack Pro',
    desc:       'Dispatch & Sample Tracking System',
    icon:       '📦',
    color:      'ct-red',           // gradient theme class
    status:     'live',             // shows green Live badge
    url:        'dispatch/index.html',
    urlDisplay: 'strandply.in/dispatch',
    features: [
      'Sample request management',
      'Dispatch entries & courier labels',
      'Live tracking & WhatsApp share',
      'Google Sheets sync',
      'Reports & analytics',
    ],
    subModules: [
      { id:'req',      name:'Sample Requests',  desc:'Raise & approve sample requests' },
      { id:'disp',     name:'Dispatch Entry',   desc:'Create & edit dispatch records' },
      { id:'track',    name:'Live Tracking',    desc:'Track shipment statuses' },
      { id:'party',    name:'Party Database',   desc:'View & manage party/customer records' },
      { id:'courier',  name:'Courier Database', desc:'Manage courier partners' },
      { id:'product',  name:'Product Master',   desc:'View & import product catalogue' },
      { id:'report',   name:'Reports',          desc:'Dispatch register & analytics' },
      { id:'settings', name:'Settings & Sync',  desc:'Configure Google Sheets & backup' },
    ]
  },

  /* ── MODULE 2: Vendor Portal ── */
  {
    id:         'vendor',
    name:       'Vendor Portal',
    desc:       'Supplier & Raw Material Management',
    icon:       '🏭',
    color:      'ct-blue',
    status:     'soon',             // shows amber Coming Soon badge
    url:        null,               // set to 'vendor/index.html' when ready
    urlDisplay: 'strandply.in/vendor',
    features: [
      'Vendor / supplier database',
      'Purchase order tracking',
      'Raw material inventory',
      'Payment & due dates',
    ],
    subModules: [
      { id:'vend_list', name:'Vendor List',     desc:'View & manage vendor records' },
      { id:'vend_po',   name:'Purchase Orders', desc:'Create & track POs' },
      { id:'vend_inv',  name:'Inventory',       desc:'Raw material stock levels' },
      { id:'vend_pay',  name:'Payments',        desc:'Payment status & schedules' },
    ]
  },

  /* ── MODULE 3: Reports Hub ── */
  {
    id:         'reports',
    name:       'Reports Hub',
    desc:       'Consolidated Business Analytics',
    icon:       '📊',
    color:      'ct-amber',
    status:     'soon',
    url:        null,
    urlDisplay: 'strandply.in/reports',
    features: [
      'Cross-module dashboards',
      'Sales & dispatch trends',
      'Export to Excel / PDF',
      'Management KPIs',
    ],
    subModules: [
      { id:'rpt_dash',  name:'Dashboard',        desc:'KPI summary dashboard' },
      { id:'rpt_disp',  name:'Dispatch Reports', desc:'Dispatch analytics' },
      { id:'rpt_sales', name:'Sales Reports',    desc:'Sales performance' },
      { id:'rpt_exp',   name:'Export',           desc:'Export any report to Excel' },
    ]
  },

  /* ── MODULE 4: HR Module ── */
  {
    id:         'hr',
    name:       'HR Module',
    desc:       'Employee Attendance & Leave Management',
    icon:       '👥',
    color:      'ct-teal',
    status:     'soon',
    url:        null,
    urlDisplay: 'strandply.in/hr',
    features: [
      'Employee database',
      'Attendance tracking',
      'Leave requests & approvals',
      'Salary register',
    ],
    subModules: [
      { id:'hr_emp',   name:'Employee Master', desc:'Employee records' },
      { id:'hr_att',   name:'Attendance',      desc:'Mark & review attendance' },
      { id:'hr_leave', name:'Leave Manager',   desc:'Leave applications' },
      { id:'hr_sal',   name:'Salary Register', desc:'Payroll records' },
    ]
  },

  /* ── MODULE 5: Production Tracker ── */
  {
    id:         'production',
    name:       'Production Tracker',
    desc:       'OSB/S-OSB Production Line Management',
    icon:       '⚙️',
    color:      'ct-purple',
    status:     'planned',          // shows amber Planned badge
    url:        null,
    urlDisplay: 'strandply.in/production',
    features: [
      'Production batch tracking',
      'Hot Press → Dispatch flow',
      'Quality grading records',
      'Material consumption',
    ],
    subModules: [
      { id:'pr_batch', name:'Batch Records',  desc:'Production batch entry & tracking' },
      { id:'pr_qual',  name:'Quality Grades', desc:'Grade inspection records' },
      { id:'pr_mat',   name:'Material Log',   desc:'Material consumption tracking' },
    ]
  },

  /* ── MODULE 6: Accounts Module ── */
  {
    id:         'accounts',
    name:       'Accounts Module',
    desc:       'Invoice, Payment & Expense Tracking',
    icon:       '💰',
    color:      'ct-green',
    status:     'planned',
    url:        null,
    urlDisplay: 'strandply.in/accounts',
    features: [
      'Invoice management',
      'Receivables & payables',
      'GST summary',
      'Expense tracking',
    ],
    subModules: [
      { id:'ac_inv',  name:'Invoices',    desc:'Create & manage invoices' },
      { id:'ac_recv', name:'Receivables', desc:'Outstanding receivables' },
      { id:'ac_pay',  name:'Payables',    desc:'Vendor & expense payments' },
      { id:'ac_gst',  name:'GST Reports', desc:'GST input/output summary' },
    ]
  },

  /*
  ── HOW TO ADD A NEW MODULE ──────────────────────────────────────
  Copy this template and paste at the end of the array above:

  {
    id:         'mymodule',          // unique lowercase ID, no spaces
    name:       'My Module Name',
    desc:       'Short description',
    icon:       '🔧',               // any emoji
    color:      'ct-red',           // ct-red | ct-blue | ct-green | ct-amber | ct-teal | ct-purple | ct-rose
    status:     'soon',             // live | soon | planned
    url:        null,               // 'mymodule/index.html' when file is ready
    urlDisplay: 'strandply.in/mymodule',
    features:   ['Feature 1','Feature 2','Feature 3'],
    subModules: [
      { id:'sub1', name:'Sub Feature 1', desc:'What it does' },
      { id:'sub2', name:'Sub Feature 2', desc:'What it does' },
    ]
  },

  Then create folder: StrandplyPortal/mymodule/index.html
  ────────────────────────────────────────────────────────────────
  */

]; // end MODULES


/* ════════════════════════════════════════════════════════════════
   2. ROLE LABELS
   ────────────────────────────────────────────────────────────────
   Maps role ID → display name shown in UI.
   Add new roles here when creating custom roles.
   ════════════════════════════════════════════════════════════════ */

const ROLE_LABELS = {
  admin:      'System Administrator',
  dispatch:   'Dispatch Executive',
  marketing:  'Marketing Executive',
  management: 'Management',
  vendor:     'Vendor Relations',
  accounts:   'Accounts Executive',
  hr:         'HR Executive',

  // Custom roles added via Roles panel are stored in localStorage
  // and merged into this object at runtime — no need to add them here manually
};


/* ════════════════════════════════════════════════════════════════
   3. ROLE DEFAULT PERMISSIONS
   ────────────────────────────────────────────────────────────────
   When admin assigns a role to a user, these are the default
   module access + sub-module rights that get applied.
   Can be overridden per-user in the Users panel.
   ════════════════════════════════════════════════════════════════ */

const ROLE_DEFAULTS = {

  /* Full access to everything */
  admin: {
    modules: ['dispatch','vendor','reports','hr','production','accounts'],
    subRights: {
      dispatch:   ['req','disp','track','party','courier','product','report','settings'],
      vendor:     ['vend_list','vend_po','vend_inv','vend_pay'],
      reports:    ['rpt_dash','rpt_disp','rpt_sales','rpt_exp'],
      hr:         ['hr_emp','hr_att','hr_leave','hr_sal'],
      production: ['pr_batch','pr_qual','pr_mat'],
      accounts:   ['ac_inv','ac_recv','ac_pay','ac_gst'],
    }
  },

  /* Dispatch: only dispatch module — entry, tracking, couriers */
  dispatch: {
    modules: ['dispatch'],
    subRights: {
      dispatch: ['disp','track','courier']
    }
  },

  /* Marketing: dispatch requests + party DB + vendor list */
  marketing: {
    modules: ['dispatch','vendor'],
    subRights: {
      dispatch: ['req','track','party','product'],
      vendor:   ['vend_list']
    }
  },

  /* Management: view-only — tracking + reports */
  management: {
    modules: ['dispatch','reports'],
    subRights: {
      dispatch: ['track','report'],
      reports:  ['rpt_dash','rpt_disp','rpt_sales','rpt_exp']
    }
  },

  /* Vendor: vendor portal only */
  vendor: {
    modules: ['vendor'],
    subRights: {
      vendor: ['vend_list','vend_po','vend_inv','vend_pay']
    }
  },

  /* Accounts: accounts module only */
  accounts: {
    modules: ['accounts'],
    subRights: {
      accounts: ['ac_inv','ac_recv','ac_pay','ac_gst']
    }
  },

  /* HR: HR module only */
  hr: {
    modules: ['hr'],
    subRights: {
      hr: ['hr_emp','hr_att','hr_leave','hr_sal']
    }
  },

}; // end ROLE_DEFAULTS


/* ════════════════════════════════════════════════════════════════
   4. SEED USERS (Built-in Users)
   ────────────────────────────────────────────────────────────────
   These users always exist. Edits made via the Admin Panel
   are saved to localStorage and override these values.
   New users added via Admin Panel are added on top of these.

   To add a permanent new user: add to this array and re-upload
   To change a password permanently: change it here and re-upload

   USER OBJECT STRUCTURE:
   {
     id:         string  — unique, never change after creation
     name:       string  — full display name
     username:   string  — login username (lowercase)
     password:   string  — login password
     role:       string  — must match a key in ROLE_LABELS
     dept:       string  — department name (display only)
     avatar:     string  — 1–3 initials shown in avatar circle
     color:      string  — hex color for the avatar circle
     modules:    array   — list of module IDs this user can access
     subRights:  object  — { moduleId: [subModuleId, ...] }
   }
   ════════════════════════════════════════════════════════════════ */

const SEED_USERS = [

  /* ── ADMIN ── */
  {
    id:       'u001',
    name:     'Admin',
    username: 'admin',
    password: 'admin@strandply',       // ← CHANGE THIS after first login
    role:     'admin',
    dept:     'Administration',
    avatar:   'AD',
    color:    '#B91C1C',
    modules:  ['dispatch','vendor','reports','hr','production','accounts'],
    subRights: {
      dispatch:   ['req','disp','track','party','courier','product','report','settings'],
      vendor:     ['vend_list','vend_po','vend_inv','vend_pay'],
      reports:    ['rpt_dash','rpt_disp','rpt_sales','rpt_exp'],
      hr:         ['hr_emp','hr_att','hr_leave','hr_sal'],
      production: ['pr_batch','pr_qual','pr_mat'],
      accounts:   ['ac_inv','ac_recv','ac_pay','ac_gst'],
    }
  },

  /* ── ANKIT PARMAR — Dispatch Executive ── */
  {
    id:       'u002',
    name:     'Ankit Parmar',
    username: 'ankit',
    password: 'ankit@123',
    role:     'dispatch',
    dept:     'Dispatch Department',
    avatar:   'AP',
    color:    '#0F766E',
    modules:  ['dispatch'],            // only SampleTrack Pro
    subRights: {
      dispatch: ['disp','track','courier']  // dispatch entry + tracking + couriers only
    }
  },

  /* ── SURESH KUMAR — Marketing ── */
  {
    id:       'u003',
    name:     'Suresh Kumar',
    username: 'suresh',
    password: 'suresh@123',
    role:     'marketing',
    dept:     'Marketing Team',
    avatar:   'SK',
    color:    '#B45309',
    modules:  ['dispatch','vendor'],
    subRights: {
      dispatch: ['req','track','party','product'],
      vendor:   ['vend_list']
    }
  },

  /* ── RAJ VERMA — Management ── */
  {
    id:       'u004',
    name:     'Raj Verma',
    username: 'raj',
    password: 'raj@123',
    role:     'management',
    dept:     'Management',
    avatar:   'RV',
    color:    '#1D4ED8',
    modules:  ['dispatch','reports'],
    subRights: {
      dispatch: ['track','report'],
      reports:  ['rpt_dash','rpt_disp','rpt_sales','rpt_exp']
    }
  },

  /* ── VENDOR MANAGER ── */
  {
    id:       'u005',
    name:     'Vendor Manager',
    username: 'vendor',
    password: 'vendor@123',
    role:     'vendor',
    dept:     'Vendor Relations',
    avatar:   'VM',
    color:    '#7C3AED',
    modules:  ['vendor'],
    subRights: {
      vendor: ['vend_list','vend_po','vend_inv','vend_pay']
    }
  },

  /*
  ── HOW TO ADD A NEW PERMANENT USER ─────────────────────────────
  Copy this template and paste above the closing ]; bracket:

  {
    id:       'u006',                  // next sequential ID
    name:     'Full Name',
    username: 'loginname',            // lowercase, no spaces
    password: 'password123',
    role:     'dispatch',             // must match a key in ROLE_LABELS
    dept:     'Department Name',
    avatar:   'FN',                   // 1-3 initials
    color:    '#0E7490',              // hex color
    modules:  ['dispatch'],           // which modules they can access
    subRights: {
      dispatch: ['disp','track']      // which sub-features within each module
    }
  },

  Then re-upload the HTML to Cloudflare — new user appears immediately.
  ────────────────────────────────────────────────────────────────
  */

]; // end SEED_USERS


/* ════════════════════════════════════════════════════════════════
   5. STORAGE KEYS
   ────────────────────────────────────────────────────────────────
   These are the localStorage keys used by the portal.
   Do NOT change these — changing them will lose all saved data.
   ════════════════════════════════════════════════════════════════ */

const LS_KEY       = 'stp_portal_v2';  // stores: USERS array (edited + new users)
const LS_ROLES_KEY = 'stp_roles_v1';   // stores: custom roles array


/* ════════════════════════════════════════════════════════════════
   6. AVATAR COLOR PALETTE
   ────────────────────────────────────────────────────────────────
   Colors auto-assigned to new users created via Admin Panel.
   Cycles through this list.
   ════════════════════════════════════════════════════════════════ */

const AVATAR_COLORS = [
  '#B91C1C',  // Red
  '#0F766E',  // Teal
  '#B45309',  // Amber
  '#1D4ED8',  // Blue
  '#7C3AED',  // Purple
  '#BE185D',  // Rose
  '#15803D',  // Green
  '#C2410C',  // Orange
  '#0E7490',  // Cyan
];


/* ════════════════════════════════════════════════════════════════
   7. ROLES SYSTEM (Runtime — stored in localStorage)
   ────────────────────────────────────────────────────────────────
   BUILTIN_ROLE_IDS: these roles always exist, cannot be deleted
   ROLE_REGISTRY:    runtime object built from builtins + custom
                     Format: { roleId: RoleObject }
   ════════════════════════════════════════════════════════════════ */

const BUILTIN_ROLE_IDS = [
  'admin','dispatch','marketing','management','vendor','accounts','hr'
];

/* ROLE_REGISTRY is initialized at runtime by initRoles() */
let ROLE_REGISTRY = {};

/*
  ROLE OBJECT STRUCTURE (runtime):
  {
    id:        string   — unique role identifier
    name:      string   — display name
    desc:      string   — description
    color:     string   — hex color
    modules:   array    — default module list
    subRights: object   — default sub-rights per module
    isBuiltin: boolean  — true = cannot delete
  }
*/


/* ════════════════════════════════════════════════════════════════
   8. HOW DATA FLOWS
   ────────────────────────────────────────────────────────────────

   ON PAGE LOAD:
   ┌─────────────────────────────────────────────────────────────┐
   │  1. SEED_USERS  ──────────────────────────────────────────  │
   │     (hardcoded in HTML)                                     │
   │                    ┌──────────────────────┐                │
   │                    ↓                      │                │
   │  2. localStorage["stp_portal_v2"]         │                │
   │     (saved edits + new users)             │                │
   │                    ↓                      │                │
   │  3. loadUsers() → MERGE                   │ saveUsers()    │
   │     saved overrides seed by ID            │ (writes back)  │
   │                    ↓                      │                │
   │  4. let USERS = merged array ─────────────┘                │
   └─────────────────────────────────────────────────────────────┘

   ON ADMIN EDIT:
   Admin edits → USERS[idx] mutated → saveUsers() →
   localStorage updated → survives page refresh

   ON NEW USER:
   Admin adds → USERS.push(newUser) → saveUsers() →
   localStorage updated → user appears on next login

   FOR ROLES:
   initRoles() builds ROLE_REGISTRY from BUILTIN_ROLE_IDS + localStorage
   Custom roles saved to localStorage["stp_roles_v1"]
   On Roles pane save → ROLE_REGISTRY updated → ROLE_LABELS updated →
   ROLE_DEFAULTS updated → role dropdowns refreshed

   ════════════════════════════════════════════════════════════════
*/


/* ════════════════════════════════════════════════════════════════
   9. COMPLETE MODULE ID REFERENCE
   ────────────────────────────────────────────────────────────────
   Use these exact IDs in user modules[] and subRights{}
   ════════════════════════════════════════════════════════════════

   MODULE IDs:
   ├── dispatch    → SampleTrack Pro
   ├── vendor      → Vendor Portal
   ├── reports     → Reports Hub
   ├── hr          → HR Module
   ├── production  → Production Tracker
   └── accounts    → Accounts Module

   SUB-MODULE IDs (by module):

   dispatch:
   ├── req       → Sample Requests
   ├── disp      → Dispatch Entry
   ├── track     → Live Tracking
   ├── party     → Party Database
   ├── courier   → Courier Database
   ├── product   → Product Master
   ├── report    → Reports
   └── settings  → Settings & Sync

   vendor:
   ├── vend_list → Vendor List
   ├── vend_po   → Purchase Orders
   ├── vend_inv  → Inventory
   └── vend_pay  → Payments

   reports:
   ├── rpt_dash  → Dashboard
   ├── rpt_disp  → Dispatch Reports
   ├── rpt_sales → Sales Reports
   └── rpt_exp   → Export

   hr:
   ├── hr_emp    → Employee Master
   ├── hr_att    → Attendance
   ├── hr_leave  → Leave Manager
   └── hr_sal    → Salary Register

   production:
   ├── pr_batch  → Batch Records
   ├── pr_qual   → Quality Grades
   └── pr_mat    → Material Log

   accounts:
   ├── ac_inv    → Invoices
   ├── ac_recv   → Receivables
   ├── ac_pay    → Payables
   └── ac_gst    → GST Reports

   ════════════════════════════════════════════════════════════════
*/


/* ════════════════════════════════════════════════════════════════
   10. DEFAULT CREDENTIALS SUMMARY
   ────────────────────────────────────────────────────────────────
   Change all passwords via Admin Panel or by editing SEED_USERS
   above and re-uploading to Cloudflare.
   ════════════════════════════════════════════════════════════════

   ┌─────────────────┬──────────────┬───────────────────┬────────────────────────┐
   │ Name            │ Username     │ Password          │ Access                 │
   ├─────────────────┼──────────────┼───────────────────┼────────────────────────┤
   │ Admin           │ admin        │ admin@strandply   │ All modules (full)     │
   │ Ankit Parmar    │ ankit        │ ankit@123         │ SampleTrack Pro only   │
   │ Suresh Kumar    │ suresh       │ suresh@123        │ Dispatch + Vendor      │
   │ Raj Verma       │ raj          │ raj@123           │ Dispatch + Reports     │
   │ Vendor Manager  │ vendor       │ vendor@123        │ Vendor Portal only     │
   └─────────────────┴──────────────┴───────────────────┴────────────────────────┘

   ════════════════════════════════════════════════════════════════
*/
