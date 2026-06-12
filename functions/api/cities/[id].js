// PUT    /api/cities/[id] - Update a city
// DELETE /api/cities/[id] - Delete a city

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const id = context.params.id;
    const body = await context.request.json();

    await db.prepare(
      `UPDATE vendor_cities SET
        city = ?, state = ?, pincodes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.city || '',
      body.state || '',
      JSON.stringify(body.pincodes || []),
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
    await db.prepare('DELETE FROM vendor_cities WHERE id = ?').bind(id).run();

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
