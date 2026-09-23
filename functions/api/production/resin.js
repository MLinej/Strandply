export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    try {
      const { results } = await db.prepare(
        'SELECT remarks FROM production_resin_entries ORDER BY created_at DESC'
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
        await db.prepare(`CREATE TABLE IF NOT EXISTS production_resin_entries (
          id TEXT PRIMARY KEY, report_date TEXT, shift TEXT, lot_no TEXT, vendor_name TEXT,
          invoice_no TEXT, qty REAL, rate_kg REAL, amount REAL, product TEXT, operator_name TEXT,
          linked_ps TEXT, linked_pp TEXT, status TEXT, remarks TEXT, created_at TEXT DEFAULT (datetime('now'))
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
      `INSERT OR REPLACE INTO production_resin_entries (
        id, report_date, shift, lot_no, vendor_name, invoice_no,
        qty, rate_kg, amount, product, operator_name,
        linked_ps, linked_pp, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || '',
      report.shift || 'Day',
      report.lot || '',
      report.vendor || '',
      report.inv_no || '',
      report.qty || 0,
      report.rateKg || 0,
      report.amount || 0,
      report.product || '',
      report.operator || '',
      report.linkedPS || '',
      report.linkedPP || '',
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

    await db.prepare('DELETE FROM production_resin_entries WHERE id = ?').bind(id).run();
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
