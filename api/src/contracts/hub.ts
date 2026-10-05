// Reports Hub contracts (legacy Reports Hub: legacy/reports/index.html). Shared by the API and the web app.
// Read-only views across modules for a date range: purchase, production, stock, electricity, sales, maintenance,
// cross-module analytics (cost per board, power per board), and the daily / monthly / FY consolidated reports.
// Money is integer paise.

export interface Named {
  name: string;
  value: number;
}
export interface MonthValue {
  month: string;
  value: number;
}

export interface HubPurchase {
  entries: number;
  valuePaise: number;
  vendors: number;
  /** Payable still open on the entries (status not approved counts as pending). */
  pendingEntries: number;
  byMaterial: { material: string; label: string; unit: string; entries: number; qty: number; valuePaise: number }[];
  byMonth: MonthValue[];
  topVendors: Named[];
  recent: { id: string; date: string; material: string; vendor: string; invoiceNo: string; qty: number; unit: string; valuePaise: number }[];
}

export interface HubProduction {
  reports: number;
  boards: number;
  byMonth: MonthValue[];
  byProduct: { product: string; reports: number; boards: number }[];
  byShift: Named[];
}

export interface HubElectricity {
  bills: number;
  billedUnits: number;
  billedPaise: number;
  /** From the meter readings (net kWh and the estimate), day by day. */
  meteredUnits: number;
  meteredPaise: number;
  byMonth: { month: string; billedPaise: number; meteredUnits: number; meteredPaise: number }[];
  billList: { id: string; billDate: string; dueDate: string | null; paidDate: string | null; units: number | null; totalPaise: number }[];
}

export interface HubSales {
  invoices: number;
  revenuePaise: number;
  tons: number;
  pendingApproval: number;
  byMonth: MonthValue[];
  topCustomers: Named[];
  byFirm: Named[];
  /** Open sales orders now (any date): value and weight by party. */
  pendingOrders: { soNo: string; firm: string; date: string; party: string; status: string; tons: number; valuePaise: number }[];
  pendingPaise: number;
  pendingTons: number;
  pipeline: { status: string; orders: number; valuePaise: number }[];
  recent: { id: string; invNo: string; date: string; firm: string; party: string; tons: number; totalPaise: number }[];
}

export interface HubMaintenance {
  workOrders: number;
  open: number;
  overdue: number;
  completed: number;
  byCategory: Named[];
  byPriority: Named[];
  openList: { id: string; woNo: string; title: string; category: string; priority: string; assignee: string; dueDate: string; status: string; overdue: boolean }[];
}

export interface HubStock {
  fy: string;
  /** Raw material from the Purchase inventory ledger (opening + purchases − returns − consumption). */
  raw: { material: string; label: string; unit: string; openQty: number; purchQty: number; consumeQty: number; closingQty: number; closingPaise: number }[];
  rawClosingPaise: number;
  /** SKU stock now, by department (Stock module). */
  sku: { dept: string; skus: number; qty: number }[];
}

export interface HubAnalytics {
  /** Raw material purchased + power (metered estimate) in the range. */
  costPaise: number;
  boards: number;
  costPerBoardPaise: number | null;
  /** Metered net kWh per 1,000 boards. */
  kwhPerThousand: number | null;
  rawShare: number | null;
  byMonth: { month: string; boards: number; rawPaise: number; powerPaise: number; units: number; costPerBoardPaise: number | null; kwhPerThousand: number | null }[];
}

export interface HubOverview {
  from: string;
  to: string;
  purchasePaise: number;
  purchaseEntries: number;
  boards: number;
  hpReports: number;
  powerPaise: number;
  powerUnits: number;
  revenuePaise: number;
  invoices: number;
  costPerBoardPaise: number | null;
  openWorkOrders: number;
  months: { month: string; purchasePaise: number; boards: number; powerPaise: number; revenuePaise: number }[];
  materialShare: Named[];
}

/** Daily, monthly and FY consolidated report (legacy Daily / Monthly / FY Report). */
export interface HubPeriod {
  from: string;
  to: string;
  purchase: HubPurchase;
  production: HubProduction;
  electricity: HubElectricity & { readings: number };
  sales: HubSales;
  maintenance: HubMaintenance;
  /** Other modules for the same days. */
  others: { complaints: number; complaintsOpen: number; freightOrders: number; freightPaise: number; plans: number; plansAchievedPct: number | null };
}

export interface HubSource {
  module: string;
  page: string;
  records: number;
  label: string;
  /** Latest change. */
  updatedAt: string | null;
}
