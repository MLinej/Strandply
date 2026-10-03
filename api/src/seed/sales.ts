import { DEFAULT_BRANDS, DEFAULT_DELIVERY_TERMS, DEFAULT_EMAIL_RECIPIENTS, DEFAULT_FIRM_STATE_CODES, DEFAULT_GRADES, DEFAULT_PAYMENT_TERMS } from '../contracts/sales';

/** Sales settings (st_settings keys). Same as the seed rows in db/migrations/0010_sales.sql. */
export const DEFAULT_SALES_SETTINGS: Record<string, unknown> = {
  'sales.payment_terms': DEFAULT_PAYMENT_TERMS,
  'sales.delivery_terms': DEFAULT_DELIVERY_TERMS,
  'sales.sales_persons': [],
  'sales.brands': DEFAULT_BRANDS,
  'sales.grades': DEFAULT_GRADES,
  'sales.firm_state_codes': DEFAULT_FIRM_STATE_CODES,
  'sales.email_recipients': DEFAULT_EMAIL_RECIPIENTS,
  /** {} = the built-in DEFAULT_EMAIL_TEMPLATES; saving in Settings stores them. */
  'sales.email_templates': {},
};
