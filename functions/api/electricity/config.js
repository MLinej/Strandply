// Electricity Meter Config API — config + MF/FC/ER/FR history CRUD

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const section = url.searchParams.get('section') || 'all';

    const result = {};

    if (section === 'all' || section === 'config') {
      result.config = await db.prepare(
        'SELECT * FROM electricity_meter_config WHERE id = ?'
      ).bind('default').first();
    }

    if (section === 'all' || section === 'mf') {
      const { results: mf } = await db.prepare(
        'SELECT * FROM electricity_mf_history ORDER BY effective_date ASC'
      ).all();
      result.mfHistory = mf || [];
    }

    if (section === 'all' || section === 'fc') {
      const { results: fc } = await db.prepare(
        'SELECT * FROM electricity_fc_history ORDER BY effective_date ASC'
      ).all();
      result.fcHistory = fc || [];
    }

    if (section === 'all' || section === 'er') {
      const { results: er } = await db.prepare(
        'SELECT * FROM electricity_er_history ORDER BY effective_date ASC'
      ).all();
      result.erHistory = er || [];
    }

    if (section === 'all' || section === 'fr') {
      const { results: fr } = await db.prepare(
        'SELECT * FROM electricity_fr_history ORDER BY effective_date ASC'
      ).all();
      result.frHistory = fr || [];
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const action = body.action;

    if (!action) {
      // Save meter config
      await db.prepare(
        `UPDATE electricity_meter_config SET
          meter_no = ?, consumer_no = ?, category = ?, sanc_load = ?,
          ct = ?, pt = ?, tariff = ?, cycle = ?, updated_at = ?
         WHERE id = 'default'`
      ).bind(
        body.meter_no || 'GJ-123456-HT',
        body.consumer_no || '',
        body.category || 'HT Industrial',
        body.sanc_load || '500',
        body.ct || '200/5 A',
        body.pt || '11000/110 V',
        body.tariff || 'HT-2(a)',
        body.cycle || 'Monthly',
        new Date().toISOString()
      ).run();

      return jsonResponse({ success: true });
    }

    const now = new Date().toISOString();
    const id = body.id || (action + '-' + Date.now());

    if (action === 'add_mf') {
      await db.prepare(
        'INSERT INTO electricity_mf_history (id, mf, effective_date) VALUES (?, ?, ?)'
      ).bind(id, body.mf, body.effective_date).run();
      return jsonResponse({ success: true, id });
    }

    if (action === 'add_fc') {
      await db.prepare(
        'INSERT INTO electricity_fc_history (id, fc, effective_date) VALUES (?, ?, ?)'
      ).bind(id, body.fc, body.effective_date).run();
      return jsonResponse({ success: true, id });
    }

    if (action === 'add_er') {
      await db.prepare(
        'INSERT INTO electricity_er_history (id, rate, effective_date) VALUES (?, ?, ?)'
      ).bind(id, body.rate, body.effective_date).run();
      return jsonResponse({ success: true, id });
    }

    if (action === 'add_fr') {
      await db.prepare(
        'INSERT INTO electricity_fr_history (id, rate, effective_date) VALUES (?, ?, ?)'
      ).bind(id, body.rate, body.effective_date).run();
      return jsonResponse({ success: true, id });
    }

    return jsonResponse({ error: 'Unknown action: ' + action }, 400);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const section = url.searchParams.get('section');
    const id = url.searchParams.get('id');

    if (!section || !id) {
      return jsonResponse({ error: 'section and id query params are required' }, 400);
    }

    const tables = {
      mf: 'electricity_mf_history',
      fc: 'electricity_fc_history',
      er: 'electricity_er_history',
      fr: 'electricity_fr_history',
    };

    const table = tables[section];
    if (!table) return jsonResponse({ error: 'Invalid section: ' + section }, 400);

    await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();

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
