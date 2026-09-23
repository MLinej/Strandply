// GET  /api/stores/grn — List all GRN entries
// POST /api/stores/grn — Create a new GRN entry

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM stores_grn ORDER BY created_at DESC').all();
    const grns = (results || []).map(row => ({
      id: row.id,
      mrn_id: row.mrn_id,
      date: row.date,
      received_by: row.received_by,
      invoice_no: row.invoice_no,
      quality: row.quality,
      actual_qty: row.actual_qty,
      remarks: row.remarks,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
    }));

    return jsonResponse(grns);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body.id || ('GRN-' + new Date().getFullYear().toString().slice(2) + '-' + String(Date.now()).slice(-6));

    await db.prepare(
      `INSERT INTO stores_grn (id, mrn_id, date, received_by, invoice_no, quality, actual_qty, remarks, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.mrn_id || '',
      body.date || new Date().toISOString().slice(0, 10),
      body.received_by || '',
      body.invoice_no || '',
      body.quality || 'ok',
      body.actual_qty || '',
      body.remarks || '',
      body.status || 'completed',
      body.created_by || '',
      body.created_at || new Date().toISOString()
    ).run();

    return jsonResponse({ success: true, id });
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
