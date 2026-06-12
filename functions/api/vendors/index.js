// GET  /api/vendors - List all vendors
// POST /api/vendors - Create a new vendor

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare('SELECT * FROM vendor_records').all();
    const vendors = (results || []).map(row => ({
      _id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      categories: JSON.parse(row.categories || '[]'),
      products: JSON.parse(row.products || '[]'),
      contact: row.contact,
      designation: row.designation,
      phone: row.phone,
      email: row.email,
      address: row.address,
      pincode: row.pincode,
      city: row.city,
      state: row.state,
      website: row.website,
      gst: row.gst,
      pan: row.pan,
      msme: row.msme,
      payment_terms: row.payment_terms,
      bank: row.bank,
      account_no: row.account_no,
      ifsc: row.ifsc,
      notes: row.notes,
      rating: row.rating,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      activated_at: row.activated_at,
      blacklisted_at: row.blacklisted_at,
      blacklist_reason: row.blacklist_reason,
    }));

    return jsonResponse(vendors);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const id = body._id || ('v_' + Date.now());

    await db.prepare(
      `INSERT INTO vendor_records (
        id, name, code, type, categories, products, contact, designation, phone, email,
        address, pincode, city, state, website, gst, pan, msme, payment_terms, bank,
        account_no, ifsc, notes, rating, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
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
