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
        console.log("=== Querying Month 33 and 34 Leave Metrics ===");
        const rows = await executeQuery(`
            SELECT Field_005 AS EmpId, Field_014 AS MonthId, Field_015
            FROM PAY_TBL_013
            WHERE Field_005 IN ('1019', '1102') AND Field_014 IN ('33', '34')
        `);
        rows.forEach(r => {
            const parts = r.Field_015.split('|');
            console.log(`\nEmployee ${r.EmpId} Month ${r.MonthId}:`);
            parts.forEach(p => {
                if (p.includes('مرخصی') || p.includes('سایر کسورات') || p.includes('باز خرید مرخصی بدون تسویه')) {
                    console.log(`  ${p.trim()}`);
                }
            });
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
