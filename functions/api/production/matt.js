export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    try {
      const { results } = await db.prepare(
        'SELECT remarks FROM production_matt_batches ORDER BY created_at DESC'
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
        await db.prepare(`CREATE TABLE IF NOT EXISTS production_matt_batches (
          id TEXT PRIMARY KEY, report_date TEXT, shift TEXT, operator_name TEXT,
          status TEXT, remarks TEXT, created_at TEXT DEFAULT (datetime('now'))
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
    if (!report.id) return jsonResponse({ error: 'Batch ID is required' }, 400);

    await db.prepare(
      `INSERT OR REPLACE INTO production_matt_batches (
        id, batch_date, shift, product, size, thickness, operator_name, setpoint, warn_band, target_qty, total_matts, avg_weight, pass_count, warn_count, fail_count, pass_rate, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      report.product || '',
      report.size || '',
      report.thickness || '',
      report.operator || '',
      report.setpoint || 0,
      report.warnBand || 0.5,
      report.targetQty || 0,
      report.totalMatts || 0,
      report.avgWeight || 0,
      report.passCount || 0,
      report.warnCount || 0,
      report.failCount || 0,
      report.passRate || 0,
      report.status || 'open',
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

    await db.prepare('DELETE FROM production_matt_batches WHERE id = ?').bind(id).run();
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
