var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/pages-VDpeOL/functionsWorker-0.917543633164197.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
async function onRequestPatch(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    const body = await context.request.json();
    const sets = [];
    const binds = [];
    const allowedKeys = [
      "status",
      "approved_at",
      "approved_by",
      "activated_at",
      "blacklisted_at",
      "blacklist_reason"
    ];
    for (const [key, val] of Object.entries(body)) {
      if (allowedKeys.includes(key)) {
        sets.push(`${key} = ?`);
        binds.push(val);
      }
    }
    if (sets.length === 0) {
      return jsonResponse({ error: "No valid fields to update" }, 400);
    }
    sets.push("updated_at = datetime('now')");
    binds.push(id);
    await db.prepare(
      `UPDATE vendor_records SET ${sets.join(", ")} WHERE id = ?`
    ).bind(...binds).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
__name(onRequestPatch, "onRequestPatch");
__name2(onRequestPatch, "onRequestPatch");
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse, "jsonResponse");
__name2(jsonResponse, "jsonResponse");
async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse2({ error: "D1 not configured" }, 500);
    const cookieHeader = context.request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const parts = c.trim().split("=");
        return [parts[0], parts.slice(1).join("=")];
      })
    );
    const username = cookies["session_user"];
    if (!username) {
      return jsonResponse2({ error: "Not authenticated" }, 401);
    }
    const { results } = await db.prepare(
      "SELECT * FROM users WHERE username = ?"
    ).bind(username.toLowerCase()).all();
    if (!results || !results.length) {
      return jsonResponse2({ error: "User session not found" }, 404);
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
      modules: JSON.parse(row.modules || "[]"),
      subRights: JSON.parse(row.sub_rights || "{}")
    };
    return jsonResponse2({ success: true, user });
  } catch (e) {
    return jsonResponse2({ error: e.message }, 500);
  }
}
__name(onRequestGet, "onRequestGet");
__name2(onRequestGet, "onRequestGet");
function jsonResponse2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse2, "jsonResponse2");
__name2(jsonResponse2, "jsonResponse");
async function onRequestGet2(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse3({ error: "D1 not configured" }, 500);
    const results = await db.batch([
      db.prepare("SELECT * FROM requests"),
      db.prepare("SELECT * FROM dispatches"),
      db.prepare("SELECT * FROM parties"),
      db.prepare("SELECT * FROM couriers"),
      db.prepare("SELECT * FROM products"),
      db.prepare("SELECT * FROM dispatch_users"),
      db.prepare("SELECT * FROM notifications ORDER BY time DESC"),
      db.prepare("SELECT * FROM settings")
    ]);
    const requests = (results[0].results || []).map((row) => ({
      id: row.id,
      date: row.date,
      party: row.party,
      products: JSON.parse(row.products || "[]"),
      purpose: row.purpose,
      priority: row.priority,
      reqDate: row.req_date,
      by: row.requested_by,
      remarks: row.remarks,
      status: row.status,
      createdAt: row.created_at,
      createdBy: row.created_by
    }));
    const dispatches = (results[1].results || []).map((row) => ({
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
      history: JSON.parse(row.history || "[]"),
      createdBy: row.created_by
    }));
    const parties = results[2].results || [];
    const couriers = results[3].results || [];
    const products = results[4].results || [];
    const users = (results[5].results || []).map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      password: row.password,
      role: row.role,
      email: row.email,
      status: row.status
    }));
    const notifs = (results[6].results || []).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      msg: row.msg,
      time: row.time,
      read: !!row.is_read
    }));
    const settingsObj = {
      company: "Strandply LLP",
      llpin: "AAP-7300",
      city: "Wankaner, Morbi, Gujarat",
      phone: "",
      gsId: "",
      gsUrl: "",
      gsInterval: 0,
      gsLastSync: ""
    };
    (results[7].results || []).forEach((row) => {
      const keyMap = {
        company: "company",
        llpin: "llpin",
        city: "city",
        phone: "phone",
        gs_id: "gsId",
        gs_url: "gsUrl",
        gs_interval: "gsInterval",
        gs_last_sync: "gsLastSync"
      };
      const key = keyMap[row.key] || row.key;
      if (key === "gsInterval") {
        settingsObj[key] = parseInt(row.value || "0", 10);
      } else {
        settingsObj[key] = row.value || "";
      }
    });
    return jsonResponse3({
      requests,
      dispatches,
      parties,
      couriers,
      products,
      users,
      notifs,
      settings: settingsObj
    });
  } catch (e) {
    return jsonResponse3({ error: e.message }, 500);
  }
}
__name(onRequestGet2, "onRequestGet2");
__name2(onRequestGet2, "onRequestGet");
async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse3({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const statements = [];
    if (body.requests !== void 0) {
      statements.push(db.prepare("DELETE FROM requests"));
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
            req.purpose || "",
            req.priority || "Normal",
            req.reqDate || "",
            req.by || "",
            req.remarks || "",
            req.status || "Pending",
            req.createdAt || "",
            req.createdBy || req.created_by || ""
          )
        );
      }
    }
    if (body.dispatches !== void 0) {
      statements.push(db.prepare("DELETE FROM dispatches"));
      for (const disp of body.dispatches) {
        statements.push(
          db.prepare(
            `INSERT INTO dispatches (id, date, party, city, mode, courier, tracking, vehicle, driver, exp_date, freight, weight, dims, product, status, remarks, req_link, history, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            disp.id,
            disp.date,
            disp.party,
            disp.city || "",
            disp.mode || "Courier",
            disp.courier || "",
            disp.tracking || "",
            disp.vehicle || "",
            disp.driver || "",
            disp.expDate || "",
            disp.freight || 0,
            disp.weight || 0,
            disp.dims || "",
            disp.product || "",
            disp.status || "Pending",
            disp.remarks || "",
            disp.reqLink || "",
            JSON.stringify(disp.history || []),
            disp.createdBy || disp.created_by || ""
          )
        );
      }
    }
    if (body.parties !== void 0) {
      statements.push(db.prepare("DELETE FROM parties"));
      for (const party of body.parties) {
        statements.push(
          db.prepare(
            `INSERT INTO parties (id, name, contact, mobile, email, gst, address, city, state, pin, industry, type, mkt, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            party.id,
            party.name,
            party.contact || "",
            party.mobile || "",
            party.email || "",
            party.gst || "",
            party.address || "",
            party.city || "",
            party.state || "",
            party.pin || "",
            party.industry || "",
            party.type || "New Lead",
            party.mkt || "",
            party.remarks || "",
            party.created_by || party.createdBy || ""
          )
        );
      }
    }
    if (body.couriers !== void 0) {
      statements.push(db.prepare("DELETE FROM couriers"));
      for (const c of body.couriers) {
        statements.push(
          db.prepare(
            `INSERT INTO couriers (id, name, type, contact, mobile, email, coverage, track_url, rating, status, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            c.id,
            c.name,
            c.type || "Courier",
            c.contact || "",
            c.mobile || "",
            c.email || "",
            c.coverage || "",
            c.track_url || "",
            c.rating || 3,
            c.status || "Active",
            c.remarks || "",
            c.created_by || c.createdBy || ""
          )
        );
      }
    }
    if (body.products !== void 0) {
      statements.push(db.prepare("DELETE FROM products"));
      for (const p of body.products) {
        statements.push(
          db.prepare(
            `INSERT INTO products (id, code, name, board, thickness, size, category, price, stock, description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            p.id,
            p.code || "",
            p.name,
            p.board || "",
            p.thickness || "",
            p.size || "",
            p.category || "Standard",
            p.price || 0,
            p.stock || "Available",
            p.description || "",
            p.created_by || p.createdBy || ""
          )
        );
      }
    }
    if (body.users !== void 0) {
      statements.push(db.prepare("DELETE FROM dispatch_users"));
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
            u.role || "dispatch",
            u.email || "",
            u.status || "Active"
          )
        );
      }
    }
    if (body.notifs !== void 0) {
      statements.push(db.prepare("DELETE FROM notifications"));
      for (const n of body.notifs) {
        statements.push(
          db.prepare(
            `INSERT INTO notifications (id, type, title, msg, time, is_read)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            n.id,
            n.type || "info",
            n.title,
            n.msg || "",
            n.time || "",
            n.read ? 1 : 0
          )
        );
      }
    }
    if (body.settings !== void 0) {
      const keys = {
        company: "company",
        llpin: "llpin",
        city: "city",
        phone: "phone",
        gsId: "gs_id",
        gsUrl: "gs_url",
        gsInterval: "gs_interval",
        gsLastSync: "gs_last_sync"
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
    return jsonResponse3({ success: true });
  } catch (e) {
    return jsonResponse3({ error: e.message }, 500);
  }
}
__name(onRequestPost, "onRequestPost");
__name2(onRequestPost, "onRequestPost");
function jsonResponse3(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse3, "jsonResponse3");
__name2(jsonResponse3, "jsonResponse");
async function onRequestGet3(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse4({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT * FROM maintenance_areas WHERE is_active = 1 ORDER BY name ASC"
    ).all();
    return jsonResponse4(results || []);
  } catch (e) {
    return jsonResponse4({ error: e.message }, 500);
  }
}
__name(onRequestGet3, "onRequestGet3");
__name2(onRequestGet3, "onRequestGet");
async function onRequestPost2(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse4({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    if (!body.name || !body.name.trim()) {
      return jsonResponse4({ error: "Area name is required" }, 400);
    }
    const name = body.name.trim();
    const id = body.id || "ma-" + Date.now();
    const existing = await db.prepare(
      "SELECT id FROM maintenance_areas WHERE name = ?"
    ).bind(name).first();
    if (existing) {
      await db.prepare(
        "UPDATE maintenance_areas SET is_active = 1 WHERE id = ?"
      ).bind(existing.id).run();
      return jsonResponse4({ success: true, id: existing.id, reactivated: true });
    }
    await db.prepare(
      "INSERT INTO maintenance_areas (id, name, is_active) VALUES (?, ?, 1)"
    ).bind(id, name).run();
    return jsonResponse4({ success: true, id });
  } catch (e) {
    return jsonResponse4({ error: e.message }, 500);
  }
}
__name(onRequestPost2, "onRequestPost2");
__name2(onRequestPost2, "onRequestPost");
async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse4({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const name = url.searchParams.get("name");
    if (!id && !name) return jsonResponse4({ error: "ID or name query param is required" }, 400);
    const condition = id ? "id = ?" : "name = ?";
    const param = id || name;
    const area = await db.prepare(
      `SELECT name FROM maintenance_areas WHERE ${condition}`
    ).bind(param).first();
    if (area) {
      const inUse = await db.prepare(
        "SELECT COUNT(*) as cnt FROM maintenance_work_orders WHERE area = ?"
      ).bind(area.name).first();
      if (inUse && inUse.cnt > 0) {
        return jsonResponse4({ error: "Cannot remove \u2014 work orders exist for this area." }, 400);
      }
    }
    await db.prepare(
      `UPDATE maintenance_areas SET is_active = 0 WHERE ${condition}`
    ).bind(param).run();
    return jsonResponse4({ success: true });
  } catch (e) {
    return jsonResponse4({ error: e.message }, 500);
  }
}
__name(onRequestDelete, "onRequestDelete");
__name2(onRequestDelete, "onRequestDelete");
function jsonResponse4(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse4, "jsonResponse4");
__name2(jsonResponse4, "jsonResponse");
async function onRequestGet4(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse5({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const workOrderId = url.searchParams.get("work_order_id");
    if (!workOrderId) return jsonResponse5({ error: "work_order_id is required" }, 400);
    const { results } = await db.prepare(
      "SELECT * FROM maintenance_timeline WHERE work_order_id = ? ORDER BY created_at ASC"
    ).bind(workOrderId).all();
    return jsonResponse5(results || []);
  } catch (e) {
    return jsonResponse5({ error: e.message }, 500);
  }
}
__name(onRequestGet4, "onRequestGet4");
__name2(onRequestGet4, "onRequestGet");
async function onRequestPost3(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse5({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    if (!body.work_order_id) return jsonResponse5({ error: "work_order_id is required" }, 400);
    if (!body.entry_text) return jsonResponse5({ error: "entry_text is required" }, 400);
    const id = body.id || "tl-" + Date.now();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const entryType = body.entry_type || "note";
    await db.prepare(
      `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.work_order_id,
      entryType,
      body.entry_text,
      body.entry_by || "",
      now
    ).run();
    if (entryType === "status" && body.new_status) {
      const completedAt = body.new_status === "Completed" ? now : null;
      await db.prepare(
        `UPDATE maintenance_work_orders SET status = ?, completed_at = COALESCE(?, completed_at), updated_at = ? WHERE id = ?`
      ).bind(body.new_status, completedAt, now, body.work_order_id).run();
    }
    return jsonResponse5({ success: true, id });
  } catch (e) {
    return jsonResponse5({ error: e.message }, 500);
  }
}
__name(onRequestPost3, "onRequestPost3");
__name2(onRequestPost3, "onRequestPost");
function jsonResponse5(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse5, "jsonResponse5");
__name2(jsonResponse5, "jsonResponse");
async function onRequestGet5(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse6({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const wo = await db.prepare(
        "SELECT * FROM maintenance_work_orders WHERE id = ?"
      ).bind(id).first();
      if (!wo) return jsonResponse6({ error: "Work order not found" }, 404);
      const { results: timeline } = await db.prepare(
        "SELECT * FROM maintenance_timeline WHERE work_order_id = ? ORDER BY created_at ASC"
      ).bind(id).all();
      return jsonResponse6({ ...wo, timeline: timeline || [] });
    }
    const status = url.searchParams.get("status");
    const priority = url.searchParams.get("priority");
    const area = url.searchParams.get("area");
    let query = "SELECT * FROM maintenance_work_orders";
    const conditions = [];
    const params = [];
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (priority) {
      conditions.push("priority = ?");
      params.push(priority);
    }
    if (area) {
      conditions.push("area = ?");
      params.push(area);
    }
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY created_at DESC";
    const stmt = db.prepare(query);
    const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();
    return jsonResponse6(results || []);
  } catch (e) {
    return jsonResponse6({ error: e.message }, 500);
  }
}
__name(onRequestGet5, "onRequestGet5");
__name2(onRequestGet5, "onRequestGet");
async function onRequestPost4(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse6({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    if (!body.title) return jsonResponse6({ error: "Title is required" }, 400);
    const id = body.id || "WO-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await db.prepare(
      `INSERT INTO maintenance_work_orders (
        id, title, category, area, priority, status, assignee,
        description, notes, due_date, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.title,
      body.category || "Mechanical",
      body.area || "",
      body.priority || "Medium",
      body.status || "Open",
      body.assignee || "",
      body.description || "",
      body.notes || "",
      body.due_date || body.dueDate || null,
      body.created_by || body.createdBy || "",
      now,
      now
    ).run();
    await db.prepare(
      `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
       VALUES (?, ?, 'created', 'Work order created.', ?, ?)`
    ).bind("tl-" + Date.now(), id, body.created_by || "System", now).run();
    if (body.assignee) {
      await db.prepare(
        `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
         VALUES (?, ?, 'assigned', ?, ?, ?)`
      ).bind(
        "tl-" + (Date.now() + 1),
        id,
        "Assigned to " + body.assignee + ".",
        body.created_by || "System",
        now
      ).run();
    }
    return jsonResponse6({ success: true, id });
  } catch (e) {
    return jsonResponse6({ error: e.message }, 500);
  }
}
__name(onRequestPost4, "onRequestPost4");
__name2(onRequestPost4, "onRequestPost");
async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse6({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    if (!body.id) return jsonResponse6({ error: "Work order ID is required" }, 400);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const completedAt = body.status === "Completed" ? now : null;
    await db.prepare(
      `UPDATE maintenance_work_orders SET
        title = ?, category = ?, area = ?, priority = ?, status = ?,
        assignee = ?, description = ?, notes = ?, due_date = ?,
        completed_at = COALESCE(?, completed_at), updated_at = ?
       WHERE id = ?`
    ).bind(
      body.title || "",
      body.category || "Mechanical",
      body.area || "",
      body.priority || "Medium",
      body.status || "Open",
      body.assignee || "",
      body.description || "",
      body.notes || "",
      body.due_date || body.dueDate || null,
      completedAt,
      now,
      body.id
    ).run();
    await db.prepare(
      `INSERT INTO maintenance_timeline (id, work_order_id, entry_type, entry_text, entry_by, created_at)
       VALUES (?, ?, 'edited', 'Work order details updated.', ?, ?)`
    ).bind("tl-" + Date.now(), body.id, body.updated_by || "System", now).run();
    return jsonResponse6({ success: true });
  } catch (e) {
    return jsonResponse6({ error: e.message }, 500);
  }
}
__name(onRequestPut, "onRequestPut");
__name2(onRequestPut, "onRequestPut");
async function onRequestDelete2(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse6({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse6({ error: "ID query param is required" }, 400);
    await db.prepare("DELETE FROM maintenance_timeline WHERE work_order_id = ?").bind(id).run();
    await db.prepare("DELETE FROM maintenance_work_orders WHERE id = ?").bind(id).run();
    return jsonResponse6({ success: true });
  } catch (e) {
    return jsonResponse6({ error: e.message }, 500);
  }
}
__name(onRequestDelete2, "onRequestDelete2");
__name2(onRequestDelete2, "onRequestDelete");
function jsonResponse6(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse6, "jsonResponse6");
__name2(jsonResponse6, "jsonResponse");
async function onRequestGet6(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse7({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT remarks FROM production_chipping_reports ORDER BY created_at DESC"
    ).all();
    const reports = (results || []).map((row) => {
      try {
        return JSON.parse(row.remarks);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    return jsonResponse7(reports);
  } catch (e) {
    return jsonResponse7({ error: e.message }, 500);
  }
}
__name(onRequestGet6, "onRequestGet6");
__name2(onRequestGet6, "onRequestGet");
async function onRequestPost5(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse7({ error: "D1 not configured" }, 500);
    const report = await context.request.json();
    if (!report.id) return jsonResponse7({ error: "Report ID is required" }, 400);
    await db.prepare(
      `INSERT OR REPLACE INTO production_chipping_reports (
        id, report_date, shift, lot_no, machine_no, operator_name, input_qty, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || "",
      report.shift || "Day",
      JSON.stringify(report.lots || []),
      report.machine || "",
      report.operator || "",
      report.totalKg || 0,
      JSON.stringify(report)
    ).run();
    return jsonResponse7({ success: true });
  } catch (e) {
    return jsonResponse7({ error: e.message }, 500);
  }
}
__name(onRequestPost5, "onRequestPost5");
__name2(onRequestPost5, "onRequestPost");
async function onRequestDelete3(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse7({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse7({ error: "ID is required" }, 400);
    await db.prepare("DELETE FROM production_chipping_reports WHERE id = ?").bind(id).run();
    return jsonResponse7({ success: true });
  } catch (e) {
    return jsonResponse7({ error: e.message }, 500);
  }
}
__name(onRequestDelete3, "onRequestDelete3");
__name2(onRequestDelete3, "onRequestDelete");
function jsonResponse7(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse7, "jsonResponse7");
__name2(jsonResponse7, "jsonResponse");
async function onRequestGet7(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse8({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT remarks FROM production_hotpress_reports ORDER BY created_at DESC"
    ).all();
    const reports = (results || []).map((row) => {
      try {
        return JSON.parse(row.remarks);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    return jsonResponse8(reports);
  } catch (e) {
    return jsonResponse8({ error: e.message }, 500);
  }
}
__name(onRequestGet7, "onRequestGet7");
__name2(onRequestGet7, "onRequestGet");
async function onRequestPost6(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse8({ error: "D1 not configured" }, 500);
    const report = await context.request.json();
    if (!report.id) return jsonResponse8({ error: "Report ID is required" }, 400);
    await db.prepare(
      `INSERT OR REPLACE INTO production_hotpress_reports (
        id, report_date, shift, operator_name, output_sheets, remarks
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      report.id,
      report.date || "",
      report.shift || "Day",
      report.operator || "",
      report.totalBoards || 0,
      JSON.stringify(report)
    ).run();
    return jsonResponse8({ success: true });
  } catch (e) {
    return jsonResponse8({ error: e.message }, 500);
  }
}
__name(onRequestPost6, "onRequestPost6");
__name2(onRequestPost6, "onRequestPost");
async function onRequestDelete4(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse8({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse8({ error: "ID is required" }, 400);
    await db.prepare("DELETE FROM production_hotpress_reports WHERE id = ?").bind(id).run();
    return jsonResponse8({ success: true });
  } catch (e) {
    return jsonResponse8({ error: e.message }, 500);
  }
}
__name(onRequestDelete4, "onRequestDelete4");
__name2(onRequestDelete4, "onRequestDelete");
function jsonResponse8(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse8, "jsonResponse8");
__name2(jsonResponse8, "jsonResponse");
async function onRequestGet8(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse9({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT lot_no, entry_date, vendor_name, invoice_no, po_no, mrn_no, inv_qty, spl_qty, rate, dn_rate_diff, dn_status FROM erp_purchases WHERE material_type LIKE '%Nilgiri%' ORDER BY entry_date DESC"
    ).all();
    const lots = (results || []).map((row) => ({
      lot: row.lot_no || "",
      date: row.entry_date || "",
      vendor: row.vendor_name || "",
      inv_no: row.invoice_no || "",
      po: row.po_no || "",
      mrn: row.mrn_no || "",
      inv_qty: String(row.inv_qty || 0),
      spl_qty: String(row.spl_qty || 0),
      rate: String(row.rate || 0),
      rate_diff: String(row.dn_rate_diff || 0),
      note_type: row.dn_status === "Issued" ? "debit" : "none"
    }));
    return jsonResponse9(lots);
  } catch (e) {
    return jsonResponse9({ error: e.message }, 500);
  }
}
__name(onRequestGet8, "onRequestGet8");
__name2(onRequestGet8, "onRequestGet");
function jsonResponse9(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse9, "jsonResponse9");
__name2(jsonResponse9, "jsonResponse");
async function onRequestGet9(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse10({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT remarks FROM production_summaries ORDER BY created_at DESC"
    ).all();
    const reports = (results || []).map((row) => {
      try {
        return JSON.parse(row.remarks);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    return jsonResponse10(reports);
  } catch (e) {
    return jsonResponse10({ error: e.message }, 500);
  }
}
__name(onRequestGet9, "onRequestGet9");
__name2(onRequestGet9, "onRequestGet");
async function onRequestPost7(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse10({ error: "D1 not configured" }, 500);
    const report = await context.request.json();
    if (!report.id) return jsonResponse10({ error: "Report ID is required" }, 400);
    await db.prepare(
      `INSERT OR REPLACE INTO production_summaries (
        id, report_date, remarks
      ) VALUES (?, ?, ?)`
    ).bind(
      report.id,
      report.date || "",
      JSON.stringify(report)
    ).run();
    return jsonResponse10({ success: true });
  } catch (e) {
    return jsonResponse10({ error: e.message }, 500);
  }
}
__name(onRequestPost7, "onRequestPost7");
__name2(onRequestPost7, "onRequestPost");
async function onRequestDelete5(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse10({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse10({ error: "ID is required" }, 400);
    await db.prepare("DELETE FROM production_summaries WHERE id = ?").bind(id).run();
    return jsonResponse10({ success: true });
  } catch (e) {
    return jsonResponse10({ error: e.message }, 500);
  }
}
__name(onRequestDelete5, "onRequestDelete5");
__name2(onRequestDelete5, "onRequestDelete");
function jsonResponse10(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse10, "jsonResponse10");
__name2(jsonResponse10, "jsonResponse");
async function onRequestGet10(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse11({ error: "D1 not configured" }, 500);
    const [openingRes, slipsRes, reclassRes] = await Promise.all([
      db.prepare("SELECT sku, qty FROM stock_opening").all(),
      db.prepare("SELECT from_sku, to_sku, qty FROM stock_slips").all(),
      db.prepare("SELECT from_sku, to_sku, qty FROM stock_reclass").all()
    ]);
    const stock = {};
    if (openingRes.results) {
      openingRes.results.forEach((row) => {
        stock[row.sku] = (stock[row.sku] || 0) + row.qty;
      });
    }
    if (slipsRes.results) {
      slipsRes.results.forEach((row) => {
        stock[row.from_sku] = Math.max(0, (stock[row.from_sku] || 0) - row.qty);
        stock[row.to_sku] = (stock[row.to_sku] || 0) + row.qty;
      });
    }
    if (reclassRes.results) {
      reclassRes.results.forEach((row) => {
        stock[row.from_sku] = Math.max(0, (stock[row.from_sku] || 0) - row.qty);
        stock[row.to_sku] = (stock[row.to_sku] || 0) + row.qty;
      });
    }
    const balances = Object.keys(stock).map((sku) => ({
      sku,
      qty: stock[sku]
    }));
    return jsonResponse11(balances);
  } catch (e) {
    return jsonResponse11({ error: e.message }, 500);
  }
}
__name(onRequestGet10, "onRequestGet10");
__name2(onRequestGet10, "onRequestGet");
function jsonResponse11(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse11, "jsonResponse11");
__name2(jsonResponse11, "jsonResponse");
async function onRequestGet11(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse12({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT * FROM stock_opening ORDER BY created_at DESC"
    ).all();
    const opening = (results || []).map((row) => ({
      sku: row.sku,
      desc: row.desc,
      qty: row.qty,
      date: row.entry_date,
      note: row.note,
      time: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));
    return jsonResponse12(opening);
  } catch (e) {
    return jsonResponse12({ error: e.message }, 500);
  }
}
__name(onRequestGet11, "onRequestGet11");
__name2(onRequestGet11, "onRequestGet");
async function onRequestPost8(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse12({ error: "D1 not configured" }, 500);
    const entry = await context.request.json();
    if (!entry.sku) return jsonResponse12({ error: "SKU is required" }, 400);
    await db.prepare(
      `INSERT INTO stock_opening (
        id, sku, "desc", qty, entry_date, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(entry.time || Date.now()),
      entry.sku,
      entry.desc || "",
      entry.qty || 0,
      entry.date || "",
      entry.note || "",
      entry.time ? new Date(entry.time).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse12({ success: true });
  } catch (e) {
    return jsonResponse12({ error: e.message }, 500);
  }
}
__name(onRequestPost8, "onRequestPost8");
__name2(onRequestPost8, "onRequestPost");
async function onRequestDelete6(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse12({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse12({ error: "ID query param is required" }, 400);
    await db.prepare("DELETE FROM stock_opening WHERE id = ?").bind(id).run();
    return jsonResponse12({ success: true });
  } catch (e) {
    return jsonResponse12({ error: e.message }, 500);
  }
}
__name(onRequestDelete6, "onRequestDelete6");
__name2(onRequestDelete6, "onRequestDelete");
function jsonResponse12(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse12, "jsonResponse12");
__name2(jsonResponse12, "jsonResponse");
async function onRequestGet12(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse13({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT * FROM stock_reclass ORDER BY created_at DESC"
    ).all();
    const reclass = (results || []).map((row) => ({
      no: row.str_no,
      fromSku: row.from_sku,
      toSku: row.to_sku,
      qty: row.qty,
      reason: row.reason,
      ref: row.ref,
      date: row.entry_date,
      fromDesc: row.from_desc,
      toDesc: row.to_desc,
      fromDept: row.from_dept,
      toDept: row.to_dept,
      scenario: row.scenario,
      time: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));
    return jsonResponse13(reclass);
  } catch (e) {
    return jsonResponse13({ error: e.message }, 500);
  }
}
__name(onRequestGet12, "onRequestGet12");
__name2(onRequestGet12, "onRequestGet");
async function onRequestPost9(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse13({ error: "D1 not configured" }, 500);
    const entry = await context.request.json();
    if (!entry.no) return jsonResponse13({ error: "STR number is required" }, 400);
    await db.prepare(
      `INSERT INTO stock_reclass (
        id, str_no, from_sku, to_sku, qty, reason, ref, entry_date,
        from_desc, to_desc, from_dept, to_dept, scenario, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(entry.time || Date.now()),
      entry.no,
      entry.fromSku,
      entry.toSku,
      entry.qty || 0,
      entry.reason || "",
      entry.ref || "",
      entry.date || "",
      entry.fromDesc || "",
      entry.toDesc || "",
      entry.fromDept || "",
      entry.toDept || "",
      entry.scenario || "",
      entry.time ? new Date(entry.time).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse13({ success: true });
  } catch (e) {
    return jsonResponse13({ error: e.message }, 500);
  }
}
__name(onRequestPost9, "onRequestPost9");
__name2(onRequestPost9, "onRequestPost");
async function onRequestDelete7(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse13({ error: "D1 not configured" }, 500);
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse13({ error: "ID query param is required" }, 400);
    await db.prepare("DELETE FROM stock_reclass WHERE id = ?").bind(id).run();
    return jsonResponse13({ success: true });
  } catch (e) {
    return jsonResponse13({ error: e.message }, 500);
  }
}
__name(onRequestDelete7, "onRequestDelete7");
__name2(onRequestDelete7, "onRequestDelete");
function jsonResponse13(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse13, "jsonResponse13");
__name2(jsonResponse13, "jsonResponse");
async function onRequestGet13(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse14({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT * FROM stock_slips ORDER BY created_at DESC"
    ).all();
    const slips = (results || []).map((row) => ({
      id: isNaN(Number(row.id)) ? row.id : Number(row.id),
      type: row.slip_type,
      no: row.slip_no,
      fromId: row.from_id,
      fromSku: row.from_sku,
      fromThick: row.from_thick,
      toId: row.to_id,
      toSku: row.to_sku,
      toThick: row.to_thick,
      qty: row.qty,
      batch: row.batch,
      refNo: row.ref_no,
      shift: row.shift,
      remarks: row.remarks,
      time: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    }));
    return jsonResponse14(slips);
  } catch (e) {
    return jsonResponse14({ error: e.message }, 500);
  }
}
__name(onRequestGet13, "onRequestGet13");
__name2(onRequestGet13, "onRequestGet");
async function onRequestPost10(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse14({ error: "D1 not configured" }, 500);
    const slip = await context.request.json();
    if (!slip.no) return jsonResponse14({ error: "Slip number is required" }, 400);
    await db.prepare(
      `INSERT INTO stock_slips (
        id, slip_type, slip_no, from_id, from_sku, from_thick, to_id, to_sku, to_thick,
        qty, batch, ref_no, shift, remarks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      String(slip.id || Date.now()),
      slip.type || "SIS",
      slip.no,
      slip.fromId || "",
      slip.fromSku || "",
      slip.fromThick || "",
      slip.toId || "",
      slip.toSku || "",
      slip.toThick || "",
      slip.qty || 0,
      slip.batch || "",
      slip.refNo || "",
      slip.shift || "",
      slip.remarks || "",
      slip.time ? new Date(slip.time).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse14({ success: true });
  } catch (e) {
    return jsonResponse14({ error: e.message }, 500);
  }
}
__name(onRequestPost10, "onRequestPost10");
__name2(onRequestPost10, "onRequestPost");
function jsonResponse14(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse14, "jsonResponse14");
__name2(jsonResponse14, "jsonResponse");
async function onRequestPut2(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse15({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    const body = await context.request.json();
    await db.prepare(
      `UPDATE vendor_categories SET
        name = ?, icon = ?, color_class = ?, description = ?, sort_order = ?, status = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.name || "",
      body.icon || "\u{1F3F7}\uFE0F",
      body.colorClass || body.color_class || "c1",
      body.description || "",
      body.sort_order || 99,
      body.status || "active",
      body.notes || "",
      id
    ).run();
    return jsonResponse15({ success: true });
  } catch (e) {
    return jsonResponse15({ error: e.message }, 500);
  }
}
__name(onRequestPut2, "onRequestPut2");
__name2(onRequestPut2, "onRequestPut");
async function onRequestDelete8(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse15({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    await db.prepare("DELETE FROM vendor_categories WHERE id = ?").bind(id).run();
    return jsonResponse15({ success: true });
  } catch (e) {
    return jsonResponse15({ error: e.message }, 500);
  }
}
__name(onRequestDelete8, "onRequestDelete8");
__name2(onRequestDelete8, "onRequestDelete");
function jsonResponse15(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse15, "jsonResponse15");
__name2(jsonResponse15, "jsonResponse");
async function onRequestPut3(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse16({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    const body = await context.request.json();
    await db.prepare(
      `UPDATE vendor_cities SET
        city = ?, state = ?, pincodes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.city || "",
      body.state || "",
      JSON.stringify(body.pincodes || []),
      id
    ).run();
    return jsonResponse16({ success: true });
  } catch (e) {
    return jsonResponse16({ error: e.message }, 500);
  }
}
__name(onRequestPut3, "onRequestPut3");
__name2(onRequestPut3, "onRequestPut");
async function onRequestDelete9(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse16({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    await db.prepare("DELETE FROM vendor_cities WHERE id = ?").bind(id).run();
    return jsonResponse16({ success: true });
  } catch (e) {
    return jsonResponse16({ error: e.message }, 500);
  }
}
__name(onRequestDelete9, "onRequestDelete9");
__name2(onRequestDelete9, "onRequestDelete");
function jsonResponse16(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse16, "jsonResponse16");
__name2(jsonResponse16, "jsonResponse");
async function onRequestPut4(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse17({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    const body = await context.request.json();
    await db.prepare(
      `UPDATE vendor_products SET
        name = ?, code = ?, category = ?, unit = ?, alt_unit = ?, conv_factor = ?, hsn = ?,
        gst_rate = ?, moq = ?, lead_time = ?, description = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.name || "",
      body.code || "",
      body.category || "",
      body.unit || "",
      body.alt_unit || "",
      body.conv_factor || 1,
      body.hsn || "",
      body.gst_rate || "",
      body.moq || 0,
      body.lead_time || 0,
      body.description || "",
      body.notes || "",
      id
    ).run();
    return jsonResponse17({ success: true });
  } catch (e) {
    return jsonResponse17({ error: e.message }, 500);
  }
}
__name(onRequestPut4, "onRequestPut4");
__name2(onRequestPut4, "onRequestPut");
async function onRequestDelete10(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse17({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    await db.prepare("DELETE FROM vendor_products WHERE id = ?").bind(id).run();
    return jsonResponse17({ success: true });
  } catch (e) {
    return jsonResponse17({ error: e.message }, 500);
  }
}
__name(onRequestDelete10, "onRequestDelete10");
__name2(onRequestDelete10, "onRequestDelete");
function jsonResponse17(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse17, "jsonResponse17");
__name2(jsonResponse17, "jsonResponse");
async function onRequestPut5(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse18({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    const body = await context.request.json();
    await db.prepare(
      `UPDATE vendor_tnc SET
        title = ?, category = ?, version = ?, body = ?, summary = ?, status = ?, applies = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.title || "",
      body.category || "",
      body.version || "1.0",
      body.body || "",
      body.summary || "",
      body.status || "active",
      body.applies || "all",
      body.notes || "",
      id
    ).run();
    return jsonResponse18({ success: true });
  } catch (e) {
    return jsonResponse18({ error: e.message }, 500);
  }
}
__name(onRequestPut5, "onRequestPut5");
__name2(onRequestPut5, "onRequestPut");
async function onRequestDelete11(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse18({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    await db.prepare("DELETE FROM vendor_tnc WHERE id = ?").bind(id).run();
    return jsonResponse18({ success: true });
  } catch (e) {
    return jsonResponse18({ error: e.message }, 500);
  }
}
__name(onRequestDelete11, "onRequestDelete11");
__name2(onRequestDelete11, "onRequestDelete");
function jsonResponse18(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse18, "jsonResponse18");
__name2(jsonResponse18, "jsonResponse");
async function onRequestPut6(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse19({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    const body = await context.request.json();
    await db.prepare(
      `UPDATE vendor_records SET
        name = ?, code = ?, type = ?, categories = ?, products = ?, contact = ?, designation = ?,
        phone = ?, email = ?, address = ?, pincode = ?, city = ?, state = ?, website = ?,
        gst = ?, pan = ?, msme = ?, payment_terms = ?, bank = ?, account_no = ?, ifsc = ?,
        notes = ?, rating = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?`
    ).bind(
      body.name || "",
      body.code || "",
      body.type || "",
      JSON.stringify(body.categories || []),
      JSON.stringify(body.products || []),
      body.contact || "",
      body.designation || "",
      body.phone || "",
      body.email || "",
      body.address || "",
      body.pincode || "",
      body.city || "",
      body.state || "",
      body.website || "",
      body.gst || "",
      body.pan || "",
      body.msme || "",
      body.payment_terms || "",
      body.bank || "",
      body.account_no || "",
      body.ifsc || "",
      body.notes || "",
      body.rating || 0,
      body.status || "pending",
      id
    ).run();
    return jsonResponse19({ success: true });
  } catch (e) {
    return jsonResponse19({ error: e.message }, 500);
  }
}
__name(onRequestPut6, "onRequestPut6");
__name2(onRequestPut6, "onRequestPut");
async function onRequestDelete12(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse19({ error: "D1 not configured" }, 500);
    const id = context.params.id;
    await db.prepare("DELETE FROM vendor_records WHERE id = ?").bind(id).run();
    return jsonResponse19({ success: true });
  } catch (e) {
    return jsonResponse19({ error: e.message }, 500);
  }
}
__name(onRequestDelete12, "onRequestDelete12");
__name2(onRequestDelete12, "onRequestDelete");
function jsonResponse19(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse19, "jsonResponse19");
__name2(jsonResponse19, "jsonResponse");
async function onRequestPost11(context) {
  try {
    const { username, password } = await context.request.json();
    if (!username || !password) {
      return jsonResponse20({ error: "Username and password required" }, 400);
    }
    const db = context.env.DB;
    if (!db) {
      return jsonResponse20({ error: "D1 database binding (DB) is not configured" }, 500);
    }
    const { results } = await db.prepare(
      "SELECT * FROM users WHERE username = ? AND password = ?"
    ).bind(username.trim().toLowerCase(), password).all();
    if (!results || !results.length) {
      return jsonResponse20({ error: "Invalid username or password" }, 401);
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
      modules: JSON.parse(row.modules || "[]"),
      subRights: JSON.parse(row.sub_rights || "{}")
    };
    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `session_user=${user.username}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    return jsonResponse20({ error: "Server error: " + e.message }, 500);
  }
}
__name(onRequestPost11, "onRequestPost11");
__name2(onRequestPost11, "onRequestPost");
function jsonResponse20(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse20, "jsonResponse20");
__name2(jsonResponse20, "jsonResponse");
async function onRequestGet14(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse21({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare("SELECT * FROM vendor_categories ORDER BY sort_order, name").all();
    const categories = (results || []).map((row) => ({
      _id: row.id,
      name: row.name,
      icon: row.icon,
      colorClass: row.color_class,
      description: row.description,
      sort_order: row.sort_order,
      status: row.status,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at
    }));
    return jsonResponse21(categories);
  } catch (e) {
    return jsonResponse21({ error: e.message }, 500);
  }
}
__name(onRequestGet14, "onRequestGet14");
__name2(onRequestGet14, "onRequestGet");
async function onRequestPost12(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse21({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const id = body._id || "c_" + Date.now();
    await db.prepare(
      `INSERT INTO vendor_categories (
        id, name, icon, color_class, description, sort_order, status, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.name || "",
      body.icon || "\u{1F3F7}\uFE0F",
      body.colorClass || body.color_class || "c1",
      body.description || "",
      body.sort_order || 99,
      body.status || "active",
      body.notes || "",
      body.created_by || "",
      body.created_at || (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse21({ success: true, id });
  } catch (e) {
    return jsonResponse21({ error: e.message }, 500);
  }
}
__name(onRequestPost12, "onRequestPost12");
__name2(onRequestPost12, "onRequestPost");
function jsonResponse21(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse21, "jsonResponse21");
__name2(jsonResponse21, "jsonResponse");
async function onRequestGet15(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse22({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare("SELECT * FROM vendor_cities ORDER BY city").all();
    const cities = (results || []).map((row) => ({
      _id: row.id,
      city: row.city,
      state: row.state,
      pincodes: JSON.parse(row.pincodes || "[]")
    }));
    return jsonResponse22(cities);
  } catch (e) {
    return jsonResponse22({ error: e.message }, 500);
  }
}
__name(onRequestGet15, "onRequestGet15");
__name2(onRequestGet15, "onRequestGet");
async function onRequestPost13(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse22({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const id = body._id || "ct_" + Date.now();
    await db.prepare(
      `INSERT INTO vendor_cities (id, city, state, pincodes) VALUES (?, ?, ?, ?)`
    ).bind(
      id,
      body.city || "",
      body.state || "",
      JSON.stringify(body.pincodes || [])
    ).run();
    return jsonResponse22({ success: true, id });
  } catch (e) {
    return jsonResponse22({ error: e.message }, 500);
  }
}
__name(onRequestPost13, "onRequestPost13");
__name2(onRequestPost13, "onRequestPost");
function jsonResponse22(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse22, "jsonResponse22");
__name2(jsonResponse22, "jsonResponse");
async function onRequestGet16(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse23({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare("SELECT * FROM vendor_products").all();
    const products = (results || []).map((row) => ({
      _id: row.id,
      name: row.name,
      code: row.code,
      category: row.category,
      unit: row.unit,
      alt_unit: row.alt_unit,
      conv_factor: row.conv_factor,
      hsn: row.hsn,
      gst_rate: row.gst_rate,
      moq: row.moq,
      lead_time: row.lead_time,
      description: row.description,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at
    }));
    return jsonResponse23(products);
  } catch (e) {
    return jsonResponse23({ error: e.message }, 500);
  }
}
__name(onRequestGet16, "onRequestGet16");
__name2(onRequestGet16, "onRequestGet");
async function onRequestPost14(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse23({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const id = body._id || "p_" + Date.now();
    await db.prepare(
      `INSERT INTO vendor_products (
        id, name, code, category, unit, alt_unit, conv_factor, hsn, gst_rate, moq,
        lead_time, description, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.name || "",
      body.code || "",
      body.category || "",
      body.unit || "",
      body.alt_unit || "",
      body.conv_factor || 1,
      body.hsn || "",
      body.gst_rate || "",
      body.moq || 0,
      body.lead_time || 0,
      body.description || "",
      body.notes || "",
      body.created_by || "",
      body.created_at || (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse23({ success: true, id });
  } catch (e) {
    return jsonResponse23({ error: e.message }, 500);
  }
}
__name(onRequestPost14, "onRequestPost14");
__name2(onRequestPost14, "onRequestPost");
function jsonResponse23(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse23, "jsonResponse23");
__name2(jsonResponse23, "jsonResponse");
async function onRequestGet17(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse24({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT * FROM custom_roles ORDER BY name"
    ).all();
    const roles = (results || []).map((row) => ({
      id: row.id,
      name: row.name,
      desc: row.description,
      color: row.color,
      modules: JSON.parse(row.modules || "[]"),
      subRights: JSON.parse(row.sub_rights || "{}"),
      isBuiltin: false
    }));
    return jsonResponse24({ roles });
  } catch (e) {
    return jsonResponse24({ error: e.message }, 500);
  }
}
__name(onRequestGet17, "onRequestGet17");
__name2(onRequestGet17, "onRequestGet");
async function onRequestPost15(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse24({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const { action } = body;
    if (action === "create") {
      const { id, name, desc, color, modules, subRights } = body;
      if (!id || !name) {
        return jsonResponse24({ error: "Role ID and name are required" }, 400);
      }
      const existing = await db.prepare(
        "SELECT id FROM custom_roles WHERE id = ?"
      ).bind(id).first();
      if (existing) {
        return jsonResponse24({ error: `Role ID "${id}" already exists` }, 409);
      }
      await db.prepare(
        `INSERT INTO custom_roles (id, name, description, color, modules, sub_rights)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        name,
        desc || "",
        color || "#374151",
        JSON.stringify(modules || []),
        JSON.stringify(subRights || {})
      ).run();
      return jsonResponse24({ success: true });
    }
    if (action === "update") {
      const { id, name, desc, color, modules, subRights } = body;
      if (!id) return jsonResponse24({ error: "Role ID is required" }, 400);
      await db.prepare(
        `UPDATE custom_roles SET name = ?, description = ?, color = ?,
         modules = ?, sub_rights = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).bind(
        name || "",
        desc || "",
        color || "#374151",
        JSON.stringify(modules || []),
        JSON.stringify(subRights || {}),
        id
      ).run();
      return jsonResponse24({ success: true });
    }
    if (action === "delete") {
      const { id } = body;
      if (!id) return jsonResponse24({ error: "Role ID is required" }, 400);
      await db.prepare("DELETE FROM custom_roles WHERE id = ?").bind(id).run();
      return jsonResponse24({ success: true });
    }
    return jsonResponse24({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return jsonResponse24({ error: e.message }, 500);
  }
}
__name(onRequestPost15, "onRequestPost15");
__name2(onRequestPost15, "onRequestPost");
function jsonResponse24(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse24, "jsonResponse24");
__name2(jsonResponse24, "jsonResponse");
async function onRequestGet18(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse25({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare("SELECT * FROM vendor_tnc ORDER BY category, title").all();
    const tnc = (results || []).map((row) => ({
      _id: row.id,
      title: row.title,
      category: row.category,
      version: row.version,
      body: row.body,
      summary: row.summary,
      status: row.status,
      applies: row.applies,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at
    }));
    return jsonResponse25(tnc);
  } catch (e) {
    return jsonResponse25({ error: e.message }, 500);
  }
}
__name(onRequestGet18, "onRequestGet18");
__name2(onRequestGet18, "onRequestGet");
async function onRequestPost16(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse25({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const id = body._id || "tnc_" + Date.now();
    await db.prepare(
      `INSERT INTO vendor_tnc (
        id, title, category, version, body, summary, status, applies, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.title || "",
      body.category || "",
      body.version || "1.0",
      body.body || "",
      body.summary || "",
      body.status || "active",
      body.applies || "all",
      body.notes || "",
      body.created_by || "",
      body.created_at || (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse25({ success: true, id });
  } catch (e) {
    return jsonResponse25({ error: e.message }, 500);
  }
}
__name(onRequestPost16, "onRequestPost16");
__name2(onRequestPost16, "onRequestPost");
function jsonResponse25(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse25, "jsonResponse25");
__name2(jsonResponse25, "jsonResponse");
async function onRequestGet19(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse26({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare(
      "SELECT * FROM users ORDER BY name"
    ).all();
    const users = (results || []).map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      password: row.password,
      role: row.role,
      dept: row.dept,
      avatar: row.avatar,
      color: row.color,
      modules: JSON.parse(row.modules || "[]"),
      subRights: JSON.parse(row.sub_rights || "{}")
    }));
    return jsonResponse26({ users });
  } catch (e) {
    return jsonResponse26({ error: e.message }, 500);
  }
}
__name(onRequestGet19, "onRequestGet19");
__name2(onRequestGet19, "onRequestGet");
async function onRequestPost17(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse26({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const { action } = body;
    if (action === "create") {
      const { id, name, username, password, role, dept, avatar, color, modules, subRights } = body;
      if (!name || !username || !password) {
        return jsonResponse26({ error: "Name, username, and password are required" }, 400);
      }
      const existing = await db.prepare(
        "SELECT id FROM users WHERE username = ?"
      ).bind(username.toLowerCase()).first();
      if (existing) {
        return jsonResponse26({ error: `Username "${username}" already exists` }, 409);
      }
      await db.prepare(
        `INSERT INTO users (id, name, username, password, role, dept, avatar, color, modules, sub_rights)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id || "u" + Date.now(),
        name,
        username.toLowerCase(),
        password,
        role || "dispatch",
        dept || "",
        avatar || name.slice(0, 2).toUpperCase(),
        color || "#B91C1C",
        JSON.stringify(modules || []),
        JSON.stringify(subRights || {})
      ).run();
      return jsonResponse26({ success: true });
    }
    if (action === "update") {
      const { id, name, username, password, role, dept, avatar, color, modules, subRights } = body;
      if (!id) return jsonResponse26({ error: "User ID is required" }, 400);
      if (username) {
        const dup = await db.prepare(
          "SELECT id FROM users WHERE username = ? AND id != ?"
        ).bind(username.toLowerCase(), id).first();
        if (dup) {
          return jsonResponse26({ error: `Username "${username}" is already in use` }, 409);
        }
      }
      const sets = [];
      const vals = [];
      if (name !== void 0) {
        sets.push("name = ?");
        vals.push(name);
      }
      if (username !== void 0) {
        sets.push("username = ?");
        vals.push(username.toLowerCase());
      }
      if (password) {
        sets.push("password = ?");
        vals.push(password);
      }
      if (role !== void 0) {
        sets.push("role = ?");
        vals.push(role);
      }
      if (dept !== void 0) {
        sets.push("dept = ?");
        vals.push(dept);
      }
      if (avatar !== void 0) {
        sets.push("avatar = ?");
        vals.push(avatar);
      }
      if (color !== void 0) {
        sets.push("color = ?");
        vals.push(color);
      }
      if (modules !== void 0) {
        sets.push("modules = ?");
        vals.push(JSON.stringify(modules));
      }
      if (subRights !== void 0) {
        sets.push("sub_rights = ?");
        vals.push(JSON.stringify(subRights));
      }
      sets.push("updated_at = datetime('now')");
      vals.push(id);
      await db.prepare(
        `UPDATE users SET ${sets.join(", ")} WHERE id = ?`
      ).bind(...vals).run();
      return jsonResponse26({ success: true });
    }
    if (action === "delete") {
      const { id } = body;
      if (!id) return jsonResponse26({ error: "User ID is required" }, 400);
      await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      return jsonResponse26({ success: true });
    }
    return jsonResponse26({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return jsonResponse26({ error: e.message }, 500);
  }
}
__name(onRequestPost17, "onRequestPost17");
__name2(onRequestPost17, "onRequestPost");
function jsonResponse26(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse26, "jsonResponse26");
__name2(jsonResponse26, "jsonResponse");
async function onRequestGet20(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse27({ error: "D1 not configured" }, 500);
    const { results } = await db.prepare("SELECT * FROM vendor_records").all();
    const vendors = (results || []).map((row) => ({
      _id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      categories: JSON.parse(row.categories || "[]"),
      products: JSON.parse(row.products || "[]"),
      contact: row.contact,
      designation: row.designation,
      phone: row.phone,
      email: row.email,
      address: row.address,
      pincode: row.pincode,
      city: row.city,
      state: row.state,
      website: row.website,
      gst: row.gst,
      pan: row.pan,
      msme: row.msme,
      payment_terms: row.payment_terms,
      bank: row.bank,
      account_no: row.account_no,
      ifsc: row.ifsc,
      notes: row.notes,
      rating: row.rating,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
      approved_at: row.approved_at,
      approved_by: row.approved_by,
      activated_at: row.activated_at,
      blacklisted_at: row.blacklisted_at,
      blacklist_reason: row.blacklist_reason
    }));
    return jsonResponse27(vendors);
  } catch (e) {
    return jsonResponse27({ error: e.message }, 500);
  }
}
__name(onRequestGet20, "onRequestGet20");
__name2(onRequestGet20, "onRequestGet");
async function onRequestPost18(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse27({ error: "D1 not configured" }, 500);
    const body = await context.request.json();
    const id = body._id || "v_" + Date.now();
    await db.prepare(
      `INSERT INTO vendor_records (
        id, name, code, type, categories, products, contact, designation, phone, email,
        address, pincode, city, state, website, gst, pan, msme, payment_terms, bank,
        account_no, ifsc, notes, rating, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.name || "",
      body.code || "",
      body.type || "",
      JSON.stringify(body.categories || []),
      JSON.stringify(body.products || []),
      body.contact || "",
      body.designation || "",
      body.phone || "",
      body.email || "",
      body.address || "",
      body.pincode || "",
      body.city || "",
      body.state || "",
      body.website || "",
      body.gst || "",
      body.pan || "",
      body.msme || "",
      body.payment_terms || "",
      body.bank || "",
      body.account_no || "",
      body.ifsc || "",
      body.notes || "",
      body.rating || 0,
      body.status || "pending",
      body.created_by || "",
      body.created_at || (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    return jsonResponse27({ success: true, id });
  } catch (e) {
    return jsonResponse27({ error: e.message }, 500);
  }
}
__name(onRequestPost18, "onRequestPost18");
__name2(onRequestPost18, "onRequestPost");
function jsonResponse27(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
__name(jsonResponse27, "jsonResponse27");
__name2(jsonResponse27, "jsonResponse");
var routes = [
  {
    routePath: "/api/vendors/:id/status",
    mountPath: "/api/vendors/:id",
    method: "PATCH",
    middlewares: [],
    modules: [onRequestPatch]
  },
  {
    routePath: "/api/auth/me",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/dispatch/state",
    mountPath: "/api/dispatch",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/dispatch/state",
    mountPath: "/api/dispatch",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/maintenance/areas",
    mountPath: "/api/maintenance",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/maintenance/areas",
    mountPath: "/api/maintenance",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/maintenance/areas",
    mountPath: "/api/maintenance",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/maintenance/timeline",
    mountPath: "/api/maintenance",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/maintenance/timeline",
    mountPath: "/api/maintenance",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/maintenance/work-orders",
    mountPath: "/api/maintenance",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/maintenance/work-orders",
    mountPath: "/api/maintenance",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/maintenance/work-orders",
    mountPath: "/api/maintenance",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/maintenance/work-orders",
    mountPath: "/api/maintenance",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/production/chipping",
    mountPath: "/api/production",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete3]
  },
  {
    routePath: "/api/production/chipping",
    mountPath: "/api/production",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/production/chipping",
    mountPath: "/api/production",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/production/hotpress",
    mountPath: "/api/production",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete4]
  },
  {
    routePath: "/api/production/hotpress",
    mountPath: "/api/production",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/production/hotpress",
    mountPath: "/api/production",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/production/nilgiri-lots",
    mountPath: "/api/production",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet8]
  },
  {
    routePath: "/api/production/summaries",
    mountPath: "/api/production",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete5]
  },
  {
    routePath: "/api/production/summaries",
    mountPath: "/api/production",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet9]
  },
  {
    routePath: "/api/production/summaries",
    mountPath: "/api/production",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/stock/balances",
    mountPath: "/api/stock",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet10]
  },
  {
    routePath: "/api/stock/opening",
    mountPath: "/api/stock",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete6]
  },
  {
    routePath: "/api/stock/opening",
    mountPath: "/api/stock",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet11]
  },
  {
    routePath: "/api/stock/opening",
    mountPath: "/api/stock",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/stock/reclass",
    mountPath: "/api/stock",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete7]
  },
  {
    routePath: "/api/stock/reclass",
    mountPath: "/api/stock",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet12]
  },
  {
    routePath: "/api/stock/reclass",
    mountPath: "/api/stock",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/stock/slips",
    mountPath: "/api/stock",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet13]
  },
  {
    routePath: "/api/stock/slips",
    mountPath: "/api/stock",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  },
  {
    routePath: "/api/categories/:id",
    mountPath: "/api/categories",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete8]
  },
  {
    routePath: "/api/categories/:id",
    mountPath: "/api/categories",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut2]
  },
  {
    routePath: "/api/cities/:id",
    mountPath: "/api/cities",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete9]
  },
  {
    routePath: "/api/cities/:id",
    mountPath: "/api/cities",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut3]
  },
  {
    routePath: "/api/products/:id",
    mountPath: "/api/products",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete10]
  },
  {
    routePath: "/api/products/:id",
    mountPath: "/api/products",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut4]
  },
  {
    routePath: "/api/tnc/:id",
    mountPath: "/api/tnc",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete11]
  },
  {
    routePath: "/api/tnc/:id",
    mountPath: "/api/tnc",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut5]
  },
  {
    routePath: "/api/vendors/:id",
    mountPath: "/api/vendors",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete12]
  },
  {
    routePath: "/api/vendors/:id",
    mountPath: "/api/vendors",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut6]
  },
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost11]
  },
  {
    routePath: "/api/categories",
    mountPath: "/api/categories",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet14]
  },
  {
    routePath: "/api/categories",
    mountPath: "/api/categories",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost12]
  },
  {
    routePath: "/api/cities",
    mountPath: "/api/cities",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet15]
  },
  {
    routePath: "/api/cities",
    mountPath: "/api/cities",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost13]
  },
  {
    routePath: "/api/products",
    mountPath: "/api/products",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet16]
  },
  {
    routePath: "/api/products",
    mountPath: "/api/products",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost14]
  },
  {
    routePath: "/api/roles",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet17]
  },
  {
    routePath: "/api/roles",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost15]
  },
  {
    routePath: "/api/tnc",
    mountPath: "/api/tnc",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet18]
  },
  {
    routePath: "/api/tnc",
    mountPath: "/api/tnc",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost16]
  },
  {
    routePath: "/api/users",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet19]
  },
  {
    routePath: "/api/users",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost17]
  },
  {
    routePath: "/api/vendors",
    mountPath: "/api/vendors",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet20]
  },
  {
    routePath: "/api/vendors",
    mountPath: "/api/vendors",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost18]
  }
];
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
__name2(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name2(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  static {
    __name(this, "___Facade_ScheduledController__");
  }
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name2(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name2((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name2((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-aqoaQK/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-aqoaQK/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class ___Facade_ScheduledController__2 {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.917543633164197.js.map
