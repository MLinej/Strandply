// DWPAS Departments — Cloudflare Pages Function
// GET  /api/dwpas/departments
// POST /api/dwpas/departments  { action: 'create'|'update'|'delete', ... }

export async function onRequestGet(ctx) {
  const db = ctx.env.DB;
  try {
    const { results } = await db.prepare(
      'SELECT * FROM dwpas_departments WHERE is_active = 1 ORDER BY id'
    ).all();
    return Response.json({ departments: results || [] });
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
      const { name, head, code, description } = body;
      if (!name) return Response.json({ error: 'Department name is required' }, { status: 400 });

      const result = await db.prepare(
        'INSERT INTO dwpas_departments (name, head, code, description) VALUES (?, ?, ?, ?)'
      ).bind(name, head || '', code || '', description || '').run();

      // Get the inserted row
      const { results } = await db.prepare(
        'SELECT * FROM dwpas_departments WHERE name = ?'
      ).bind(name).all();

      return Response.json({ success: true, department: results?.[0] || null });
    }

    if (action === 'update') {
      const { id, name, head, code, description } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

      await db.prepare(
        'UPDATE dwpas_departments SET name = ?, head = ?, code = ?, description = ? WHERE id = ?'
      ).bind(name || '', head || '', code || '', description || '', id).run();

      return Response.json({ success: true });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await db.prepare('UPDATE dwpas_departments SET is_active = 0 WHERE id = ?').bind(id).run();
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
