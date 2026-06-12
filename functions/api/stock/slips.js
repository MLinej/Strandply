export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM stock_slips ORDER BY created_at DESC'
    ).all();

    const slips = (results || []).map(row => ({
      id: isNaN(Number(row.id)) ? row.id : Number(row.id),
      type: row.slip_type,
      no: row.slip_no,
      fromId: row.from_id,
      fromSku: row.from_sku,
      fromThick: row.from_thick,
      toId: row.to_id,
      toSku: row.to_sku,
      toThick: row.to_thick,
      qty: row.qty,
      batch: row.batch,
      refNo: row.ref_no,
      shift: row.shift,
      remarks: row.remarks,
      time: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));

    return jsonResponse(slips);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const slip = await context.request.json();
    if (!slip.no) return jsonResponse({ error: 'Slip number is required' }, 400);

    await db.prepare(
      `INSERT INTO stock_slips (
        id, slip_type, slip_no, from_id, from_sku, from_thick, to_id, to_sku, to_thick,
        qty, batch, ref_no, shift, remarks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(slip.id || Date.now()),
      slip.type || 'SIS',
      slip.no,
      slip.fromId || '',
      slip.fromSku || '',
      slip.fromThick || '',
      slip.toId || '',
      slip.toSku || '',
      slip.toThick || '',
      slip.qty || 0,
      slip.batch || '',
      slip.refNo || '',
      slip.shift || '',
      slip.remarks || '',
      slip.time ? new Date(slip.time).toISOString() : new Date().toISOString()
    ).run();

    return jsonResponse({ success: true });
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
