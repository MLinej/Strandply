// GET  /api/products - List all vendor products
// POST /api/products - Create a new vendor product

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM vendor_products').all();
    const products = (results || []).map(row => ({
      _id: row.id,
      name: row.name,
      code: row.code,
      category: row.category,
      unit: row.unit,
      alt_unit: row.alt_unit,
      conv_factor: row.conv_factor,
      hsn: row.hsn,
      gst_rate: row.gst_rate,
      moq: row.moq,
      lead_time: row.lead_time,
      description: row.description,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
    }));

    return jsonResponse(products);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body._id || ('p_' + Date.now());

    await db.prepare(
      `INSERT INTO vendor_products (
        id, name, code, category, unit, alt_unit, conv_factor, hsn, gst_rate, moq,
        lead_time, description, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
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
