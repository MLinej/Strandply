// GET  /api/stores/mrn — List all MRN entries
// POST /api/stores/mrn — Create a new MRN entry

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM stores_mrn ORDER BY created_at DESC').all();
    const mrns = (results || []).map(row => ({
      id: row.id,
      date: row.date,
      time: row.time,
      vehicle: row.vehicle,
      driver: row.driver,
      vendor: row.vendor,
      invoice_no: row.invoice_no,
      security_guard: row.security_guard,
      items: JSON.parse(row.items || '[]'),
      gate_remarks: row.gate_remarks,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
    }));

    return jsonResponse(mrns);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body.id || ('MRN-' + new Date().getFullYear().toString().slice(2) + '-' + String(Date.now()).slice(-6));

    await db.prepare(
      `INSERT INTO stores_mrn (id, date, time, vehicle, driver, vendor, invoice_no, security_guard, items, gate_remarks, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.date || new Date().toISOString().slice(0, 10),
      body.time || '',
      body.vehicle || '',
      body.driver || '',
      body.vendor || '',
      body.invoice_no || '',
      body.security_guard || '',
      JSON.stringify(body.items || []),
      body.gate_remarks || '',
      body.status || 'pending',
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
