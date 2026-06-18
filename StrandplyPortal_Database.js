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
    status:     'live',
    url:        'vendor/index.html',
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

  /* ── MODULE 5: Production MIS ── */
  {
    id:         'production',
    name:       'Production MIS',
    desc:       'Chipping, Hot Press & Matt Weight System',
    icon:       '⚙️',
    color:      'ct-purple',
    status:     'live',
    url:        'production/index.html',
    urlDisplay: 'strandply.in/production',
    features: [
      'Chipping report & lot tracking',
      'Hot Press charge management',
      'Matt Weight recording system',
      'Production summary & analytics',
      'Material consumption tracking',
    ],
    subModules: [
      { id:'pr_batch',  name:'Batch Records',   desc:'Production batch entry & tracking' },
      { id:'pr_qual',   name:'Quality Grades',  desc:'Grade inspection records' },
      { id:'pr_mat',    name:'Material Log',    desc:'Material consumption tracking' },
      { id:'pr_weight', name:'Weight System',   desc:'Matt weight punch & batch management' },
    ]
  },

  /* ── MODULE 6: Transport Module ── */
  {
    id:         'transport',
    name:       'Transport Module',
    desc:       'Freight Inquiry, Rate Comparison & Order Flow',
    icon:       '🚛',
    color:      'ct-rose',
    status:     'live',
    url:        'transport/index.html',
    urlDisplay: 'strandply.in/transport',
    features: [
      'Transport inquiry management',
      'Multi-transporter rate comparison',
      'Freight approval workflow',
      'Order form generation',
      'Trip tracking & reports',
    ],
    subModules: [
      { id:'tr_inq',   name:'Inquiries',       desc:'Create & manage transport inquiries' },
      { id:'tr_rate',  name:'Rate Comparison',  desc:'Compare transporter rates' },
      { id:'tr_appr',  name:'Approvals',        desc:'Freight approval workflow' },
      { id:'tr_order', name:'Order Forms',      desc:'Generate transport order forms' },
      { id:'tr_track', name:'Trip Tracking',    desc:'Track active shipments' },
    ]
  },

  /* ── MODULE 7: Purchase ERP ── */
  {
    id:         'erp',
    name:       'Purchase ERP',
    desc:       'Raw Material Purchase & Inventory Management',
    icon:       '📋',
    color:      'ct-amber',
    status:     'live',
    url:        'erp/index.html',
    urlDisplay: 'strandply.in/erp',
    features: [
      'Multi-material purchase registers',
      'Purchase order management',
      'Vendor-linked invoicing',
      'Debit/Credit note tracking',
      'Inventory & analytics dashboard',
    ],
    subModules: [
      { id:'erp_entry',  name:'Purchase Entry',    desc:'Material-wise purchase records' },
      { id:'erp_po',     name:'Purchase Orders',   desc:'PO creation & tracking' },
      { id:'erp_truck',  name:'Truck Register',    desc:'Truck-wise inward register' },
      { id:'erp_dncn',   name:'Debit/Credit Notes', desc:'DN/CN management' },
      { id:'erp_inv',    name:'Inventory',         desc:'Stock levels & analytics' },
      { id:'erp_report', name:'Reports',           desc:'Purchase analytics & export' },
    ]
  },

  /* ── MODULE 8: Accounts Module ── */
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

  /* ── MODULE 9: Stock Management ── */
  {
    id:         'stock',
    name:       'Stock Management',
    desc:       'Raw Material & SKU Stock tracking, SIS/SRS slips',
    icon:       '📦',
    color:      'ct-teal',
    status:     'live',
    url:        'stock/index.html',
    urlDisplay: 'strandply.in/stock',
    features: [
      'Live Stock tracking',
      'Stock Inward/Outward slips',
      'Ledger & transaction logs',
      'Department reclassifications',
      'Master data management',
    ],
    subModules: [
      { id:'stk_slip',   name:'Stock Slips',       desc:'Create & view SIS/SRS stock slips' },
      { id:'stk_ledger', name:'SKU Ledger',        desc:'Transaction history ledger per SKU' },
      { id:'stk_stock',  name:'Live Stock',        desc:'Real-time stock reports' },
      { id:'stk_reclass',name:'Reclassification',  desc:'Reclassify stock between departments' },
      { id:'stk_master', name:'Master SKU',        desc:'Manage SKU catalogue' },
    ]
  },

  /* ── MODULE 10: Maintenance Tracker ── */
  {
    id:         'maintenance',
    name:       'Maintenance Tracker',
    desc:       'Plant Maintenance Work Order Management',
    icon:       '🔧',
    color:      'ct-green',
    status:     'live',
    url:        'maintenance/index.html',
    urlDisplay: 'strandply.in/maintenance',
    features: [
      'Work order creation & tracking',
      'Priority & status management',
      'Plant area mapping',
      'Activity timeline & notes',
      'PDF generation & WhatsApp share',
    ],
    subModules: [
      { id:'mt_wo',       name:'Work Orders',      desc:'Create & manage maintenance work orders' },
      { id:'mt_board',    name:'Kanban Board',     desc:'Visual board view of work orders' },
      { id:'mt_area',     name:'Area Management',  desc:'Manage plant areas' },
      { id:'mt_timeline', name:'Timeline & Notes', desc:'Activity log & note posting' },
      { id:'mt_export',   name:'Export & Share',   desc:'PDF download & WhatsApp sharing' },
    ]
  },

  /* ── MODULE 11: Electricity & Meter MIS ── */
  {
    id:         'electricity',
    name:       'Electricity & Meter MIS',
    desc:       'Meter Readings, PGVCL Bills & Cost Analysis',
    icon:       '⚡',
    color:      'ct-amber',
    status:     'live',
    url:        'electricity/index.html',
    urlDisplay: 'strandply.in/electricity',
    features: [
      'AM/PM meter reading punch',
      '12-Hr & 24-Hr consumption views',
      'Monthly cost & trend analysis',
      'PGVCL bill management',
      'Meter config & tariff history',
    ],
    subModules: [
      { id:'el_dash',    name:'Dashboard',         desc:'KPI summary & monthly trends' },
      { id:'el_punch',   name:'Meter Reading',     desc:'Punch AM/PM meter readings' },
      { id:'el_12hr',    name:'12-Hr View',        desc:'Shift-wise consumption breakdown' },
      { id:'el_24hr',    name:'24-Hr View',        desc:'Daily combined consumption' },
      { id:'el_monthly', name:'Monthly Report',    desc:'Aggregated monthly analysis' },
      { id:'el_bills',   name:'PGVCL Bills',       desc:'Bill records & payment tracking' },
    ]
  },

  /* ── MODULE 12: DWPAS ── */
  {
    id:         'dwpas',
    name:       'DWPAS',
    desc:       'Daily Work Planning & Achievement System',
    icon:       '📋',
    color:      'ct-red',
    status:     'live',
    url:        'dwpas/index.html',
    urlDisplay: 'strandply.in/dwpas',
    features: [
      'Daily plan entry & register',
      'Achievement entry & tracking',
      'Variance analysis & reports',
      'HR manpower management',
      'Department & employee master data',
    ],
    subModules: [
      { id:'dw_dash',     name:'Dashboard',          desc:'KPI summary & dept-wise overview' },
      { id:'dw_plan',     name:'Daily Plan Entry',    desc:'Create & manage daily work plans' },
      { id:'dw_register', name:'Plan Register',       desc:'View & edit all planned dates' },
      { id:'dw_achieve',  name:'Achievement Entry',   desc:'Record actual vs planned achievements' },
      { id:'dw_variance', name:'Variance Analysis',   desc:'Analyze plan vs achievement gaps' },
      { id:'dw_hr',       name:'HR Manpower',         desc:'Manpower tracking per department' },
      { id:'dw_dept',     name:'Department Master',   desc:'Manage department records' },
      { id:'dw_emp',      name:'Employee Master',     desc:'Manage employee records' },
    ]
  },

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
  transport:  'Transport Executive',
  erp:        'Purchase Manager',
  stock:      'Stock Manager',
  maintenance:'Maintenance Manager',
  electricity:'Meter Executive',
  dwpas:      'DWPAS Manager',

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
    modules: ['dispatch','vendor','reports','hr','production','transport','erp','accounts','stock','maintenance','electricity','dwpas'],
    subRights: {
      dispatch:   ['req','disp','track','party','courier','product','report','settings'],
      vendor:     ['vend_list','vend_po','vend_inv','vend_pay'],
      reports:    ['rpt_dash','rpt_disp','rpt_sales','rpt_exp'],
      hr:         ['hr_emp','hr_att','hr_leave','hr_sal'],
      production: ['pr_batch','pr_qual','pr_mat','pr_weight'],
      transport:  ['tr_inq','tr_rate','tr_appr','tr_order','tr_track'],
      erp:        ['erp_entry','erp_po','erp_truck','erp_dncn','erp_inv','erp_report'],
      accounts:   ['ac_inv','ac_recv','ac_pay','ac_gst'],
      stock:      ['stk_slip','stk_ledger','stk_stock','stk_reclass','stk_master'],
      maintenance:['mt_wo','mt_board','mt_area','mt_timeline','mt_export'],
      electricity:['el_dash','el_punch','el_12hr','el_24hr','el_monthly','el_bills'],
      dwpas:      ['dw_dash','dw_plan','dw_register','dw_achieve','dw_variance','dw_hr','dw_dept','dw_emp'],
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

  transport: {
    modules: ['transport'],
    subRights: { transport: ['tr_inq','tr_rate','tr_appr','tr_order','tr_track'] }
  },

  erp: {
    modules: ['erp'],
    subRights: { erp: ['erp_entry','erp_po','erp_truck','erp_dncn','erp_inv','erp_report'] }
  },

  stock: {
    modules: ['stock'],
    subRights: { stock: ['stk_slip','stk_ledger','stk_stock','stk_reclass','stk_master'] }
  },

  maintenance: {
    modules: ['maintenance'],
    subRights: { maintenance: ['mt_wo','mt_board','mt_area','mt_timeline','mt_export'] }
  },

  electricity: {
    modules: ['electricity'],
    subRights: { electricity: ['el_dash','el_punch','el_12hr','el_24hr','el_monthly','el_bills'] }
  },

  dwpas: {
    modules: ['dwpas'],
    subRights: { dwpas: ['dw_dash','dw_plan','dw_register','dw_achieve','dw_variance','dw_hr','dw_dept','dw_emp'] }
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
    modules:  ['dispatch','vendor','reports','hr','production','transport','erp','accounts','stock','maintenance','electricity','dwpas'],
    subRights: {
      dispatch:   ['req','disp','track','party','courier','product','report','settings'],
      vendor:     ['vend_list','vend_po','vend_inv','vend_pay'],
      reports:    ['rpt_dash','rpt_disp','rpt_sales','rpt_exp'],
      hr:         ['hr_emp','hr_att','hr_leave','hr_sal'],
      production: ['pr_batch','pr_qual','pr_mat','pr_weight'],
      transport:  ['tr_inq','tr_rate','tr_appr','tr_order','tr_track'],
      erp:        ['erp_entry','erp_po','erp_truck','erp_dncn','erp_inv','erp_report'],
      accounts:   ['ac_inv','ac_recv','ac_pay','ac_gst'],
      stock:      ['stk_slip','stk_ledger','stk_stock','stk_reclass','stk_master'],
      maintenance:['mt_wo','mt_board','mt_area','mt_timeline','mt_export'],
      electricity:['el_dash','el_punch','el_12hr','el_24hr','el_monthly','el_bills'],
      dwpas:      ['dw_dash','dw_plan','dw_register','dw_achieve','dw_variance','dw_hr','dw_dept','dw_emp'],
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

  /* ── METER EXECUTIVE ── */
  {
    id:       'u006',
    name:     'Meter Executive',
    username: 'meter',
    password: 'meter@123',
    role:     'electricity',
    dept:     'Meter Department',
    avatar:   'ME',
    color:    '#B45309',
    modules:  ['electricity'],
    subRights: {
      electricity: ['el_dash','el_punch','el_12hr','el_24hr','el_monthly','el_bills']
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
  'admin','dispatch','marketing','management','vendor','accounts','hr','transport','erp','stock','maintenance','electricity','dwpas'
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
   ├── production  → Production MIS
   ├── transport   → Transport Module
   ├── erp         → Purchase ERP
   ├── accounts    → Accounts Module
   ├── stock       → Stock Management
   ├── maintenance → Maintenance Tracker
   ├── electricity → Electricity & Meter MIS
   └── dwpas       → DWPAS

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
   ├── pr_mat    → Material Log
   └── pr_weight → Weight System

   transport:
   ├── tr_inq    → Inquiries
   ├── tr_rate   → Rate Comparison
   ├── tr_appr   → Approvals
   ├── tr_order  → Order Forms
   └── tr_track  → Trip Tracking

   erp:
   ├── erp_entry  → Purchase Entry
   ├── erp_po     → Purchase Orders
   ├── erp_truck  → Truck Register
   ├── erp_dncn   → Debit/Credit Notes
   ├── erp_inv    → Inventory
   └── erp_report → Reports

   accounts:
   ├── ac_inv    → Invoices
   ├── ac_recv   → Receivables
   ├── ac_pay    → Payables
   └── ac_gst    → GST Reports

   stock:
   ├── stk_slip    → Stock Slips
   ├── stk_ledger  → SKU Ledger
   ├── stk_stock   → Live Stock
   ├── stk_reclass → Reclassification
   └── stk_master  → Master SKU

   maintenance:
   ├── mt_wo       → Work Orders
   ├── mt_board    → Kanban Board
   ├── mt_area     → Area Management
   ├── mt_timeline → Timeline & Notes
   └── mt_export   → Export & Share

   electricity:
   ├── el_dash    → Dashboard
   ├── el_punch   → Meter Reading
   ├── el_12hr    → 12-Hr View
   ├── el_24hr    → 24-Hr View
   ├── el_monthly → Monthly Report
   └── el_bills   → PGVCL Bills

   dwpas:
   ├── dw_dash     → Dashboard
   ├── dw_plan     → Daily Plan Entry
   ├── dw_register → Plan Register
   ├── dw_achieve  → Achievement Entry
   ├── dw_variance → Variance Analysis
   ├── dw_hr       → HR Manpower
   ├── dw_dept     → Department Master
   └── dw_emp      → Employee Master

   ════════════════════════════════════════════════════════════════
*/


/* ════════════════════════════════════════════════════════════════
   10. DEFAULT CREDENTIALS SUMMARY
   ────────────────────────────────────────────────────────────────
   Change all passwords via Admin Panel or by editing SEED_USERS
   above and re-uploading to Cloudflare.
   ════════════════════════════════════════════════════════════════

   ┌─────────────────┬──────────────┬───────────────────┬──────────────────────────────────┐
   │ Name            │ Username     │ Password          │ Access                           │
   ├─────────────────┼──────────────┼───────────────────┼──────────────────────────────────┤
   │ Admin           │ admin        │ admin@strandply   │ All modules (full)               │
   │ Ankit Parmar    │ ankit        │ ankit@123         │ SampleTrack Pro only             │
   │ Suresh Kumar    │ suresh       │ suresh@123        │ Dispatch + Vendor                │
   │ Raj Verma       │ raj          │ raj@123           │ Dispatch + Reports               │
   │ Vendor Manager  │ vendor       │ vendor@123        │ Vendor Portal only               │
   │ Meter Executive │ meter        │ meter@123         │ Electricity & Meter MIS only     │
   └─────────────────┴──────────────┴───────────────────┴──────────────────────────────────┘

   ════════════════════════════════════════════════════════════════
*/
