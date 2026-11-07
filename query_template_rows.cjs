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
        console.log("=== Querying templates in PAY_TBL_002 with Field_003 as template id ===");
        // The contract template key for 1102 in month 33/34 is '1487'.
        // Let's see if we can find any rows with Field_003 = '1487' or '1235' (which are the template IDs in PAY_TBL_013.Field_013).
        const rows = await executeQuery(`
            SELECT Field_001, Field_003, Field_004, Field_007, Field_013 
            FROM PAY_TBL_002 
            WHERE Field_003 IN ('1487', '1235')
        `);
        console.log(`Found ${rows.length} rows.`);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
