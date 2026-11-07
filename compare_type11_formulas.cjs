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
        console.log("=== Comparing Field_013 and Field_015 across Type 11 factors ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_004, Field_012, Field_013, Field_015
            FROM PAY_TBL_002
            WHERE Field_003 = '11' AND Field_013 IS NOT NULL AND Field_013 <> ''
        `);
        rows.forEach(r => {
            console.log(`\nFactor ID ${r.Field_001} (${r.Field_004}) | Sayan Code: ${r.Field_012}:`);
            console.log(`  Field_013: ${JSON.stringify(r.Field_013)}`);
            console.log(`  Field_015: ${JSON.stringify(r.Field_015)}`);
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
