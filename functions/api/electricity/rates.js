// Electricity Rates API — unified CRUD for MF/FC/ER/FR history tables
// Frontend expects: { type: 'MF'|'FC'|'ER'|'FR', value: number, effectiveDate: string }

const TABLES = {
  MF: { table: 'electricity_mf_history', valueCol: 'mf', label: 'MF' },
  FC: { table: 'electricity_fc_history', valueCol: 'fc', label: 'FC' },
  ER: { table: 'electricity_er_history', valueCol: 'rate', label: 'ER' },
  FR: { table: 'electricity_fr_history', valueCol: 'rate', label: 'FR' },
};

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const results = [];

    for (const [type, cfg] of Object.entries(TABLES)) {
      const { results: rows } = await db.prepare(
        `SELECT id, ${cfg.valueCol} as value, effective_date as effectiveDate FROM ${cfg.table} ORDER BY effective_date ASC`
      ).all();
      for (const row of (rows || [])) {
        results.push({ type, id: row.id, value: row.value, effectiveDate: row.effectiveDate });
      }
    }

    return jsonResponse(results);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const type = body.type;
    const cfg = TABLES[type];
    if (!cfg) return jsonResponse({ error: 'Invalid type. Must be MF, FC, ER, or FR' }, 400);
    if (body.value === undefined || body.value === null) return jsonResponse({ error: 'value is required' }, 400);
    if (!body.effectiveDate) return jsonResponse({ error: 'effectiveDate is required' }, 400);

    const id = body.id || (type.toLowerCase() + '-' + Date.now() + Math.random().toString(36).substr(2, 4));

    await db.prepare(
      `INSERT INTO ${cfg.table} (id, ${cfg.valueCol}, effective_date) VALUES (?, ?, ?)`
    ).bind(id, body.value, body.effectiveDate).run();

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

    // Infer table from ID prefix
    let table = null;
    if (id.startsWith('mf-')) table = 'electricity_mf_history';
    else if (id.startsWith('fc-')) table = 'electricity_fc_history';
    else if (id.startsWith('er-')) table = 'electricity_er_history';
    else if (id.startsWith('fr-')) table = 'electricity_fr_history';

    if (!table) return jsonResponse({ error: 'Cannot determine table from ID prefix' }, 400);

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
