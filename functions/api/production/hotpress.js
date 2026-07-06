export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT remarks FROM production_hotpress_reports ORDER BY created_at DESC'
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
      `INSERT OR REPLACE INTO production_hotpress_reports (
        id, report_date, shift, operator_name, output_sheets,
        product, size, charges_json, total_time_mins, spare_time_mins,
        avg_press_mins, wf_state, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      report.operator || '',
      report.totalBoards || 0,
      report.product || '',
      report.size || '8x4',
      JSON.stringify(report.charges || []),
      report.totalTimeMins || 0,
      report.spareTimeMins || 0,
      report.avgPressMins || 0,
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

    await db.prepare('DELETE FROM production_hotpress_reports WHERE id = ?').bind(id).run();
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
