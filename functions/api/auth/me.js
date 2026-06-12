// GET /api/auth/me - Retrieve current user session

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const cookieHeader = context.request.headers.get('Cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const parts = c.trim().split('=');
        return [parts[0], parts.slice(1).join('=')];
      })
    );

    const username = cookies['session_user'];
    if (!username) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    const { results } = await db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username.toLowerCase()).all();

    if (!results || !results.length) {
      return jsonResponse({ error: 'User session not found' }, 404);
    }

    const row = results[0];
    const user = {
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role,
      dept: row.dept,
      avatar: row.avatar,
      color: row.color,
      modules: JSON.parse(row.modules || '[]'),
      subRights: JSON.parse(row.sub_rights || '{}'),
    };

    return jsonResponse({ success: true, user });
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
