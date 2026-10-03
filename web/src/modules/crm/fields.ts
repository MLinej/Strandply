import { CUSTOMER_STATUSES, CUSTOMER_TYPES, FOLLOWUP_STATUSES, FOLLOWUP_TYPES, LEAD_STAGES, OPP_STAGES, PRIORITIES, QUOTE_STATUSES, TASK_STATUSES, TASK_TYPES } from '@contracts/crm';
import type { FieldDef } from './components/RecordForm';

// Form fields per record kind, as in the legacy CRM's field definitions.

export const LEAD_FIELDS: FieldDef[] = [
  { key: 'companyName', label: 'Company / party name', required: true, wide: true },
  { key: 'contactPerson', label: 'Contact person 1' },
  { key: 'mobile', label: 'Mobile', required: true },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'contactPerson2', label: 'Contact person 2' },
  { key: 'mobile2', label: 'Contact 2 mobile' },
  { key: 'altMobile', label: 'Alternate mobile' },
  { key: 'email', label: 'Email' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'address', label: 'Address', type: 'textarea' },
  { key: 'customerType', label: 'Customer type', type: 'select', options: CUSTOMER_TYPES },
  { key: 'product', label: 'Product interested in', type: 'select', options: 'products' },
  { key: 'source', label: 'Source', type: 'select', options: 'sources' },
  { key: 'campaign', label: 'Campaign', type: 'select', options: 'campaigns' },
  { key: 'salesperson', label: 'Salesperson', type: 'select', options: 'salespersons' },
  { key: 'stage', label: 'Stage', type: 'select', options: LEAD_STAGES, required: true },
  { key: 'nextAction', label: 'Next action' },
  { key: 'nextFollowUpDate', label: 'Next follow-up', type: 'date' },
  { key: 'remarks', label: 'Remarks', type: 'textarea' },
];

export const STAGE_FIELDS: FieldDef[] = [
  { key: 'stage', label: 'Stage', type: 'select', options: LEAD_STAGES, required: true },
  { key: 'nextAction', label: 'Next action' },
  { key: 'nextFollowUpDate', label: 'Next follow-up', type: 'date' },
  { key: 'remarks', label: 'Remarks', type: 'textarea' },
];

export const CUSTOMER_FIELDS: FieldDef[] = [
  { key: 's1', label: 'Basic information', type: 'section' },
  { key: 'companyName', label: 'Company name', required: true, wide: true },
  { key: 'contactPerson', label: 'Contact person 1' },
  { key: 'designation', label: 'Designation' },
  { key: 'mobile', label: 'Mobile', required: true },
  { key: 'contactPerson2', label: 'Contact person 2' },
  { key: 'mobile2', label: 'Contact 2 mobile' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'customerType', label: 'Customer type', type: 'select', options: CUSTOMER_TYPES },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'Pincode' },
  { key: 'address', label: 'Address', type: 'textarea' },
  { key: 'gstin', label: 'GSTIN', upper: true },
  { key: 'pan', label: 'PAN', upper: true },
  { key: 's2', label: 'Business information', type: 'section' },
  { key: 'estMonthlyReq', label: 'Est. monthly requirement' },
  { key: 'productsUsed', label: 'Products used', type: 'select', options: 'products' },
  { key: 'currentSupplier', label: 'Current supplier' },
  { key: 'approxPurchaseValue', label: 'Approx. purchase value' },
  { key: 'preferredThickness', label: 'Preferred thickness' },
  { key: 'preferredSize', label: 'Preferred size' },
  { key: 'application', label: 'Application' },
  { key: 'existingBrand', label: 'Existing brand' },
  { key: 'competitorBrand', label: 'Competitor brand' },
  { key: 'paymentPreference', label: 'Payment preference' },
  { key: 'creditRequirement', label: 'Credit requirement' },
  { key: 'territory', label: 'Territory' },
  { key: 's3', label: 'Relationship', type: 'section' },
  { key: 'leadSource', label: 'Lead source', type: 'select', options: 'sources' },
  { key: 'salesperson', label: 'Salesperson', type: 'select', options: 'salespersons' },
  { key: 'status', label: 'Status', type: 'select', options: CUSTOMER_STATUSES, required: true },
  { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true },
  { key: 'nextFollowUp', label: 'Next follow-up', type: 'date' },
  { key: 'remarks', label: 'Remarks', type: 'textarea' },
];

export const FOLLOWUP_FIELDS: FieldDef[] = [
  { key: 'customerId', label: 'Customer', type: 'customer', required: true },
  { key: 'type', label: 'Type', type: 'select', options: FOLLOWUP_TYPES, required: true },
  { key: 'discussion', label: 'Discussion', type: 'textarea' },
  { key: 'customerResponse', label: 'Customer response', type: 'textarea' },
  { key: 'nextAction', label: 'Next action' },
  { key: 'nextFollowUpDate', label: 'Next follow-up', type: 'date' },
  { key: 'status', label: 'Status', type: 'select', options: FOLLOWUP_STATUSES, required: true },
];

export const OPP_FIELDS: FieldDef[] = [
  { key: 'customerId', label: 'Customer', type: 'customer', required: true },
  { key: 'product', label: 'Product', type: 'select', options: 'products', required: true },
  { key: 'thickness', label: 'Thickness' },
  { key: 'size', label: 'Size' },
  { key: 'quantity', label: 'Quantity', hint: 'e.g. 500 sheets, 2 trucks / month' },
  { key: 'estValuePaise', label: 'Estimated order value', type: 'money', required: true },
  { key: 'expectedClosingDate', label: 'Expected closing', type: 'date' },
  { key: 'salesperson', label: 'Salesperson', type: 'select', options: 'salespersons' },
  { key: 'stage', label: 'Stage', type: 'select', options: OPP_STAGES.filter((s) => s !== 'Order Won' && s !== 'Order Lost'), required: true },
  { key: 'probability', label: 'Probability (%)', type: 'number' },
  { key: 'competitor', label: 'Competitor' },
  { key: 'currentSupplier', label: 'Current supplier' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export const WON_FIELDS: FieldDef[] = [
  { key: 'ratePaise', label: 'Rate', type: 'money' },
  { key: 'orderValuePaise', label: 'Order value', type: 'money', required: true },
  { key: 'dispatchDate', label: 'Expected dispatch', type: 'date' },
  { key: 'reason', label: 'Reason for conversion', type: 'textarea' },
  { key: 'remarks', label: 'Remarks', type: 'textarea' },
];

export const LOST_FIELDS: FieldDef[] = [
  { key: 'lostReason', label: 'Lost reason', type: 'select', options: 'lostReasons', required: true },
  { key: 'competitor', label: 'Competitor' },
  { key: 'reactivationDate', label: 'Reactivate on', type: 'date' },
  { key: 'competitorPricePaise', label: 'Competitor price', type: 'money' },
  { key: 'ourPricePaise', label: 'Our quoted price', type: 'money' },
  { key: 'expectedPricePaise', label: 'Customer expected price', type: 'money' },
  { key: 'remarks', label: 'Detailed remarks', type: 'textarea' },
];

export const QUOTE_FIELDS: FieldDef[] = [
  { key: 'customerId', label: 'Customer', type: 'customer', required: true },
  { key: 'product', label: 'Product', type: 'select', options: 'products', required: true },
  { key: 'quantity', label: 'Quantity', type: 'number', required: true },
  { key: 'ratePaise', label: 'Rate per unit', type: 'money', required: true },
  { key: 'gstPct', label: 'GST %', type: 'number' },
  { key: 'date', label: 'Quotation date', type: 'date' },
  { key: 'validUntil', label: 'Valid until', type: 'date' },
  { key: 'salesperson', label: 'Salesperson', type: 'select', options: 'salespersons' },
  { key: 'status', label: 'Status', type: 'select', options: QUOTE_STATUSES, required: true },
  { key: 'remarks', label: 'Terms / remarks', type: 'textarea' },
];

export const TASK_FIELDS: FieldDef[] = [
  { key: 'type', label: 'Task', type: 'select', options: TASK_TYPES, required: true },
  { key: 'customerId', label: 'Customer', type: 'customer' },
  { key: 'assignedTo', label: 'Assigned to', type: 'select', options: 'salespersons' },
  { key: 'dueDate', label: 'Due date', type: 'date', required: true },
  { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true },
  { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES, required: true },
  { key: 'remarks', label: 'Remarks', type: 'textarea' },
];

export const CAMPAIGN_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Campaign name', required: true, wide: true },
  { key: 'platform', label: 'Platform' },
  { key: 'startDate', label: 'Start', type: 'date' },
  { key: 'endDate', label: 'End', type: 'date' },
  { key: 'budgetPaise', label: 'Budget', type: 'money' },
  { key: 'product', label: 'Product', type: 'select', options: 'products' },
  { key: 'targetAudience', label: 'Target audience' },
];

export const PRODUCT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Product name', required: true },
  { key: 'thickness', label: 'Thickness' },
  { key: 'size', label: 'Size' },
  { key: 'grade', label: 'Grade' },
  { key: 'application', label: 'Application' },
  { key: 'ratePaise', label: 'Standard rate', type: 'money' },
  { key: 'moq', label: 'Minimum order' },
  { key: 'active', label: 'Active (offered in forms)', type: 'checkbox' },
];

export const SALESPERSON_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'mobile', label: 'Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'territory', label: 'Territory' },
  { key: 'designation', label: 'Designation' },
  { key: 'active', label: 'Active', type: 'checkbox' },
];
