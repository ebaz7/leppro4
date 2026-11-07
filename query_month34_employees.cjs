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
        console.log("=== Listing first 20 employees in Month 34 ===");
        const rows = await executeQuery(`
            SELECT DISTINCT Field_005 AS EmpId, Field_006 AS EmpName
            FROM PAY_TBL_013
            WHERE Field_014 = '34'
            ORDER BY Field_005
        `);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
