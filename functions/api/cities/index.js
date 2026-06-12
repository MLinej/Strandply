// GET  /api/cities - List all cities
// POST /api/cities - Create a new city

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM vendor_cities ORDER BY city').all();
    const cities = (results || []).map(row => ({
      _id: row.id,
      city: row.city,
      state: row.state,
      pincodes: JSON.parse(row.pincodes || '[]'),
    }));

    return jsonResponse(cities);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body._id || ('ct_' + Date.now());

    await db.prepare(
      `INSERT INTO vendor_cities (id, city, state, pincodes) VALUES (?, ?, ?, ?)`
    ).bind(
      id,
      body.city || '',
      body.state || '',
      JSON.stringify(body.pincodes || [])
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
