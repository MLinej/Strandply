// Electricity Meter Readings API — CRUD for electricity_readings table

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');

    if (id) {
      const reading = await db.prepare(
        'SELECT * FROM electricity_readings WHERE id = ?'
      ).bind(id).first();
      if (!reading) return jsonResponse({ error: 'Reading not found' }, 404);
      return jsonResponse(reading);
    }

    const date = url.searchParams.get('date');
    const shift = url.searchParams.get('shift');
    const limit = parseInt(url.searchParams.get('limit')) || 50;

    let query = 'SELECT * FROM electricity_readings';
    const conditions = [];
    const params = [];

    if (date) { conditions.push('date = ?'); params.push(date); }
    if (shift) { conditions.push('shift = ?'); params.push(shift); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY date DESC, time DESC LIMIT ?';
    params.push(limit);

    const { results } = await db.prepare(query).bind(...params).all();

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
    if (!body.date) return jsonResponse({ error: 'Date is required' }, 400);
    if (!body.shift) return jsonResponse({ error: 'Shift (AM/PM) is required' }, 400);
    if (body.kwh === undefined || body.kwh === null) return jsonResponse({ error: 'kWh reading is required' }, 400);

    const id = body.id || ('er-' + Date.now() + Math.random().toString(36).substr(2, 4));
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO electricity_readings (
        id, date, shift, time, kwh, pf, night_kwh,
        mf, energy_rate, fuel_rate, fixed_charge, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.date,
      body.shift,
      body.time || '',
      body.kwh,
      body.pf !== undefined ? body.pf : null,
      body.night_kwh !== undefined ? body.night_kwh : null,
      body.mf || null,
      body.energy_rate || null,
      body.fuel_rate || null,
      body.fixed_charge || null,
      body.created_by || '',
      now
    ).run();

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
    if (!id) return jsonResponse({ error: 'ID query param is required' }, 400);

    await db.prepare('DELETE FROM electricity_readings WHERE id = ?').bind(id).run();

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
