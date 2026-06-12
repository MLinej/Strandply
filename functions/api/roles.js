// GET  /api/roles — List all custom roles from D1
// POST /api/roles — Create, Update, or Delete a custom role
//   Body: { action: 'create'|'update'|'delete', ...fields }

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM custom_roles ORDER BY name'
    ).all();

    const roles = (results || []).map(row => ({
      id: row.id,
      name: row.name,
      desc: row.description,
      color: row.color,
      modules: JSON.parse(row.modules || '[]'),
      subRights: JSON.parse(row.sub_rights || '{}'),
      isBuiltin: false,
    }));

    return jsonResponse({ roles });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const { action } = body;

    // ─── CREATE ───
    if (action === 'create') {
      const { id, name, desc, color, modules, subRights } = body;

      if (!id || !name) {
        return jsonResponse({ error: 'Role ID and name are required' }, 400);
      }

      // Check if role ID already exists
      const existing = await db.prepare(
        'SELECT id FROM custom_roles WHERE id = ?'
      ).bind(id).first();
      if (existing) {
        return jsonResponse({ error: `Role ID "${id}" already exists` }, 409);
      }

      await db.prepare(
        `INSERT INTO custom_roles (id, name, description, color, modules, sub_rights)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        name,
        desc || '',
        color || '#374151',
        JSON.stringify(modules || []),
        JSON.stringify(subRights || {})
      ).run();

      return jsonResponse({ success: true });
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, name, desc, color, modules, subRights } = body;

      if (!id) return jsonResponse({ error: 'Role ID is required' }, 400);

      await db.prepare(
        `UPDATE custom_roles SET name = ?, description = ?, color = ?,
         modules = ?, sub_rights = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(
        name || '',
        desc || '',
        color || '#374151',
        JSON.stringify(modules || []),
        JSON.stringify(subRights || {}),
        id
      ).run();

      return jsonResponse({ success: true });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'Role ID is required' }, 400);

      await db.prepare('DELETE FROM custom_roles WHERE id = ?').bind(id).run();
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

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
