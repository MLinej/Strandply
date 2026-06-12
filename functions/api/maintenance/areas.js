// Maintenance Areas API — CRUD for maintenance_areas table

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM maintenance_areas WHERE is_active = 1 ORDER BY name ASC'
    ).all();

    return jsonResponse(results || []);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    if (!body.name || !body.name.trim()) {
      return jsonResponse({ error: 'Area name is required' }, 400);
    }

    const name = body.name.trim();
    const id = body.id || ('ma-' + Date.now());

    // Check for duplicates
    const existing = await db.prepare(
      'SELECT id FROM maintenance_areas WHERE name = ?'
    ).bind(name).first();

    if (existing) {
      // Reactivate if was deactivated
      await db.prepare(
        'UPDATE maintenance_areas SET is_active = 1 WHERE id = ?'
      ).bind(existing.id).run();
      return jsonResponse({ success: true, id: existing.id, reactivated: true });
    }

    await db.prepare(
      'INSERT INTO maintenance_areas (id, name, is_active) VALUES (?, ?, 1)'
    ).bind(id, name).run();

    return jsonResponse({ success: true, id });
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
    const name = url.searchParams.get('name');

    if (!id && !name) return jsonResponse({ error: 'ID or name query param is required' }, 400);

    // Check if area is in use
    const condition = id ? 'id = ?' : 'name = ?';
    const param = id || name;

    const area = await db.prepare(
      `SELECT name FROM maintenance_areas WHERE ${condition}`
    ).bind(param).first();

    if (area) {
      const inUse = await db.prepare(
        'SELECT COUNT(*) as cnt FROM maintenance_work_orders WHERE area = ?'
      ).bind(area.name).first();

      if (inUse && inUse.cnt > 0) {
        return jsonResponse({ error: 'Cannot remove — work orders exist for this area.' }, 400);
      }
    }

    // Soft-delete (deactivate)
    await db.prepare(
      `UPDATE maintenance_areas SET is_active = 0 WHERE ${condition}`
    ).bind(param).run();

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
