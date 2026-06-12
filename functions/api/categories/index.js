// GET  /api/categories - List all categories
// POST /api/categories - Create a new category

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM vendor_categories ORDER BY sort_order, name').all();
    const categories = (results || []).map(row => ({
      _id: row.id,
      name: row.name,
      icon: row.icon,
      colorClass: row.color_class,
      description: row.description,
      sort_order: row.sort_order,
      status: row.status,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
    }));

    return jsonResponse(categories);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body._id || ('c_' + Date.now());

    await db.prepare(
      `INSERT INTO vendor_categories (
        id, name, icon, color_class, description, sort_order, status, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.name || '',
      body.icon || '🏷️',
      body.colorClass || body.color_class || 'c1',
      body.description || '',
      body.sort_order || 99,
      body.status || 'active',
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
