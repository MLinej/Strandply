// DWPAS Plans — Cloudflare Pages Function
// GET  /api/dwpas/plans?from=&to=&status=
// POST /api/dwpas/plans  { action: 'create'|'update'|'delete', ... }

export async function onRequestGet(ctx) {
  const db = ctx.env.DB;
  const url = new URL(ctx.request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const status = url.searchParams.get('status');

  let sql = 'SELECT * FROM dwpas_plans WHERE 1=1';
  const params = [];
  if (from) { sql += ' AND plan_date >= ?'; params.push(from); }
  if (to) { sql += ' AND plan_date <= ?'; params.push(to); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY plan_date DESC';

  try {
    const { results } = await db.prepare(sql).bind(...params).all();
    const plans = (results || []).map(r => ({
      ...r,
      lines: JSON.parse(r.lines || '[]'),
    }));
    return Response.json({ plans });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(ctx) {
  const db = ctx.env.DB;
  const body = await ctx.request.json();
  const { action } = body;

  try {
    if (action === 'create' || action === 'update') {
      const { id, plan_date, plan_type, status, prepared_by, remarks, lines, saved_at } = body;
      if (!id || !plan_date) return Response.json({ error: 'id and plan_date are required' }, { status: 400 });

      const linesJson = typeof lines === 'string' ? lines : JSON.stringify(lines || []);

      await db.prepare(`
        INSERT INTO dwpas_plans (id, plan_date, plan_type, status, prepared_by, remarks, lines, saved_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          plan_date = excluded.plan_date,
          plan_type = excluded.plan_type,
          status = excluded.status,
          prepared_by = excluded.prepared_by,
          remarks = excluded.remarks,
          lines = excluded.lines,
          saved_at = excluded.saved_at,
          updated_at = datetime('now')
      `).bind(
        id,
        plan_date,
        plan_type || 'Regular Day',
        status || 'Draft',
        prepared_by || '',
        remarks || '',
        linesJson,
        saved_at || new Date().toISOString()
      ).run();

      return Response.json({ success: true, id });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await db.prepare('DELETE FROM dwpas_plans WHERE id = ?').bind(id).run();
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
