export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    try {
      const { results } = await db.prepare(
        'SELECT remarks FROM production_bc_reports ORDER BY created_at DESC'
      ).all();

      const reports = (results || []).map(row => {
        try {
          return JSON.parse(row.remarks);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      return jsonResponse(reports);
    } catch (e) {
      if (e.message && e.message.includes('no such table')) {
        await db.prepare(`CREATE TABLE IF NOT EXISTS production_bc_reports (
          id TEXT PRIMARY KEY, report_date TEXT, shift TEXT, operator_name TEXT, product TEXT,
          size TEXT, linked_hp TEXT, hp_pcs INTEGER, cut_pcs INTEGER, reject_pcs INTEGER,
          reject_pct REAL, wf_state TEXT, status TEXT, remarks TEXT, created_at TEXT DEFAULT (datetime('now'))
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
    if (!report.id) return jsonResponse({ error: 'Report ID is required' }, 400);

    await db.prepare(
      `INSERT OR REPLACE INTO production_bc_reports (
        id, report_date, shift, operator_name, product, size,
        linked_hp, hp_pcs, cut_pcs, reject_pcs, reject_pct,
        wf_state, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      report.operator || '',
      report.product || '',
      report.size || '',
      report.linkedHP || '',
      report.hpPcs || 0,
      report.cutPcs || 0,
      report.rejectPcs || 0,
      report.rejectPct || 0,
      report.wfState || 'draft',
      report.status || 'saved',
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

    await db.prepare('DELETE FROM production_bc_reports WHERE id = ?').bind(id).run();
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
