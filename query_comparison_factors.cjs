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
        console.log("=== Comparing Leave Factors for 1019 and 1102 in Month 33 ===");
        const rows33 = await executeQuery(`
            SELECT Field_005 AS EmpId, Field_015
            FROM PAY_TBL_013
            WHERE Field_005 IN ('1019', '1102') AND Field_014 = '33'
        `);
        rows33.forEach(r => {
            console.log(`\nEmployee ${r.EmpId} Month 33:`);
            r.Field_015.split('|').forEach(p => {
                if (p.includes('مرخصی') || p.includes('کسور') || p.includes('بازخرید')) {
                    console.log(`  ${p.trim()}`);
                }
            });
        });

        console.log("\n=== Comparing Leave Factors for 1019 and 1102 in Month 34 ===");
        const rows34 = await executeQuery(`
            SELECT Field_005 AS EmpId, Field_015
            FROM PAY_TBL_013
            WHERE Field_005 IN ('1019', '1102') AND Field_014 = '34'
        `);
        rows34.forEach(r => {
            console.log(`\nEmployee ${r.EmpId} Month 34:`);
            r.Field_015.split('|').forEach(p => {
                if (p.includes('مرخصی') || p.includes('کسور') || p.includes('بازخرید')) {
                    console.log(`  ${p.trim()}`);
                }
            });
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
