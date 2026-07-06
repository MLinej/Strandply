export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT remarks FROM production_mdo_reports ORDER BY created_at DESC'
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
      `INSERT OR REPLACE INTO production_mdo_reports (
        id, report_date, shift, operator_name, press_start, press_end,
        working_time, total_pcs, total_paper_used, total_paper_wastage,
        items_json, wf_state, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      report.operator || '',
      report.pressStart || '',
      report.pressEnd || '',
      report.workingTime || '',
      report.totalPcs || 0,
      report.totalPaper || 0,
      report.paperWastage || 0,
      JSON.stringify(report.items || []),
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

    await db.prepare('DELETE FROM production_mdo_reports WHERE id = ?').bind(id).run();
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
