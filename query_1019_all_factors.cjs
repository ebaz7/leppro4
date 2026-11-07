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
        console.log("=== All Factors for Employee 1019 in Month 33 ===");
        const rows33 = await executeQuery(`
            SELECT Field_015 FROM PAY_TBL_013 WHERE Field_005 = '1019' AND Field_014 = '33'
        `);
        if (rows33.length > 0) {
            rows33[0].Field_015.split('|').forEach(p => console.log(p.trim()));
        }

        console.log("\n=== All Factors for Employee 1019 in Month 34 ===");
        const rows34 = await executeQuery(`
            SELECT Field_015 FROM PAY_TBL_013 WHERE Field_005 = '1019' AND Field_014 = '34'
        `);
        if (rows34.length > 0) {
            rows34[0].Field_015.split('|').forEach(p => console.log(p.trim()));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
