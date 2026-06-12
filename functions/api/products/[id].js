// PUT    /api/products/[id] - Update a product
// DELETE /api/products/[id] - Delete a product

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const id = context.params.id;
    const body = await context.request.json();

    await db.prepare(
      `UPDATE vendor_products SET
        name = ?, code = ?, category = ?, unit = ?, alt_unit = ?, conv_factor = ?, hsn = ?,
        gst_rate = ?, moq = ?, lead_time = ?, description = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.name || '',
      body.code || '',
      body.category || '',
      body.unit || '',
      body.alt_unit || '',
      body.conv_factor || 1,
      body.hsn || '',
      body.gst_rate || '',
      body.moq || 0,
      body.lead_time || 0,
      body.description || '',
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
    await db.prepare('DELETE FROM vendor_products WHERE id = ?').bind(id).run();

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
