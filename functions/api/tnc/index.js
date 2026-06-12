// GET  /api/tnc - List all T&C clauses
// POST /api/tnc - Create a new T&C clause

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM vendor_tnc ORDER BY category, title').all();
    const tnc = (results || []).map(row => ({
      _id: row.id,
      title: row.title,
      category: row.category,
      version: row.version,
      body: row.body,
      summary: row.summary,
      status: row.status,
      applies: row.applies,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
    }));

    return jsonResponse(tnc);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body._id || ('tnc_' + Date.now());

    await db.prepare(
      `INSERT INTO vendor_tnc (
        id, title, category, version, body, summary, status, applies, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.title || '',
      body.category || '',
      body.version || '1.0',
      body.body || '',
      body.summary || '',
      body.status || 'active',
      body.applies || 'all',
      body.notes || '',
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
