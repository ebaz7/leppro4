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
        console.log("=== Querying PAY_TBL_013 for Month 33 & 34 to see 1102 data ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_005, Field_013, Field_014, Field_015 
            FROM PAY_TBL_013 
            WHERE Field_005 = '1102' AND Field_014 IN ('33', '34')
        `);
        for (const r of rows) {
            console.log(`\nMonth Period: ${r.Field_014} | Contract Template: ${r.Field_013}`);
            const parts = r.Field_015.split('|').map(x => x.trim());
            parts.forEach(p => {
                if (p.includes('مرخصی') || p.includes('کارکرد') || p.includes('بازخرید')) {
                    console.log("  ", p);
                }
            });
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
