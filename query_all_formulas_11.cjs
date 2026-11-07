const fs = require('fs');

async function main() {
    const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
    const settings = db.settings || {};
    const serverSayanBaseUrl = settings.sayanApiUrl || 'http://80.210.31.176:5000/api/external/v1';
    const serverSayanApiKey = settings.sayanApiKey || 's_gate_live_vgr182bwtpoa';
    const finalUrl = `${serverSayanBaseUrl.replace(/\/$/, '')}/query`;

    async function executeQuery(sql) {
        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${serverSayanApiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: sql })
        });
        const data = await response.json();
        return data.data || [];
    }

    try {
        console.log("=== Querying all formulas for Contract Type 11 (لپان بافت) ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_004, Field_007, Field_013 
            FROM PAY_TBL_002 
            WHERE Field_003 = '11'
            ORDER BY CAST(Field_007 AS INT)
        `);
        console.log(`Found ${rows.length} rows.`);
        rows.forEach(r => {
            console.log(`Code/Order: ${r.Field_007} | Title: ${r.Field_004} | Formula: ${r.Field_013}`);
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
