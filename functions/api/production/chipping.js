export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT remarks FROM production_chipping_reports ORDER BY created_at DESC'
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
      `INSERT OR REPLACE INTO production_chipping_reports (
        id, report_date, shift, lot_no, machine_no, operator_name, input_qty, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      JSON.stringify(report.lots || []),
      report.machine || '',
      report.operator || '',
      report.totalKg || 0,
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

    await db.prepare('DELETE FROM production_chipping_reports WHERE id = ?').bind(id).run();
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
