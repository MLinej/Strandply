// GET  /api/transport/state — Load full transport state from relational tables
// POST /api/transport/state — Upsert all transport entities into relational tables
//
// The response/request JSON shape is IDENTICAL to the old key-value store so the
// frontend requires zero changes. The API layer maps between the flat JS arrays
// and the proper relational rows.

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return json({ error: 'D1 not configured' }, 500);

    const [inqRows, rcRows, apRows, orRows, tpRows, vRows, seqRows] = await Promise.all([
      db.prepare('SELECT * FROM transport_inquiries ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM transport_rate_comparisons ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM transport_approvals ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM transport_orders ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM transport_transporters ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM transport_vehicles ORDER BY id ASC').all(),
      db.prepare("SELECT key, value FROM transport_state WHERE key IN ('_seqInq','_seqRc','_seqAp','_seqOr','RC_DRAFTS')").all(),
    ]);

    // Parse seq counters and RC_DRAFTS from transport_state (still used for these)
    const seqMap = {};
    const seqList = seqRows.results || [];
    seqList.forEach(r => { try { seqMap[r.key] = JSON.parse(r.value); } catch (e) { seqMap[r.key] = r.value; } });

    // Map DB rows → frontend JS object shape
    const INQUIRIES = (inqRows.results || []).map(r => ({
      id: r.id,
      from: r.from_location,
      fromState: r.from_state || '',
      fromPin: r.from_pin || '',
      to: r.to_location,
      toState: r.to_state || '',
      toPin: r.to_pin || '',
      material: r.material || '',
      weight: r.weight || '',
      vehicle: r.vehicle_type || '',
      pickupDate: r.expected_date || '',
      dtype: r.dtype || 'Door Delivery',
      freightPaidBy: r.freight_paid_by || 'Strandply',
      budget: r.budget || 0,
      remarks: r.remarks || '',
      status: r.status === 'draft' ? 'open' : r.status === 'compared' ? 'rate_compared' : (r.status || 'open'),
      rcId: r.rc_id || null,
      createdBy: r.created_by || '',
      created_at: r.created_at || '',
    }));

    const RATE_CMPS = (rcRows.results || []).map(r => ({
      id: r.id,
      inqId: r.inquiry_id,
      from: r.from_location || '',
      fromPin: r.from_pin || '',
      to: r.to_location || '',
      toPin: r.to_pin || '',
      vehicle: r.vehicle || '',
      material: r.material || '',
      weight: r.weight || '',
      budget: r.budget || 0,
      quotes: safeJson(r.quotes_json, []),
      selectedTid: r.selected_tid || '',
      selectedTransporter: r.selected_transporter || '',
      selectedRate: r.selected_rate || 0,
      selectedTransit: r.selected_transit || '',
      selectedMgWeight: r.selected_mg_weight || 0,
      isLowest: !!r.is_lowest,
      exceedsBudget: !!r.exceeds_budget,
      status: r.status || 'pending_approval',
      created_at: r.created_at || '',
    }));

    const APPROVALS = (apRows.results || []).map(r => ({
      id: r.id,
      rcId: r.rc_id || '',
      inqId: r.inquiry_id || '',
      transporter: r.transporter || '',
      selectedRate: r.approved_rate || 0,
      selectedTransit: r.selected_transit || '',
      from: r.from_location || '',
      fromPin: r.from_pin || '',
      to: r.to_location || '',
      toPin: r.to_pin || '',
      vehicle: r.vehicle || '',
      material: r.material || '',
      weight: r.weight || '',
      pickupDate: r.pickup_date || '',
      dtype: r.dtype || '',
      budget: r.budget || 0,
      isLowest: !!r.is_lowest,
      exceedsBudget: !!r.exceeds_budget,
      justification: r.justification || '',
      status: r.approval_status || 'pending',
      nextApprover: r.next_approver || null,
      history: safeJson(r.history_json, []),
      created_at: r.created_at || '',
    }));

    const ORDERS = (orRows.results || []).map(r => ({
      id: r.id,
      apId: r.ap_id || '',
      rcId: r.rc_id || '',
      inqId: r.inq_id || '',
      transporter: r.transporter_name || '',
      tpPhone: r.tp_phone || '',
      tpContact: r.tp_contact || '',
      tpGst: r.tp_gst || '—',
      tpAddress: r.tp_address || '',
      tpCity: r.tp_city || '',
      tpState: r.tp_state || '',
      tpCredit: r.tp_credit || '',
      from: r.from_location || '',
      fromPin: r.from_pin || '',
      to: r.to_location || '',
      toPin: r.to_pin || '',
      vehicle: r.vehicle || '',
      material: r.material || '—',
      weight: r.weight || '—',
      pickupDate: r.pickup_date || 'TBD',
      dtype: r.dtype || 'Normal',
      rate: r.rate || 0,
      transit: r.transit || '—',
      status: r.status || 'issued',
      created_at: r.created_at || '',
    }));

    const TRANSPORTERS = (tpRows.results || []).map(r => ({
      _id: r.id,
      name: r.name || '',
      code: r.code || '',
      contact: r.contact_person || '',
      phone: r.phone || '',
      phone2: r.phone2 || '',
      email: r.email || '',
      tds: r.tds || 'No',
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
      pincode: r.pincode || '',
      gst: r.gst_no || '',
      pan: r.pan_no || '',
      credit: r.credit || 'Against Delivery',
      ifsc: r.ifsc || '',
      bankName: r.bank_name || '',
      bankBranch: r.bank_branch || '',
      accName: r.acc_name || '',
      accNo: r.acc_no || '',
      visitingCard: r.visiting_card || '',
      vehicles: safeJson(r.vehicles_json, []),
      op_cities: safeJson(r.op_cities_json, []),
      rating: r.rating || 3,
      status: r.status || 'active',
    }));

    const VEHICLES = (vRows.results || []).map(r => ({
      id: r.id,
      name: r.name || r.vehicle_type || '',
      desc: r.description || '',
      capacity: r.capacity_mt ? r.capacity_mt + ' Ton' : '',
      active: !!r.is_active,
    }));

    return json({
      INQUIRIES,
      RATE_CMPS,
      APPROVALS,
      ORDERS,
      TRANSPORTERS,
      VEHICLES,
      RC_DRAFTS: seqMap['RC_DRAFTS'] || {},
      _seqInq: seqMap['_seqInq'] || 1,
      _seqRc: seqMap['_seqRc'] || 1,
      _seqAp: seqMap['_seqAp'] || 1,
      _seqOr: seqMap['_seqOr'] || 1,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return json({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    const now = new Date().toISOString();
    const stmts = [];

    // ── INQUIRIES ────────────────────────────────────────────
    (body.INQUIRIES || []).forEach(inq => {
      stmts.push(db.prepare(`
        INSERT OR REPLACE INTO transport_inquiries
          (id, inquiry_no, inquiry_date, from_location, from_state, from_pin,
           to_location, to_state, to_pin, material, weight, vehicle_type,
           expected_date, dtype, freight_paid_by, budget, remarks, status,
           rc_id, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        inq.id, inq.id,
        inq.created_at ? inq.created_at.slice(0, 10) : now.slice(0, 10),
        inq.from || '', inq.fromState || '', inq.fromPin || '',
        inq.to || '', inq.toState || '', inq.toPin || '',
        inq.material || '', inq.weight || '', inq.vehicle || '',
        inq.pickupDate || '', inq.dtype || 'Door Delivery',
        inq.freightPaidBy || 'Strandply', inq.budget || 0,
        inq.remarks || '', mapInqStatus(inq.status),
        inq.rcId || '', inq.createdBy || '',
        inq.created_at || now, now
      ));
    });

    // ── RATE COMPARISONS ─────────────────────────────────────
    (body.RATE_CMPS || []).forEach(rc => {
      stmts.push(db.prepare(`
        INSERT OR REPLACE INTO transport_rate_comparisons
          (id, rc_no, inquiry_id, transporter_id, from_location, from_pin, to_location, to_pin,
           vehicle, material, weight, budget, quotes_json, selected_tid,
           selected_transporter, selected_rate, selected_transit, selected_mg_weight,
           is_lowest, exceeds_budget, status, created_at, quoted_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        rc.id, rc.id, rc.inqId || '', '',
        rc.from || '', rc.fromPin || '', rc.to || '', rc.toPin || '',
        rc.vehicle || '', rc.material || '', rc.weight || '', rc.budget || 0,
        JSON.stringify(rc.quotes || []),
        rc.selectedTid || '', rc.selectedTransporter || '',
        rc.selectedRate || 0, rc.selectedTransit || '',
        rc.selectedMgWeight || 0,
        rc.isLowest ? 1 : 0, rc.exceedsBudget ? 1 : 0,
        rc.status || 'pending_approval',
        rc.created_at || now, now
      ));
    });

    // ── APPROVALS ────────────────────────────────────────────
    (body.APPROVALS || []).forEach(ap => {
      stmts.push(db.prepare(`
        INSERT OR REPLACE INTO transport_approvals
          (id, rc_id, inquiry_id, transporter, approved_rate, selected_transit,
           from_location, from_pin, to_location, to_pin, vehicle, material, weight,
           pickup_date, dtype, budget, is_lowest, exceeds_budget, justification,
           approval_status, next_approver, history_json, created_at, approved_by, approval_date)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        ap.id, ap.rcId || '', ap.inqId || '',
        ap.transporter || '', ap.selectedRate || 0, ap.selectedTransit || '',
        ap.from || '', ap.fromPin || '', ap.to || '', ap.toPin || '',
        ap.vehicle || '', ap.material || '', ap.weight || '',
        ap.pickupDate || '', ap.dtype || '', ap.budget || 0,
        ap.isLowest ? 1 : 0, ap.exceedsBudget ? 1 : 0,
        ap.justification || '',
        ap.status || 'pending', ap.nextApprover || '',
        JSON.stringify(ap.history || []),
        ap.created_at || now,
        ap.status === 'approved' ? (ap.history?.findLast?.(h => h.action?.includes('Approved'))?.user || '') : '',
        ap.status === 'approved' ? (ap.history?.findLast?.(h => h.action?.includes('Approved'))?.ts || '') : ''
      ));
    });

    // ── ORDERS ───────────────────────────────────────────────
    (body.ORDERS || []).forEach(or => {
      stmts.push(db.prepare(`
        INSERT OR REPLACE INTO transport_orders
          (id, order_no, ap_id, rc_id, inq_id, transporter_name, tp_phone, tp_contact,
           tp_gst, tp_address, tp_city, tp_state, tp_credit,
           from_location, from_pin, to_location, to_pin, vehicle, material, weight,
           pickup_date, dtype, rate, transit, status, created_at, updated_at, inquiry_id, transporter_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        or.id, or.id, or.apId || '', or.rcId || '', or.inqId || '',
        or.transporter || '', or.tpPhone || '', or.tpContact || '',
        or.tpGst || '', or.tpAddress || '', or.tpCity || '', or.tpState || '', or.tpCredit || '',
        or.from || '', or.fromPin || '', or.to || '', or.toPin || '',
        or.vehicle || '', or.material || '', or.weight || '',
        or.pickupDate || '', or.dtype || '', or.rate || 0, or.transit || '',
        or.status || 'issued', or.created_at || now, now,
        or.inqId || '', ''  // inquiry_id and transporter_id (FK placeholders)
      ));
    });

    // ── TRANSPORTERS ─────────────────────────────────────────
    (body.TRANSPORTERS || []).forEach(tp => {
      stmts.push(db.prepare(`
        INSERT OR REPLACE INTO transport_transporters
          (id, name, code, contact_person, phone, phone2, email, tds, address,
           city, state, pincode, gst_no, pan_no, credit, ifsc, bank_name, bank_branch,
           acc_name, acc_no, visiting_card, vehicles_json, op_cities_json,
           rating, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        tp._id, tp.name || '', tp.code || '',
        tp.contact || '', tp.phone || '', tp.phone2 || '', tp.email || '',
        tp.tds || 'No', tp.address || '', tp.city || '', tp.state || '',
        tp.pincode || '', tp.gst || '', tp.pan || '',
        tp.credit || 'Against Delivery', tp.ifsc || '',
        tp.bankName || '', tp.bankBranch || '',
        tp.accName || '', tp.accNo || '', tp.visitingCard || '',
        JSON.stringify(tp.vehicles || []),
        JSON.stringify(tp.op_cities || []),
        tp.rating || 3, tp.status || 'active',
        now, now
      ));
    });

    // ── VEHICLES ─────────────────────────────────────────────
    (body.VEHICLES || []).forEach(v => {
      stmts.push(db.prepare(`
        INSERT OR REPLACE INTO transport_vehicles
          (id, name, vehicle_type, description, capacity_mt, is_active, active)
        VALUES (?,?,?,?,?,?,?)
      `).bind(
        v.id, v.name || '', v.name || '',
        v.desc || '', parseFloat(v.capacity) || 0,
        v.active ? 1 : 0, v.active ? 1 : 0
      ));
    });

    // ── SEQ COUNTERS + RC_DRAFTS (stay in transport_state) ──
    const seqKeys = { _seqInq: body._seqInq, _seqRc: body._seqRc, _seqAp: body._seqAp, _seqOr: body._seqOr, RC_DRAFTS: body.RC_DRAFTS || {} };
    Object.entries(seqKeys).forEach(([key, val]) => {
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO transport_state (key, value, updated_at) VALUES (?, ?, ?)'
      ).bind(key, JSON.stringify(val), now));
    });

    // Execute all in one batch
    if (stmts.length > 0) await db.batch(stmts);

    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Map frontend status → DB CHECK constraint (DB: draft|sent|received|compared|approved|ordered|cancelled)
function mapInqStatus(s) {
  const m = { 'open': 'draft', 'rate_compared': 'compared' };
  return m[s] || s || 'draft';
}

function safeJson(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
}
