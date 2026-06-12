// GET  /api/users — List all users
// POST /api/users — Create, Update, or Delete a user
//   Body: { action: 'create'|'update'|'delete', ...fields }

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM users ORDER BY name'
    ).all();

    const users = (results || []).map(row => ({
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
    }));

    return jsonResponse({ users });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const { action } = body;

    // ─── CREATE ───
    if (action === 'create') {
      const { id, name, username, password, role, dept, avatar, color, modules, subRights } = body;

      if (!name || !username || !password) {
        return jsonResponse({ error: 'Name, username, and password are required' }, 400);
      }

      // Check duplicate username
      const existing = await db.prepare(
        'SELECT id FROM users WHERE username = ?'
      ).bind(username.toLowerCase()).first();
      if (existing) {
        return jsonResponse({ error: `Username "${username}" already exists` }, 409);
      }

      await db.prepare(
        `INSERT INTO users (id, name, username, password, role, dept, avatar, color, modules, sub_rights)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id || ('u' + Date.now()),
        name,
        username.toLowerCase(),
        password,
        role || 'dispatch',
        dept || '',
        avatar || name.slice(0, 2).toUpperCase(),
        color || '#B91C1C',
        JSON.stringify(modules || []),
        JSON.stringify(subRights || {})
      ).run();

      return jsonResponse({ success: true });
    }

    // ─── UPDATE ───
    if (action === 'update') {
      const { id, name, username, password, role, dept, avatar, color, modules, subRights } = body;

      if (!id) return jsonResponse({ error: 'User ID is required' }, 400);

      // Check duplicate username (exclude self)
      if (username) {
        const dup = await db.prepare(
          'SELECT id FROM users WHERE username = ? AND id != ?'
        ).bind(username.toLowerCase(), id).first();
        if (dup) {
          return jsonResponse({ error: `Username "${username}" is already in use` }, 409);
        }
      }

      // Build dynamic UPDATE — only update fields that are provided
      const sets = [];
      const vals = [];

      if (name !== undefined)      { sets.push('name = ?');       vals.push(name); }
      if (username !== undefined)   { sets.push('username = ?');   vals.push(username.toLowerCase()); }
      if (password)                 { sets.push('password = ?');   vals.push(password); }
      if (role !== undefined)       { sets.push('role = ?');       vals.push(role); }
      if (dept !== undefined)       { sets.push('dept = ?');       vals.push(dept); }
      if (avatar !== undefined)     { sets.push('avatar = ?');     vals.push(avatar); }
      if (color !== undefined)      { sets.push('color = ?');      vals.push(color); }
      if (modules !== undefined)    { sets.push('modules = ?');    vals.push(JSON.stringify(modules)); }
      if (subRights !== undefined)  { sets.push('sub_rights = ?'); vals.push(JSON.stringify(subRights)); }

      sets.push("updated_at = datetime('now')");
      vals.push(id);

      await db.prepare(
        `UPDATE users SET ${sets.join(', ')} WHERE id = ?`
      ).bind(...vals).run();

      return jsonResponse({ success: true });
    }

    // ─── DELETE ───
    if (action === 'delete') {
      const { id } = body;
      if (!id) return jsonResponse({ error: 'User ID is required' }, 400);

      await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

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
