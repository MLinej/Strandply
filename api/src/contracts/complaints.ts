// Complaints module contracts (legacy Complaint Registration: legacy/complaint/index.html). Shared by the API and the web app.
// Customer complaints raised by salesmen, numbered per FY, with photo evidence and a case timeline (status changes,
// edits, comments with photos and videos); notification recipients; party-, issue- and month-wise reports.

export const CP_MATERIALS = ['OSB Board', 'Plywood', 'Face Veneer', 'Core Veneer', 'Block Board', 'Flush Door', 'Other'] as const;
export const CP_CATEGORIES = ['Quality Issue', 'Quantity Shortage', 'Damage in Transit', 'Delayed Delivery', 'Billing / Invoice Issue', 'Wrong Material Supplied', 'Other'] as const;
export const CP_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type CpPriority = (typeof CP_PRIORITIES)[number];
export const CP_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'] as const;
export type CpStatus = (typeof CP_STATUSES)[number];
/** Open and In Progress still need action; Resolved and Closed are done (legacy report split). */
export const isOpenStatus = (s: CpStatus) => s === 'Open' || s === 'In Progress';

/** Per complaint (legacy limit); comment videos up to 10 MB each. */
export const MAX_COMPLAINT_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

interface Audit {
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CpRecipient extends Audit {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  active: boolean;
}

export interface CpFile {
  id: string;
  kind: 'photo' | 'video';
  name: string;
  mime: string;
  sizeBytes: number;
  blobKey: string;
}

export const TIMELINE_KINDS = ['created', 'edited', 'status', 'comment'] as const;
export interface CpEvent {
  id: string;
  type: (typeof TIMELINE_KINDS)[number];
  text: string;
  by: string | null;
  byName: string;
  at: string;
  files: CpFile[];
}

export interface Complaint extends Audit {
  id: string;
  /** CMP/26-27/0001 */
  complaintNo: string;
  date: string;
  salesman: string;
  /** Sales party when picked from the party master; the name is kept either way. */
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerLocation: string | null;
  /** Sales invoice the complaint is about (optional). */
  invoiceId: string | null;
  invoiceNo: string | null;
  material: string;
  category: string;
  priority: CpPriority;
  description: string;
  /** Who was notified (a snapshot of the recipient). */
  recipientName: string;
  recipientEmail: string | null;
  status: CpStatus;
  /** Business date it was last marked Resolved or Closed; cleared when reopened. */
  resolvedOn: string | null;
  photos: CpFile[];
  /** Oldest first. */
  timeline: CpEvent[];
}

export interface ComplaintFilters {
  status: string;
  priority: string;
  category: string;
  material: string;
  customerName: string;
  salesman: string;
  /** Open or In Progress. */
  open: boolean;
  from: string;
  to: string;
}

/** Files are listed without their storage keys. */
export type FileView = Omit<CpFile, 'blobKey'>;
export interface ComplaintView extends Omit<Complaint, 'photos' | 'timeline'> {
  photos: FileView[];
  timeline: (Omit<CpEvent, 'files'> & { files: FileView[] })[];
}

export interface ComplaintsMeta {
  /** Sales parties, then names already used on complaints (legacy party master). */
  parties: { id: string | null; name: string; city: string | null; phone: string | null }[];
  salesmen: string[];
  recipients: CpRecipient[];
  today: string;
}

export interface Named {
  name: string;
  value: number;
}

export interface ComplaintsDashboard {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  /** Critical and still open. */
  critical: number;
  recent: ComplaintView[];
  byCategory: Named[];
}

export interface PartyRow {
  name: string;
  total: number;
  open: number;
  resolved: number;
}
export interface ComplaintsReports {
  total: number;
  open: number;
  resolved: number;
  /** Days from the complaint date to resolved, average over resolved ones (one decimal). */
  avgDaysToResolve: number | null;
  byParty: PartyRow[];
  byCategory: (Named & { share: number })[];
  byMaterial: Named[];
  bySalesman: PartyRow[];
  byMonth: Named[];
  /** Financial years that have complaints (for the FY picker). */
  years: string[];
}
