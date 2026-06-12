// POST /api/auth — Login endpoint
// Body: { username: string, password: string }
// Returns: { success: true, user: {...} } or { error: string }

export async function onRequestPost(context) {
  try {
    const { username, password } = await context.request.json();

    if (!username || !password) {
      return jsonResponse({ error: 'Username and password required' }, 400);
    }

    const db = context.env.DB;
    if (!db) {
      return jsonResponse({ error: 'D1 database binding (DB) is not configured' }, 500);
    }

    const { results } = await db.prepare(
      'SELECT * FROM users WHERE username = ? AND password = ?'
    ).bind(username.trim().toLowerCase(), password).all();

    if (!results || !results.length) {
      return jsonResponse({ error: 'Invalid username or password' }, 401);
    }

    const row = results[0];
    const user = {
      id: row.id,
      name: row.name,
      username: row.username,
      password: row.password,
      role: row.role,
      dept: row.dept,
      avatar: row.avatar,
      color: row.color,
      modules: JSON.parse(row.modules || '[]'),
      subRights: JSON.parse(row.sub_rights || '{}'),
    };

    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `session_user=${user.username}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return jsonResponse({ error: 'Server error: ' + e.message }, 500);
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
