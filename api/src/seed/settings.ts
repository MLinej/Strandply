/** Default st_settings values. Same as the INSERT in db/migrations/0003_sampletrack_seed.sql (a test keeps them in sync). */
export const DEFAULT_SETTINGS: Record<string, unknown> = {
  'company.name': 'Strandply LLP',
  'company.llpin': 'AAP-7300',
  'company.address_line': 'Wankaner, Morbi, Gujarat',
  'company.phone': '',
  'company.gst': '',
  'sheets.spreadsheet_id': '',
  'sheets.webapp_url': '',
  'sheets.interval_min': 0,
  'sheets.last_sync_at': null,
};
