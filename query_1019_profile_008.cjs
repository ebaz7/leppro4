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
        console.log("=== Checking profile of 1019 in PAY_TBL_008 ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_004, Field_007, Field_008, Field_025 
            FROM PAY_TBL_008 
            WHERE Field_007 = '1019'
        `);
        for (const r of rows) {
            console.log(`Contract ID: ${r.Field_001} | Period/Month: ${r.Field_004} | Details: ${r.Field_025}`);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
