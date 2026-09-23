export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    try {
      const { results } = await db.prepare(
        'SELECT full_data FROM production_pp_reports ORDER BY created_at DESC'
      ).all();

      const reports = (results || []).map(row => {
        try {
          return JSON.parse(row.full_data);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      return jsonResponse(reports);
    } catch (e) {
      if (e.message && e.message.includes('no such table')) {
        await db.prepare(`CREATE TABLE IF NOT EXISTS production_pp_reports (
          id TEXT PRIMARY KEY, report_date TEXT, shift TEXT, operator_name TEXT, press_no TEXT,
          total_boards INTEGER, status TEXT, full_data TEXT, created_at TEXT DEFAULT (datetime('now'))
        )`).run();
        return jsonResponse([]);
      }
      throw e;
    }
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const report = await context.request.json();
    if (!report.id) return jsonResponse({ error: 'Plan ID is required' }, 400);

    await db.prepare(
      `INSERT OR REPLACE INTO production_pp_reports (
        id, plan_date, shift, plan_operator, products_json,
        linked_hp, linked_mw, linked_bc, linked_ps,
        wf_state, remarks, full_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      report.planOp || report.operator || '',
      JSON.stringify(report.products || []),
      report.linkedHP || '',
      report.linkedMW || '',
      report.linkedBC || '',
      report.linkedPS || '',
      report.wfState || 'draft',
      report.remarks || '',
      JSON.stringify(report)
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

    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID is required' }, 400);

    await db.prepare('DELETE FROM production_pp_reports WHERE id = ?').bind(id).run();
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
