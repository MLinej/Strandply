// DWPAS Employees — Cloudflare Pages Function
// GET  /api/dwpas/employees
// POST /api/dwpas/employees  { action: 'create'|'update'|'delete', ... }

export async function onRequestGet(ctx) {
  const db = ctx.env.DB;
  try {
    try {
      const { results } = await db.prepare(
        'SELECT * FROM dwpas_employees WHERE is_active = 1 ORDER BY id'
      ).all();
      return Response.json({ employees: results || [] });
    } catch (e) {
      if (e.message && e.message.includes('no such table')) {
        await db.prepare(`CREATE TABLE IF NOT EXISTS dwpas_employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, dept_id INTEGER, role TEXT,
          email TEXT, phone TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
        )`).run();
        return Response.json({ employees: [] });
      }
      throw e;
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function onRequestPost(ctx) {
  const db = ctx.env.DB;
  const body = await ctx.request.json();
  const { action } = body;

  try {
    if (action === 'create') {
      const { name, dept, desg, type, code } = body;
      if (!name) return Response.json({ error: 'Employee name is required' }, { status: 400 });

      const validTypes = ['Skilled', 'Unskilled', 'Supervisor', 'Manager'];
      const empType = validTypes.includes(type) ? type : 'Skilled';

      await db.prepare(
        'INSERT INTO dwpas_employees (name, dept, desg, type, code) VALUES (?, ?, ?, ?, ?)'
      ).bind(name, dept || '', desg || '', empType, code || '').run();

      // Get the inserted row
      const { results } = await db.prepare(
        'SELECT * FROM dwpas_employees WHERE name = ? AND is_active = 1 ORDER BY id DESC LIMIT 1'
      ).bind(name).all();

      return Response.json({ success: true, employee: results?.[0] || null });
    }

    if (action === 'update') {
      const { id, name, dept, desg, type, code } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

      await db.prepare(
        'UPDATE dwpas_employees SET name = ?, dept = ?, desg = ?, type = ?, code = ? WHERE id = ?'
      ).bind(name || '', dept || '', desg || '', type || 'Skilled', code || '', id).run();

      return Response.json({ success: true });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await db.prepare('UPDATE dwpas_employees SET is_active = 0 WHERE id = ?').bind(id).run();
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
