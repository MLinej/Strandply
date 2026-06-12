// PUT    /api/tnc/[id] - Update a T&C clause
// DELETE /api/tnc/[id] - Delete a T&C clause

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const id = context.params.id;
    const body = await context.request.json();

    await db.prepare(
      `UPDATE vendor_tnc SET
        title = ?, category = ?, version = ?, body = ?, summary = ?, status = ?, applies = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.title || '',
      body.category || '',
      body.version || '1.0',
      body.body || '',
      body.summary || '',
      body.status || 'active',
      body.applies || 'all',
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
    await db.prepare('DELETE FROM vendor_tnc WHERE id = ?').bind(id).run();

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
