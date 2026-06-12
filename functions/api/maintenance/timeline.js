// Maintenance Timeline API — Timeline entries & status updates

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const workOrderId = url.searchParams.get('work_order_id');
    if (!workOrderId) return jsonResponse({ error: 'work_order_id is required' }, 400);

    const { results } = await db.prepare(
      'SELECT * FROM maintenance_timeline WHERE work_order_id = ? ORDER BY created_at ASC'
    ).bind(workOrderId).all();

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
    if (!body.work_order_id) return jsonResponse({ error: 'work_order_id is required' }, 400);
    if (!body.entry_text) return jsonResponse({ error: 'entry_text is required' }, 400);

    const id = body.id || ('tl-' + Date.now());
    const now = new Date().toISOString();
    const entryType = body.entry_type || 'note';

    await db.prepare(
      `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.work_order_id,
      entryType,
      body.entry_text,
      body.entry_by || '',
      now
    ).run();

    // If this is a status change, also update the work order status
    if (entryType === 'status' && body.new_status) {
      const completedAt = body.new_status === 'Completed' ? now : null;
      await db.prepare(
        `UPDATE maintenance_work_orders SET status = ?, completed_at = COALESCE(?, completed_at), updated_at = ? WHERE id = ?`
      ).bind(body.new_status, completedAt, now, body.work_order_id).run();
    }

    return jsonResponse({ success: true, id });
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
