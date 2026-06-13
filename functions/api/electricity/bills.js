// Electricity PGVCL Bills API — CRUD for electricity_bills table

export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const { results } = await db.prepare(
      'SELECT * FROM electricity_bills ORDER BY bill_date DESC'
    ).all();

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
    if (!body.bill_date) return jsonResponse({ error: 'Bill date is required' }, 400);
    if (body.kwh_curr === undefined || body.kwh_curr === null) {
      return jsonResponse({ error: 'kWh current reading is required' }, 400);
    }

    const id = body.id || ('eb-' + Date.now() + Math.random().toString(36).substr(2, 4));
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO electricity_bills (
        id, bill_date, due_date, paid_date, adv_payment,
        kwh_curr, kwh_diff, kwh_mf, kvarh_curr, kvarh_diff, kvarh_mf,
        pf, night_units,
        demand_chg, energy_chg, fuel_sur,
        pf_rebate, night_rebate, ehv_rebate,
        tou_chg, gt_chg, total_consp, elec_duty, meter_chg, tcs,
        net_payable, total_payable, remarks, pdf_data,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      body.bill_date,
      body.due_date || null,
      body.paid_date || null,
      body.adv_payment || null,
      body.kwh_curr,
      body.kwh_diff || null,
      body.kwh_mf || null,
      body.kvarh_curr || null,
      body.kvarh_diff || null,
      body.kvarh_mf || null,
      body.pf || null,
      body.night_units || null,
      body.demand_chg || null,
      body.energy_chg || null,
      body.fuel_sur || null,
      body.pf_rebate || null,
      body.night_rebate || null,
      body.ehv_rebate || null,
      body.tou_chg || null,
      body.gt_chg || null,
      body.total_consp || null,
      body.elec_duty || null,
      body.meter_chg || null,
      body.tcs || null,
      body.net_payable || null,
      body.total_payable || null,
      body.remarks || '',
      body.pdf_data || null,
      body.created_by || '',
      now,
      now
    ).run();

    return jsonResponse({ success: true, id });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestPut(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    if (!body.id) return jsonResponse({ error: 'Bill ID is required' }, 400);

    const now = new Date().toISOString();

    await db.prepare(
      `UPDATE electricity_bills SET
        bill_date = ?, due_date = ?, paid_date = ?, adv_payment = ?,
        kwh_curr = ?, kwh_diff = ?, kwh_mf = ?,
        kvarh_curr = ?, kvarh_diff = ?, kvarh_mf = ?,
        pf = ?, night_units = ?,
        demand_chg = ?, energy_chg = ?, fuel_sur = ?,
        pf_rebate = ?, night_rebate = ?, ehv_rebate = ?,
        tou_chg = ?, gt_chg = ?, total_consp = ?,
        elec_duty = ?, meter_chg = ?, tcs = ?,
        net_payable = ?, total_payable = ?, remarks = ?, pdf_data = ?,
        updated_at = ?
       WHERE id = ?`
    ).bind(
      body.bill_date,
      body.due_date || null,
      body.paid_date || null,
      body.adv_payment || null,
      body.kwh_curr,
      body.kwh_diff || null,
      body.kwh_mf || null,
      body.kvarh_curr || null,
      body.kvarh_diff || null,
      body.kvarh_mf || null,
      body.pf || null,
      body.night_units || null,
      body.demand_chg || null,
      body.energy_chg || null,
      body.fuel_sur || null,
      body.pf_rebate || null,
      body.night_rebate || null,
      body.ehv_rebate || null,
      body.tou_chg || null,
      body.gt_chg || null,
      body.total_consp || null,
      body.elec_duty || null,
      body.meter_chg || null,
      body.tcs || null,
      body.net_payable || null,
      body.total_payable || null,
      body.remarks || '',
      body.pdf_data || null,
      now,
      body.id
    ).run();

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const url = new URL(context.request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID query param is required' }, 400);

    await db.prepare('DELETE FROM electricity_bills WHERE id = ?').bind(id).run();

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
