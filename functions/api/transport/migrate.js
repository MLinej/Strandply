// POST /api/transport/migrate
// One-time migration: reads JSON blobs from transport_state and inserts
// them into the proper relational tables.
// Safe to run multiple times — uses INSERT OR REPLACE.
// Executes in 3 sequential batches to respect FK constraints:
//   batch1: masters (transporters, vehicles)
//   batch2: inquiries (parent FK for all others)
//   batch3: rate_comparisons, approvals, orders (all reference inquiry_id)

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return json({ error: 'D1 not configured' }, 500);

    // Read old JSON blobs
    const { results } = await db.prepare('SELECT key, value FROM transport_state').all();
    const state = {};
    (results || []).forEach(r => {
      try { state[r.key] = JSON.parse(r.value); } catch (e) { state[r.key] = r.value; }
    });

    const now = new Date().toISOString();
    const summary = { inquiries: 0, rateCmps: 0, approvals: 0, orders: 0, transporters: 0, vehicles: 0 };

    const batch1 = []; // masters (no FK deps)
    const batch2 = []; // inquiries (parent)
    const batch3 = []; // dependents (reference inquiry_id)

    // ── TRANSPORTERS ──────────────────────────────────────────
    (state.TRANSPORTERS || []).forEach(tp => {
      batch1.push(db.prepare(`
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
        tp.accName || '', tp.accNo || '', '',
        JSON.stringify(tp.vehicles || []),
        JSON.stringify(tp.op_cities || []),
        tp.rating || 3, tp.status || 'active',
        now, now
      ));
      summary.transporters++;
    });

    // ── VEHICLES ──────────────────────────────────────────────
    (state.VEHICLES || []).forEach(v => {
      batch1.push(db.prepare(`
        INSERT OR REPLACE INTO transport_vehicles
          (id, name, vehicle_type, description, capacity_mt, is_active, active)
        VALUES (?,?,?,?,?,?,?)
      `).bind(
        v.id, v.name || '', v.name || '',
        v.desc || '', parseFloat(v.capacity) || 0,
        v.active ? 1 : 0, v.active ? 1 : 0
      ));
      summary.vehicles++;
    });

    // ── INQUIRIES ─────────────────────────────────────────────
    (state.INQUIRIES || []).forEach(inq => {
      batch2.push(db.prepare(`
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
        inq.material || '', String(inq.weight || ''), inq.vehicle || '',
        inq.pickupDate || '', inq.dtype || 'Door Delivery',
        inq.freightPaidBy || 'Strandply', inq.budget || 0,
        inq.remarks || '', mapInqStatus(inq.status),
        inq.rcId || '', inq.createdBy || '',
        inq.created_at || now, now
      ));
      summary.inquiries++;
    });

    // ── RATE COMPARISONS ──────────────────────────────────────
    (state.RATE_CMPS || []).forEach(rc => {
      batch3.push(db.prepare(`
        INSERT OR REPLACE INTO transport_rate_comparisons
          (id, rc_no, inquiry_id, transporter_id, from_location, from_pin, to_location, to_pin,
           vehicle, material, weight, budget, quotes_json, selected_tid,
           selected_transporter, selected_rate, selected_transit, selected_mg_weight,
           is_lowest, exceeds_budget, status, created_at, quoted_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        rc.id, rc.id, rc.inqId || '', null,
        rc.from || '', rc.fromPin || '', rc.to || '', rc.toPin || '',
        rc.vehicle || '', rc.material || '', String(rc.weight || ''), rc.budget || 0,
        JSON.stringify(rc.quotes || []),
        rc.selectedTid || '', rc.selectedTransporter || '',
        rc.selectedRate || 0, rc.selectedTransit || '', rc.selectedMgWeight || 0,
        rc.isLowest ? 1 : 0, rc.exceedsBudget ? 1 : 0,
        rc.status || 'pending_approval',
        rc.created_at || now, now
      ));
      summary.rateCmps++;
    });

    // ── APPROVALS ─────────────────────────────────────────────
    (state.APPROVALS || []).forEach(ap => {
      const approvedEntry = (ap.history || []).filter(h => h.action && h.action.includes('Approved')).pop();
      batch3.push(db.prepare(`
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
        ap.vehicle || '', ap.material || '', String(ap.weight || ''),
        ap.pickupDate || '', ap.dtype || '', ap.budget || 0,
        ap.isLowest ? 1 : 0, ap.exceedsBudget ? 1 : 0,
        ap.justification || '',
        ap.status || 'pending', ap.nextApprover || '',
        JSON.stringify(ap.history || []),
        ap.created_at || now,
        approvedEntry ? approvedEntry.user : '',
        approvedEntry ? approvedEntry.ts : ''
      ));
      summary.approvals++;
    });

    // ── ORDERS ────────────────────────────────────────────────
    (state.ORDERS || []).forEach(or => {
      batch3.push(db.prepare(`
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
        or.vehicle || '', or.material || '', String(or.weight || ''),
        or.pickupDate || '', or.dtype || '', or.rate || 0, or.transit || '',
        or.status || 'issued', or.created_at || now, now,
        or.inqId || '', null
      ));
      summary.orders++;
    });

    // Execute in FK-safe order: masters → inquiries → dependents
    let totalStmts = 0;
    if (batch1.length > 0) { await db.batch(batch1); totalStmts += batch1.length; }
    if (batch2.length > 0) { await db.batch(batch2); totalStmts += batch2.length; }
    if (batch3.length > 0) { await db.batch(batch3); totalStmts += batch3.length; }

    return json({ success: true, migrated: summary, message: `Migrated ${totalStmts} records into relational tables.` });
  } catch (e) {
    return json({ error: e.message, stack: e.stack }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Map frontend status values → DB CHECK constraint allowed values
// DB allows: draft, sent, received, compared, approved, ordered, cancelled
function mapInqStatus(s) {
  const m = { 'open': 'draft', 'rate_compared': 'compared' };
  return m[s] || s || 'draft';
}
