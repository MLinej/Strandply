// GET  /api/purchase/state — Fetch full purchase module state (entries, pos, returns, opening_stock, audit, consumption)
// POST /api/purchase/state — Sync state keys to D1 (JSON blob per key)

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT key, value FROM purchase_state').all();
    const out = {};
    (results || []).forEach(row => {
      try { out[row.key] = JSON.parse(row.value); } catch (e) { out[row.key] = null; }
    });

    return jsonResponse(out);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const statements = [];
    const now = new Date().toISOString();

    Object.keys(body).forEach(key => {
      statements.push(
        db.prepare(
          'INSERT OR REPLACE INTO purchase_state (key, value, updated_at) VALUES (?, ?, ?)'
        ).bind(key, JSON.stringify(body[key]), now)
      );
    });

    if (statements.length > 0) {
      await db.batch(statements);
    }

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
