// GET  /api/crm/state — Load full CRM state from relational tables
// POST /api/crm/state — Sync all CRM entities to D1
//
// The response JSON shape exactly matches the `spl_crm_*` localStorage keys
// used by the frontend, so the HTML requires minimal changes.

const COLLECTIONS = [
  'leads', 'customers', 'followups', 'opportunities', 'quotations',
  'ordersWon', 'ordersLost', 'tasks', 'campaigns',
  'products', 'salespersons', 'sources', 'lostReasons', 'audit'
];

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return json({ error: 'D1 not configured' }, 500);

    const [
      leadRows, custRows, fuRows, oppRows, qtRows,
      wonRows, lostRows, taskRows, campRows,
      prodRows, spRows, srcRows, lrRows, auditRows, seqRows
    ] = await Promise.all([
      db.prepare('SELECT * FROM crm_leads ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_customers ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_followups ORDER BY date DESC').all(),
      db.prepare('SELECT * FROM crm_opportunities ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_quotations ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_orders_won ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_orders_lost ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_tasks ORDER BY due_date ASC').all(),
      db.prepare('SELECT * FROM crm_campaigns ORDER BY created_at ASC').all(),
      db.prepare('SELECT * FROM crm_products ORDER BY name ASC').all(),
      db.prepare('SELECT * FROM crm_salespersons ORDER BY name ASC').all(),
      db.prepare('SELECT * FROM crm_sources ORDER BY name ASC').all(),
      db.prepare('SELECT * FROM crm_lost_reasons ORDER BY name ASC').all(),
      db.prepare('SELECT * FROM crm_audit ORDER BY created_at DESC LIMIT 500').all(),
      db.prepare("SELECT key, value FROM crm_state WHERE key = '_seq'").all(),
    ]);

    // Parse seq counter
    const seqRaw = (seqRows.results || [])[0];
    let seq = {};
    try { seq = seqRaw ? JSON.parse(seqRaw.value) : {}; } catch (e) {}

    return json({
      leads:        (leadRows.results || []).map(mapLead),
      customers:    (custRows.results || []).map(mapCustomer),
      followups:    (fuRows.results || []).map(mapFollowup),
      opportunities:(oppRows.results || []).map(mapOpportunity),
      quotations:   (qtRows.results || []).map(mapQuotation),
      ordersWon:    (wonRows.results || []).map(mapOrderWon),
      ordersLost:   (lostRows.results || []).map(mapOrderLost),
      tasks:        (taskRows.results || []).map(mapTask),
      campaigns:    (campRows.results || []).map(mapCampaign),
      products:     (prodRows.results || []).map(mapProduct),
      salespersons: (spRows.results || []).map(mapSalesperson),
      sources:      (srcRows.results || []).map(r => ({ id: r.id, name: r.name })),
      lostReasons:  (lrRows.results || []).map(r => ({ id: r.id, name: r.name })),
      audit:        (auditRows.results || []).map(mapAudit),
      _seq: seq,
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

    // ── LEADS ─────────────────────────────────────────────────────────
    (body.leads || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_leads
        (id,company_name,contact_person,mobile,alt_mobile,whatsapp,email,city,state,
         address,pincode,customer_type,source,salesperson,priority,status,product,quantity,
         est_value,remarks,campaign,next_follow_up_date,last_contact_date,date_added,
         customer_id,data_quality,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.companyName||'', r.contactPerson||'', r.mobile||'', r.altMobile||'',
      r.whatsapp||'', r.email||'', r.city||'', r.state||'', r.address||'', r.pincode||'',
      r.customerType||'', r.source||'', r.salesperson||'', r.priority||'Cold', r.status||'New Lead',
      r.product||'', String(r.quantity||''), Number(r.estValue)||0, r.remarks||'', r.campaign||'',
      r.nextFollowUpDate||'', r.lastContactDate||'', r.dateAdded||now.slice(0,10),
      r.customerId||'', r.dataQuality||'Good', r.dateAdded||now, now
    )));

    // ── CUSTOMERS ─────────────────────────────────────────────────────
    (body.customers || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_customers
        (id,company_name,contact_person,mobile,alt_mobile,whatsapp,email,city,state,
         address,pincode,customer_type,source,salesperson,priority,gst,credit_days,
         credit_limit,annual_target,next_follow_up,last_contact_date,first_contact_date,
         created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.companyName||'', r.contactPerson||'', r.mobile||'', r.altMobile||'',
      r.whatsapp||'', r.email||'', r.city||'', r.state||'', r.address||'', r.pincode||'',
      r.customerType||'', r.source||'', r.salesperson||'', r.priority||'Cold', r.gst||'',
      Number(r.creditDays)||0, Number(r.creditLimit)||0, Number(r.annualTarget)||0,
      r.nextFollowUp||'', r.lastContactDate||'', r.firstContactDate||'',
      r.createdAt||now, now
    )));

    // ── FOLLOWUPS ─────────────────────────────────────────────────────
    (body.followups || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_followups
        (id,customer_id,contact_person,salesperson,date,type,status,discussion,
         outcome,next_follow_up_date,products_discussed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.customerId||'', r.contactPerson||'', r.salesperson||'',
      r.date||now.slice(0,10), r.type||'Call', r.status||'Pending',
      r.discussion||'', r.outcome||'', r.nextFollowUpDate||'', r.productsDiscussed||'',
      r.createdAt||now, now
    )));

    // ── OPPORTUNITIES ─────────────────────────────────────────────────
    (body.opportunities || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_opportunities
        (id,customer_id,product,quantity,est_value,stage,salesperson,
         expected_close,priority,remarks,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.customerId||'', r.product||'', String(r.quantity||''),
      Number(r.estValue)||0, r.stage||'Qualification', r.salesperson||'',
      r.expectedClose||'', r.priority||'Warm', r.remarks||'',
      r.createdAt||now, now
    )));

    // ── QUOTATIONS ────────────────────────────────────────────────────
    (body.quotations || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_quotations
        (id,customer_id,date,valid_till,salesperson,status,items_json,
         total,discount,final_total,remarks,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.customerId||'', r.date||'', r.validTill||'', r.salesperson||'',
      r.status||'Draft', JSON.stringify(r.items||[]),
      Number(r.total)||0, Number(r.discount)||0, Number(r.finalTotal)||0, r.remarks||'',
      r.createdAt||now, now
    )));

    // ── ORDERS WON ────────────────────────────────────────────────────
    (body.ordersWon || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_orders_won
        (id,opportunity_id,customer_id,order_date,product,quantity,order_value,
         payment_terms,delivery_date,remarks,salesperson,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.opportunityId||'', r.customerId||'', r.orderDate||now.slice(0,10),
      r.product||'', String(r.quantity||''), Number(r.orderValue)||0,
      r.paymentTerms||'', r.deliveryDate||'', r.remarks||'', r.salesperson||'', r.createdAt||now
    )));

    // ── ORDERS LOST ───────────────────────────────────────────────────
    (body.ordersLost || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_orders_lost
        (id,opportunity_id,customer_id,product,quantity,est_value,lost_reason,
         competitor,remarks,reactivation_date,salesperson,lost_date,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.opportunityId||'', r.customerId||'', r.product||'',
      String(r.quantity||''), Number(r.estValue)||0, r.lostReason||'',
      r.competitor||'', r.remarks||'', r.reactivationDate||'', r.salesperson||'',
      r.lostDate||now.slice(0,10), r.createdAt||now
    )));

    // ── TASKS ─────────────────────────────────────────────────────────
    (body.tasks || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_tasks
        (id,customer_id,type,due_date,priority,status,assigned_to,remarks,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.customerId||'', r.type||'', r.dueDate||'', r.priority||'Warm',
      r.status||'Pending', r.assignedTo||'', r.remarks||'', r.createdAt||now, now
    )));

    // ── CAMPAIGNS ─────────────────────────────────────────────────────
    (body.campaigns || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_campaigns
        (id,name,type,start_date,end_date,target_segment,budget,status,
         leads_generated,remarks,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.name||'', r.type||'', r.startDate||'', r.endDate||'',
      r.targetSegment||'', Number(r.budget)||0, r.status||'Draft',
      Number(r.leadsGenerated)||0, r.remarks||'', r.createdAt||now, now
    )));

    // ── PRODUCTS (master) ─────────────────────────────────────────────
    (body.products || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_products
        (id,name,thickness,size,grade,application,rate,moq,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.name||'', r.thickness||'', r.size||'', r.grade||'',
      r.application||'', r.rate||'', r.moq||'', r.status||'Active', now
    )));

    // ── SALESPERSONS (master) ─────────────────────────────────────────
    (body.salespersons || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR REPLACE INTO crm_salespersons
        (id,name,mobile,email,territory,designation,active,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.name||'', r.mobile||'', r.email||'',
      r.territory||'', r.designation||'', r.active||'Active', now
    )));

    // ── SOURCES (master) ──────────────────────────────────────────────
    (body.sources || []).forEach(r => stmts.push(db.prepare(
      'INSERT OR REPLACE INTO crm_sources (id,name,created_at) VALUES (?,?,?)'
    ).bind(r.id, r.name||'', now)));

    // ── LOST REASONS (master) ─────────────────────────────────────────
    (body.lostReasons || []).forEach(r => stmts.push(db.prepare(
      'INSERT OR REPLACE INTO crm_lost_reasons (id,name,created_at) VALUES (?,?,?)'
    ).bind(r.id, r.name||'', now)));

    // ── AUDIT ─────────────────────────────────────────────────────────
    (body.audit || []).forEach(r => stmts.push(db.prepare(`
      INSERT OR IGNORE INTO crm_audit
        (id,user_name,date,time,action,entity,entity_id,old_value,new_value,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      r.id, r.user||'', r.date||'', r.time||'', r.action||'',
      r.entity||'', r.entityId||'', r.oldValue||'', r.newValue||'', now
    )));

    // ── SEQ COUNTERS ──────────────────────────────────────────────────
    if (body._seq) {
      stmts.push(db.prepare(
        'INSERT OR REPLACE INTO crm_state (key, value, updated_at) VALUES (?,?,?)'
      ).bind('_seq', JSON.stringify(body._seq), now));
    }

    if (stmts.length > 0) await db.batch(stmts);
    return json({ success: true, count: stmts.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ── Row → frontend object mappers ─────────────────────────────────────
function mapLead(r) {
  return {
    id: r.id, companyName: r.company_name, contactPerson: r.contact_person,
    mobile: r.mobile, altMobile: r.alt_mobile, whatsapp: r.whatsapp, email: r.email,
    city: r.city, state: r.state, address: r.address, pincode: r.pincode,
    customerType: r.customer_type, source: r.source, salesperson: r.salesperson,
    priority: r.priority, status: r.status, product: r.product, quantity: r.quantity,
    estValue: r.est_value, remarks: r.remarks, campaign: r.campaign,
    nextFollowUpDate: r.next_follow_up_date, lastContactDate: r.last_contact_date,
    dateAdded: r.date_added, customerId: r.customer_id, dataQuality: r.data_quality,
  };
}
function mapCustomer(r) {
  return {
    id: r.id, companyName: r.company_name, contactPerson: r.contact_person,
    mobile: r.mobile, altMobile: r.alt_mobile, whatsapp: r.whatsapp, email: r.email,
    city: r.city, state: r.state, address: r.address, pincode: r.pincode,
    customerType: r.customer_type, source: r.source, salesperson: r.salesperson,
    priority: r.priority, gst: r.gst, creditDays: r.credit_days,
    creditLimit: r.credit_limit, annualTarget: r.annual_target,
    nextFollowUp: r.next_follow_up, lastContactDate: r.last_contact_date,
    firstContactDate: r.first_contact_date, createdAt: r.created_at,
  };
}
function mapFollowup(r) {
  return {
    id: r.id, customerId: r.customer_id, contactPerson: r.contact_person,
    salesperson: r.salesperson, date: r.date, type: r.type, status: r.status,
    discussion: r.discussion, outcome: r.outcome, nextFollowUpDate: r.next_follow_up_date,
    productsDiscussed: r.products_discussed, createdAt: r.created_at,
  };
}
function mapOpportunity(r) {
  return {
    id: r.id, customerId: r.customer_id, product: r.product, quantity: r.quantity,
    estValue: r.est_value, stage: r.stage, salesperson: r.salesperson,
    expectedClose: r.expected_close, priority: r.priority, remarks: r.remarks,
    createdAt: r.created_at,
  };
}
function mapQuotation(r) {
  return {
    id: r.id, customerId: r.customer_id, date: r.date, validTill: r.valid_till,
    salesperson: r.salesperson, status: r.status,
    items: safeJson(r.items_json, []),
    total: r.total, discount: r.discount, finalTotal: r.final_total,
    remarks: r.remarks, createdAt: r.created_at,
  };
}
function mapOrderWon(r) {
  return {
    id: r.id, opportunityId: r.opportunity_id, customerId: r.customer_id,
    orderDate: r.order_date, product: r.product, quantity: r.quantity,
    orderValue: r.order_value, paymentTerms: r.payment_terms,
    deliveryDate: r.delivery_date, remarks: r.remarks, salesperson: r.salesperson,
    createdAt: r.created_at,
  };
}
function mapOrderLost(r) {
  return {
    id: r.id, opportunityId: r.opportunity_id, customerId: r.customer_id,
    product: r.product, quantity: r.quantity, estValue: r.est_value,
    lostReason: r.lost_reason, competitor: r.competitor, remarks: r.remarks,
    reactivationDate: r.reactivation_date, salesperson: r.salesperson,
    lostDate: r.lost_date, createdAt: r.created_at,
  };
}
function mapTask(r) {
  return {
    id: r.id, customerId: r.customer_id, type: r.type, dueDate: r.due_date,
    priority: r.priority, status: r.status, assignedTo: r.assigned_to,
    remarks: r.remarks, createdAt: r.created_at,
  };
}
function mapCampaign(r) {
  return {
    id: r.id, name: r.name, type: r.type, startDate: r.start_date,
    endDate: r.end_date, targetSegment: r.target_segment, budget: r.budget,
    status: r.status, leadsGenerated: r.leads_generated, remarks: r.remarks,
    createdAt: r.created_at,
  };
}
function mapProduct(r) {
  return {
    id: r.id, name: r.name, thickness: r.thickness, size: r.size,
    grade: r.grade, application: r.application, rate: r.rate, moq: r.moq, status: r.status,
  };
}
function mapSalesperson(r) {
  return {
    id: r.id, name: r.name, mobile: r.mobile, email: r.email,
    territory: r.territory, designation: r.designation, active: r.active,
  };
}
function mapAudit(r) {
  return {
    id: r.id, user: r.user_name, date: r.date, time: r.time, action: r.action,
    entity: r.entity, entityId: r.entity_id, oldValue: r.old_value, newValue: r.new_value,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
function safeJson(str, fallback) {
  try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; }
}
