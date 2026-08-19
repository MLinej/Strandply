// One-time data migration — fixes bad readings in the database
// DELETE this file after running once.

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    const body = await context.request.json();
    if (body.key !== 'strandply-migrate-2026') return jsonResponse({ error: 'Invalid key' }, 403);

    const fixes = [];
    const { results: readings } = await db.prepare('SELECT * FROM electricity_readings ORDER BY date, time').all();

    // 1. Fix PF values: 998→0.998, 992→0.992, -0.758→0.758 etc.
    for (const r of readings) {
      const updates = [];
      const params = [];

      if (r.pf !== null && r.pf !== undefined) {
        let pf = r.pf;
        if (pf < 0) { pf = Math.abs(pf); updates.push('pf = ?'); params.push(pf); }
        else if (pf > 100 && pf <= 1000) { pf = pf / 1000; updates.push('pf = ?'); params.push(pf); }
        else if (pf > 10 && pf <= 100) { pf = pf / 100; updates.push('pf = ?'); params.push(pf); }
        else if (pf > 1 && pf <= 10) { pf = pf / 10; updates.push('pf = ?'); params.push(pf); }
      }

      if (r.kwh !== null && r.kwh !== undefined && r.kwh > 0 && r.kwh < 100) {
        const corrected = r.kwh * 1000000;
        updates.push('kwh = ?');
        params.push(corrected);
      }

      if (updates.length > 0) {
        params.push(r.id);
        await db.prepare('UPDATE electricity_readings SET ' + updates.join(', ') + ' WHERE id = ?').bind(...params).run();
        fixes.push({ id: r.id, date: r.date, time: r.time, changes: updates.join('; ') });
      }
    }

    // 2. Delete duplicate readings (same date+time+shift — keep newest)
    const seen = {};
    const dupes = [];
    for (const r of readings) {
      const key = r.date + '|' + r.time + '|' + r.shift;
      if (!seen[key]) { seen[key] = r; }
      else {
        // Keep the one with the larger kwh (the correct absolute reading)
        const current = seen[key];
        if (r.kwh > current.kwh) {
          dupes.push(current.id);
          seen[key] = r;
        } else {
          dupes.push(r.id);
        }
      }
    }

    for (const id of dupes) {
      await db.prepare('DELETE FROM electricity_readings WHERE id = ?').bind(id).run();
      fixes.push({ id: id, action: 'deleted (duplicate)' });
    }

    return jsonResponse({ success: true, fixes: fixes.length, details: fixes });
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
