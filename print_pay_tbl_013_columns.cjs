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
        console.log("=== Finding Ali Asghar Heidari in payroll ===");
        const rows = await executeQuery(`
            SELECT TOP 100 * 
            FROM PAY_TBL_013 
            WHERE Field_015 LIKE N'%حیدری%' OR Field_012 LIKE N'%حیدری%'
        `);
        console.log(`Found ${rows.length} rows.`);
        rows.forEach(r => {
            console.log(`ID: ${r.Field_001} | F005: ${r.Field_005} | F013: ${r.Field_013} | F014 (Month): ${r.Field_014}`);
            // Let's print the name info from Field_015
            const parts = r.Field_015.split('|');
            console.log(parts.slice(0, 4).join(' | '));
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
