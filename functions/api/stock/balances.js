export async function onRequestGet(context) {
  try {
    const db = context.env.DB;
    if (!db) return jsonResponse({ error: 'D1 not configured' }, 500);

    // Fetch all transactions to compute live balance dynamically
    const [openingRes, slipsRes, reclassRes] = await Promise.all([
      db.prepare('SELECT sku, qty FROM stock_opening').all(),
      db.prepare('SELECT from_sku, to_sku, qty FROM stock_slips').all(),
      db.prepare('SELECT from_sku, to_sku, qty FROM stock_reclass').all()
    ]);

    const stock = {};

    // 1. Process Opening Stock
    if (openingRes.results) {
      openingRes.results.forEach(row => {
        stock[row.sku] = (stock[row.sku] || 0) + row.qty;
      });
    }

    // 2. Process Slips
    if (slipsRes.results) {
      slipsRes.results.forEach(row => {
        stock[row.from_sku] = Math.max(0, (stock[row.from_sku] || 0) - row.qty);
        stock[row.to_sku] = (stock[row.to_sku] || 0) + row.qty;
      });
    }

    // 3. Process Reclassifications
    if (reclassRes.results) {
      reclassRes.results.forEach(row => {
        stock[row.from_sku] = Math.max(0, (stock[row.from_sku] || 0) - row.qty);
        stock[row.to_sku] = (stock[row.to_sku] || 0) + row.qty;
      });
    }

    // Format output as list of { sku, qty }
    const balances = Object.keys(stock).map(sku => ({
      sku,
      qty: stock[sku]
    }));

    return jsonResponse(balances);
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
