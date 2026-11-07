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
        console.log("=== Querying PAY_TBL_009 inputs for Employee 1102 in Month 33 and 34 ===");
        const rows = await executeQuery(`
            SELECT i.Field_007 AS MonthId, i.Field_005 AS FactorId, f.Field_004 AS FactorName, i.Field_006 AS InputValue
            FROM PAY_TBL_009 i
            LEFT JOIN PAY_TBL_002 f ON i.Field_005 = f.Field_001 AND f.Field_003 = '11'
            WHERE i.Field_004 = '1102' AND i.Field_007 IN ('33', '34')
            ORDER BY CAST(i.Field_007 AS INT), CAST(i.Field_005 AS INT)
        `);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
