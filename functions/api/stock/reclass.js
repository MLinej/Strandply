export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM stock_reclass ORDER BY created_at DESC'
    ).all();

    const reclass = (results || []).map(row => ({
      no: row.str_no,
      fromSku: row.from_sku,
      toSku: row.to_sku,
      qty: row.qty,
      reason: row.reason,
      ref: row.ref,
      date: row.entry_date,
      fromDesc: row.from_desc,
      toDesc: row.to_desc,
      fromDept: row.from_dept,
      toDept: row.to_dept,
      scenario: row.scenario,
      time: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));

    return jsonResponse(reclass);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const entry = await context.request.json();
    if (!entry.no) return jsonResponse({ error: 'STR number is required' }, 400);

    await db.prepare(
      `INSERT INTO stock_reclass (
        id, str_no, from_sku, to_sku, qty, reason, ref, entry_date,
        from_desc, to_desc, from_dept, to_dept, scenario, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(entry.time || Date.now()),
      entry.no,
      entry.fromSku,
      entry.toSku,
      entry.qty || 0,
      entry.reason || '',
      entry.ref || '',
      entry.date || '',
      entry.fromDesc || '',
      entry.toDesc || '',
      entry.fromDept || '',
      entry.toDept || '',
      entry.scenario || '',
      entry.time ? new Date(entry.time).toISOString() : new Date().toISOString()
    ).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID query param is required' }, 400);

    await db.prepare('DELETE FROM stock_reclass WHERE id = ?').bind(id).run();

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
