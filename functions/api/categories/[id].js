// PUT    /api/categories/[id] - Update a category
// DELETE /api/categories/[id] - Delete a category

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const id = context.params.id;
    const body = await context.request.json();

    await db.prepare(
      `UPDATE vendor_categories SET
        name = ?, icon = ?, color_class = ?, description = ?, sort_order = ?, status = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.name || '',
      body.icon || '🏷️',
      body.colorClass || body.color_class || 'c1',
      body.description || '',
      body.sort_order || 99,
      body.status || 'active',
      body.notes || '',
      id
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

    const id = context.params.id;
    await db.prepare('DELETE FROM vendor_categories WHERE id = ?').bind(id).run();

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
