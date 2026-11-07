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
        console.log("=== Querying templates in PAY_TBL_008 to find what 1487 and 1235 are ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_004, Field_007, Field_008, Field_013, Field_014, Field_015, Field_016, Field_017 
            FROM PAY_TBL_008 
            WHERE Field_001 IN ('33', '34') OR Field_007 IN ('1487', '1235')
        `);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
