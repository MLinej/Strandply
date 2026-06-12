const fs = require('fs');
const path = require('path');

const prodPath = path.join(__dirname, 'Strandply_Production_Module.html');
const stockPath = path.join(__dirname, 'Strandply-StockManagement-v5.html');
const destPath = path.join(__dirname, 'production', 'index.html');

let prodHtml = fs.readFileSync(prodPath, 'utf8');
let stockHtml = fs.readFileSync(stockPath, 'utf8');

// 1. Extract JS from StockManagement
const stockJsMatch = stockHtml.match(/<script>([\s\S]*?)<\/script>/);
if (!stockJsMatch) {
    console.error("Could not find script in stock management");
    process.exit(1);
}
let stockJs = stockJsMatch[1];

// Remove DOMContentLoaded/init IIFE from stockJs to avoid double loading or rendering conflicts
stockJs = stockJs.replace(/\(async\s+function\(\)\s*\{\s*await\s+fetchStockData\(\);\s*render\(\);\s*\}\)\(\);/g, '');

// Clean up any existing appended sections in the template to avoid duplicate appends when running multiple times
const separatorIndex = prodHtml.indexOf('/* ================================================================');
if (separatorIndex !== -1) {
    prodHtml = prodHtml.substring(0, separatorIndex);
    // Ensure the HTML has the script, body, and html closing tags if we sliced them off
    if (!prodHtml.trim().endsWith('</script>\n</body>\n</html>') && !prodHtml.trim().endsWith('</script></body></html>')) {
        // Strip trailing whitespace/chars to be clean
        prodHtml = prodHtml.replace(/<\/script>[\s\S]*$/, '') + '\n</script>\n</body>\n</html>';
    }
}

const scriptEndIndex = prodHtml.lastIndexOf('</script>');

// 2. We need to inject our API wrapper functions into the prodHtml before the stock JS
const apiWrapperJs = `
/* ════════════════════════════════════════════════════════════════
   PRODUCTION MODULE API INTEGRATION
   ════════════════════════════════════════════════════════════════ */
// Override Initialization
document.addEventListener('DOMContentLoaded', async function() {
    // Fetch initial data
    try {
        const [chip, hp, ps, nilgiri] = await Promise.all([
            fetchAPI('/api/production/chipping'),
            fetchAPI('/api/production/hotpress'),
            fetchAPI('/api/production/summaries'),
            fetchAPI('/api/production/nilgiri-lots')
        ]);
        if(chip) CHIP_REPORTS = chip;
        if(hp) HP_REPORTS = hp;
        if(ps) PS_REPORTS = ps;
        if(nilgiri && nilgiri.length) {
            PURCHASE_NILGIRI = nilgiri;
        }
        
        // Fetch Stock Data
        await fetchStockData();
        
    } catch(e) {
        console.error("Failed to load initial data", e);
    }
    
    // Call the original init functions
    renderDashboard();
    render(); // Initial render for stock
    
    var d=document.getElementById('ps-date');
    if(d)d.addEventListener('change',psCalc);
    var pl=document.getElementById('ps-pressLoad');
    var pu=document.getElementById('ps-pressUnload');
    if(pl)pl.addEventListener('change',psCalc);
    if(pu)pu.addEventListener('change',psCalc);
    _updateUserPill();
});
`;

// Remove original DOMContentLoaded from prodHtml (only if it exists)
prodHtml = prodHtml.replace(/document\.addEventListener\('DOMContentLoaded'[\s\S]*?\}\);/g, '');

// Override saveChipReport if it's the unrefactored version
prodHtml = prodHtml.replace(/CHIP_REPORTS\.unshift\(report\);/, `
    fetchAPI('/api/production/chipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
    }).then(res => {
        if(res) {
            CHIP_REPORTS.unshift(report);
            closeModal('modal-chip');
            renderDashboard();
            toast('Report '+report.id+' saved', 'success');
        }
    });
    return; // Stop sync execution
`);

// Override saveHPReport if it's the unrefactored version
prodHtml = prodHtml.replace(/HP_REPORTS\.unshift\(report\);/, `
    fetchAPI('/api/production/hotpress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
    }).then(res => {
        if(res) {
            HP_REPORTS.unshift(report);
            closeModal('modal-hp');
            renderHPKPIs();renderHPList();
            toast('Report '+report.id+' saved', 'success');
            setTimeout(function(){viewHPReport(report.id);},400);
        }
    });
    return;
`);

// Override saveProdSummary if it's the unrefactored version
prodHtml = prodHtml.replace(/PS_REPORTS\.unshift\(entry\);/, `
    fetchAPI('/api/production/summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
    }).then(res => {
        if(res) {
            PS_REPORTS.unshift(entry);
            closeModal('modal-ps');
            renderPSList();renderPSKPIs();
            toast('Production Summary '+entry.id+' saved', 'success');
        }
    });
    return;
`);

// Assemble final HTML
const finalHtml = prodHtml.substring(0, scriptEndIndex) 
    + "\n\n/* ================================================================\n   STOCK MANAGEMENT JS\n================================================================ */\n" 
    + stockJs 
    + "\n\n/* ================================================================\n   API OVERRIDES\n================================================================ */\n" 
    + apiWrapperJs 
    + "\n</script>\n</body>\n</html>";

// Write back to both the source template and production destination
fs.writeFileSync(prodPath, finalHtml, 'utf8');
fs.writeFileSync(destPath, finalHtml, 'utf8');
console.log("Successfully refactored Strandply_Production_Module.html and synced with production/index.html");
