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
        console.log("=== Querying PAY_TBL_013 for 1102 ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_005, Field_013, Field_014, Field_015 
            FROM PAY_TBL_013 
            WHERE Field_005 = '1102'
            ORDER BY CAST(Field_014 AS INT)
        `);
        for (const r of rows) {
            console.log(`Month ID: ${r.Field_014} | Key: ${r.Field_013}`);
            const parts = r.Field_015.split('|').map(x => x.trim());
            console.log("  " + parts[0]); // Name
            const leaveRemain = parts.find(p => p.startsWith('مانده مرخصی:'));
            const buyback = parts.find(p => p.startsWith('بازخرید مرخصی:'));
            const mazad = parts.find(p => p.startsWith('مازاد مرخصی:'));
            const r_buyback = parts.find(p => p.startsWith('باز خرید مرخصی بدون تسویه:'));
            if (leaveRemain) console.log("  " + leaveRemain);
            if (buyback) console.log("  " + buyback);
            if (mazad) console.log("  " + mazad);
            if (r_buyback) console.log("  " + r_buyback);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
