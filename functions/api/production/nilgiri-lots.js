export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      "SELECT lot_no, entry_date, vendor_name, invoice_no, po_no, mrn_no, inv_qty, spl_qty, rate, dn_rate_diff, dn_status FROM erp_purchases WHERE material_type LIKE '%Nilgiri%' ORDER BY entry_date DESC"
    ).all();

    const lots = (results || []).map(row => ({
      lot: row.lot_no || '',
      date: row.entry_date || '',
      vendor: row.vendor_name || '',
      inv_no: row.invoice_no || '',
      po: row.po_no || '',
      mrn: row.mrn_no || '',
      inv_qty: String(row.inv_qty || 0),
      spl_qty: String(row.spl_qty || 0),
      rate: String(row.rate || 0),
      rate_diff: String(row.dn_rate_diff || 0),
      note_type: row.dn_status === 'Issued' ? 'debit' : 'none'
    }));

    return jsonResponse(lots);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
