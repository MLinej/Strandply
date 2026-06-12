// GET  /api/dispatch/state — Get complete dispatch state
// POST /api/dispatch/state — Sync specific state lists to D1

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const results = await db.batch([
      db.prepare('SELECT * FROM requests'),
      db.prepare('SELECT * FROM dispatches'),
      db.prepare('SELECT * FROM parties'),
      db.prepare('SELECT * FROM couriers'),
      db.prepare('SELECT * FROM products'),
      db.prepare('SELECT * FROM dispatch_users'),
      db.prepare('SELECT * FROM notifications ORDER BY time DESC'),
      db.prepare('SELECT * FROM settings'),
    ]);

    const requests = (results[0].results || []).map(row => ({
      id: row.id,
      date: row.date,
      party: row.party,
      products: JSON.parse(row.products || '[]'),
      purpose: row.purpose,
      priority: row.priority,
      reqDate: row.req_date,
      by: row.requested_by,
      remarks: row.remarks,
      status: row.status,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));

    const dispatches = (results[1].results || []).map(row => ({
      id: row.id,
      date: row.date,
      party: row.party,
      city: row.city,
      mode: row.mode,
      courier: row.courier,
      tracking: row.tracking,
      vehicle: row.vehicle,
      driver: row.driver,
      expDate: row.exp_date,
      freight: row.freight,
      weight: row.weight,
      dims: row.dims,
      product: row.product,
      status: row.status,
      remarks: row.remarks,
      reqLink: row.req_link,
      history: JSON.parse(row.history || '[]'),
      createdBy: row.created_by,
    }));

    const parties = (results[2].results || []);
    const couriers = (results[3].results || []);
    const products = (results[4].results || []);
    const users = (results[5].results || []).map(row => ({
      id: row.id,
      name: row.name,
      username: row.username,
      password: row.password,
      role: row.role,
      email: row.email,
      status: row.status,
    }));
    
    const notifs = (results[6].results || []).map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      msg: row.msg,
      time: row.time,
      read: !!row.is_read,
    }));

    const settingsObj = {
      company: 'Strandply LLP',
      llpin: 'AAP-7300',
      city: 'Wankaner, Morbi, Gujarat',
      phone: '',
      gsId: '',
      gsUrl: '',
      gsInterval: 0,
      gsLastSync: '',
    };
    (results[7].results || []).forEach(row => {
      const keyMap = {
        company: 'company',
        llpin: 'llpin',
        city: 'city',
        phone: 'phone',
        gs_id: 'gsId',
        gs_url: 'gsUrl',
        gs_interval: 'gsInterval',
        gs_last_sync: 'gsLastSync',
      };
      const key = keyMap[row.key] || row.key;
      if (key === 'gsInterval') {
        settingsObj[key] = parseInt(row.value || '0', 10);
      } else {
        settingsObj[key] = row.value || '';
      }
    });

    return jsonResponse({
      requests,
      dispatches,
      parties,
      couriers,
      products,
      users,
      notifs,
      settings: settingsObj,
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const statements = [];

    // Sync requests table
    if (body.requests !== undefined) {
      statements.push(db.prepare('DELETE FROM requests'));
      for (const req of body.requests) {
        statements.push(
          db.prepare(
            `INSERT INTO requests (id, date, party, products, purpose, priority, req_date, requested_by, remarks, status, created_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            req.id,
            req.date,
            req.party,
            JSON.stringify(req.products || []),
            req.purpose || '',
            req.priority || 'Normal',
            req.reqDate || '',
            req.by || '',
            req.remarks || '',
            req.status || 'Pending',
            req.createdAt || '',
            req.createdBy || req.created_by || ''
          )
        );
      }
    }

    // Sync dispatches table
    if (body.dispatches !== undefined) {
      statements.push(db.prepare('DELETE FROM dispatches'));
      for (const disp of body.dispatches) {
        statements.push(
          db.prepare(
            `INSERT INTO dispatches (id, date, party, city, mode, courier, tracking, vehicle, driver, exp_date, freight, weight, dims, product, status, remarks, req_link, history, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            disp.id,
            disp.date,
            disp.party,
            disp.city || '',
            disp.mode || 'Courier',
            disp.courier || '',
            disp.tracking || '',
            disp.vehicle || '',
            disp.driver || '',
            disp.expDate || '',
            disp.freight || 0,
            disp.weight || 0,
            disp.dims || '',
            disp.product || '',
            disp.status || 'Pending',
            disp.remarks || '',
            disp.reqLink || '',
            JSON.stringify(disp.history || []),
            disp.createdBy || disp.created_by || ''
          )
        );
      }
    }

    // Sync parties table
    if (body.parties !== undefined) {
      statements.push(db.prepare('DELETE FROM parties'));
      for (const party of body.parties) {
        statements.push(
          db.prepare(
            `INSERT INTO parties (id, name, contact, mobile, email, gst, address, city, state, pin, industry, type, mkt, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            party.id,
            party.name,
            party.contact || '',
            party.mobile || '',
            party.email || '',
            party.gst || '',
            party.address || '',
            party.city || '',
            party.state || '',
            party.pin || '',
            party.industry || '',
            party.type || 'New Lead',
            party.mkt || '',
            party.remarks || '',
            party.created_by || party.createdBy || ''
          )
        );
      }
    }

    // Sync couriers table
    if (body.couriers !== undefined) {
      statements.push(db.prepare('DELETE FROM couriers'));
      for (const c of body.couriers) {
        statements.push(
          db.prepare(
            `INSERT INTO couriers (id, name, type, contact, mobile, email, coverage, track_url, rating, status, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            c.id,
            c.name,
            c.type || 'Courier',
            c.contact || '',
            c.mobile || '',
            c.email || '',
            c.coverage || '',
            c.track_url || '',
            c.rating || 3,
            c.status || 'Active',
            c.remarks || '',
            c.created_by || c.createdBy || ''
          )
        );
      }
    }

    // Sync products table
    if (body.products !== undefined) {
      statements.push(db.prepare('DELETE FROM products'));
      for (const p of body.products) {
        statements.push(
          db.prepare(
            `INSERT INTO products (id, code, name, board, thickness, size, category, price, stock, description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            p.id,
            p.code || '',
            p.name,
            p.board || '',
            p.thickness || '',
            p.size || '',
            p.category || 'Standard',
            p.price || 0,
            p.stock || 'Available',
            p.description || '',
            p.created_by || p.createdBy || ''
          )
        );
      }
    }

    // Sync dispatch_users table
    if (body.users !== undefined) {
      statements.push(db.prepare('DELETE FROM dispatch_users'));
      for (const u of body.users) {
        statements.push(
          db.prepare(
            `INSERT INTO dispatch_users (id, name, username, password, role, email, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            u.id,
            u.name,
            u.username,
            u.password,
            u.role || 'dispatch',
            u.email || '',
            u.status || 'Active'
          )
        );
      }
    }

    // Sync notifications table
    if (body.notifs !== undefined) {
      statements.push(db.prepare('DELETE FROM notifications'));
      for (const n of body.notifs) {
        statements.push(
          db.prepare(
            `INSERT INTO notifications (id, type, title, msg, time, is_read)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            n.id,
            n.type || 'info',
            n.title,
            n.msg || '',
            n.time || '',
            n.read ? 1 : 0
          )
        );
      }
    }

    // Sync settings table
    if (body.settings !== undefined) {
      const keys = {
        company: 'company',
        llpin: 'llpin',
        city: 'city',
        phone: 'phone',
        gsId: 'gs_id',
        gsUrl: 'gs_url',
        gsInterval: 'gs_interval',
        gsLastSync: 'gs_last_sync',
      };
      for (const [k, val] of Object.entries(body.settings)) {
        const dbKey = keys[k];
        if (dbKey) {
          statements.push(
            db.prepare(
              `INSERT OR REPLACE INTO settings (key, value)
               VALUES (?, ?)`
            ).bind(dbKey, String(val))
          );
        }
      }
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

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
