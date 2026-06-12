// Maintenance Work Orders API — CRUD for maintenance_work_orders table

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');

    if (id) {
      // Get single work order with timeline
      const wo = await db.prepare(
        'SELECT * FROM maintenance_work_orders WHERE id = ?'
      ).bind(id).first();
      if (!wo) return jsonResponse({ error: 'Work order not found' }, 404);

      const { results: timeline } = await db.prepare(
        'SELECT * FROM maintenance_timeline WHERE work_order_id = ? ORDER BY created_at ASC'
      ).bind(id).all();

      return jsonResponse({ ...wo, timeline: timeline || [] });
    }

    // List all work orders
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const area = url.searchParams.get('area');

    let query = 'SELECT * FROM maintenance_work_orders';
    const conditions = [];
    const params = [];

    if (status) { conditions.push('status = ?'); params.push(status); }
    if (priority) { conditions.push('priority = ?'); params.push(priority); }
    if (area) { conditions.push('area = ?'); params.push(area); }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

    return jsonResponse(results || []);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    if (!body.title) return jsonResponse({ error: 'Title is required' }, 400);

    const id = body.id || ('WO-' + Math.random().toString(36).substr(2, 6).toUpperCase());
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO maintenance_work_orders (
        id, title, category, area, priority, status, assignee,
        description, notes, due_date, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.title,
      body.category || 'Mechanical',
      body.area || '',
      body.priority || 'Medium',
      body.status || 'Open',
      body.assignee || '',
      body.description || '',
      body.notes || '',
      body.due_date || body.dueDate || null,
      body.created_by || body.createdBy || '',
      now,
      now
    ).run();

    // Create initial timeline entry
    await db.prepare(
      `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
       VALUES (?, ?, 'created', 'Work order created.', ?, ?)`
    ).bind('tl-' + Date.now(), id, body.created_by || 'System', now).run();

    // Add assigned timeline entry if assignee provided
    if (body.assignee) {
      await db.prepare(
        `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
         VALUES (?, ?, 'assigned', ?, ?, ?)`
      ).bind(
        'tl-' + (Date.now() + 1), id,
        'Assigned to ' + body.assignee + '.',
        body.created_by || 'System', now
      ).run();
    }

    return jsonResponse({ success: true, id });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    if (!body.id) return jsonResponse({ error: 'Work order ID is required' }, 400);

    const now = new Date().toISOString();
    const completedAt = body.status === 'Completed' ? now : null;

    await db.prepare(
      `UPDATE maintenance_work_orders SET
        title = ?, category = ?, area = ?, priority = ?, status = ?,
        assignee = ?, description = ?, notes = ?, due_date = ?,
        completed_at = COALESCE(?, completed_at), updated_at = ?
       WHERE id = ?`
    ).bind(
      body.title || '',
      body.category || 'Mechanical',
      body.area || '',
      body.priority || 'Medium',
      body.status || 'Open',
      body.assignee || '',
      body.description || '',
      body.notes || '',
      body.due_date || body.dueDate || null,
      completedAt,
      now,
      body.id
    ).run();

    // Add edit timeline entry
    await db.prepare(
      `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
       VALUES (?, ?, 'edited', 'Work order details updated.', ?, ?)`
    ).bind('tl-' + Date.now(), body.id, body.updated_by || 'System', now).run();

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
    if (!id) return jsonResponse({ error: 'ID query param is required' }, 400);

    // Delete timeline entries first (foreign key)
    await db.prepare('DELETE FROM maintenance_timeline WHERE work_order_id = ?').bind(id).run();
    // Delete work order
    await db.prepare('DELETE FROM maintenance_work_orders WHERE id = ?').bind(id).run();

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
