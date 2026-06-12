// PATCH /api/vendors/[id]/status - Update status and related workflow timestamps

export async function onRequestPatch(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const id = context.params.id;
    const body = await context.request.json();

    const sets = [];
    const binds = [];
    const allowedKeys = [
      'status', 'approved_at', 'approved_by', 'activated_at',
      'blacklisted_at', 'blacklist_reason'
    ];

    for (const [key, val] of Object.entries(body)) {
      if (allowedKeys.includes(key)) {
        sets.push(`${key} = ?`);
        binds.push(val);
      }
    }

    if (sets.length === 0) {
      return jsonResponse({ error: 'No valid fields to update' }, 400);
    }

    sets.push("updated_at = datetime('now')");
    binds.push(id);

    await db.prepare(
      `UPDATE vendor_records SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...binds).run();

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
