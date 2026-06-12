export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM stock_opening ORDER BY created_at DESC'
    ).all();

    const opening = (results || []).map(row => ({
      sku: row.sku,
      desc: row.desc,
      qty: row.qty,
      date: row.entry_date,
      note: row.note,
      time: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));

    return jsonResponse(opening);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const entry = await context.request.json();
    if (!entry.sku) return jsonResponse({ error: 'SKU is required' }, 400);

    await db.prepare(
      `INSERT INTO stock_opening (
        id, sku, "desc", qty, entry_date, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(entry.time || Date.now()),
      entry.sku,
      entry.desc || '',
      entry.qty || 0,
      entry.date || '',
      entry.note || '',
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

    await db.prepare('DELETE FROM stock_opening WHERE id = ?').bind(id).run();

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
