// PUT    /api/vendors/[id] - Update a vendor
// DELETE /api/vendors/[id] - Delete a vendor

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const id = context.params.id;
    const body = await context.request.json();

    await db.prepare(
      `UPDATE vendor_records SET
        name = ?, code = ?, type = ?, categories = ?, products = ?, contact = ?, designation = ?,
        phone = ?, email = ?, address = ?, pincode = ?, city = ?, state = ?, website = ?,
        gst = ?, pan = ?, msme = ?, payment_terms = ?, bank = ?, account_no = ?, ifsc = ?,
        notes = ?, rating = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.name || '',
      body.code || '',
      body.type || '',
      JSON.stringify(body.categories || []),
      JSON.stringify(body.products || []),
      body.contact || '',
      body.designation || '',
      body.phone || '',
      body.email || '',
      body.address || '',
      body.pincode || '',
      body.city || '',
      body.state || '',
      body.website || '',
      body.gst || '',
      body.pan || '',
      body.msme || '',
      body.payment_terms || '',
      body.bank || '',
      body.account_no || '',
      body.ifsc || '',
      body.notes || '',
      body.rating || 0,
      body.status || 'pending',
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
    await db.prepare('DELETE FROM vendor_records WHERE id = ?').bind(id).run();

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
