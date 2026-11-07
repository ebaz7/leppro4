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
        console.log("=== Querying PAY_TBL_013 for Field_014 = '21449' ===");
        const rows = await executeQuery(`
            SELECT * FROM PAY_TBL_013 
            WHERE Field_014 = '21449'
        `);
        console.log(`Found ${rows.length} rows.`);
        for (const r of rows) {
            console.log(`ID: ${r.Field_001} | Employee: ${r.Field_005} | Field_013: ${r.Field_013} | Field_014: ${r.Field_014}`);
            const parts = r.Field_015.split('|').map(x => x.trim());
            console.log("  " + parts[0]);
            const leaveRemain = parts.find(p => p.startsWith('مانده مرخصی:'));
            if (leaveRemain) console.log("  " + leaveRemain);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
