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
        console.log("=== Querying non-zero factors for Employee 1102 in Month 33 ===");
        const rows = await executeQuery(`
            SELECT Field_015 
            FROM PAY_TBL_013 
            WHERE Field_005 = '1102' AND Field_014 = '33'
        `);
        if (rows.length > 0) {
            const parts = rows[0].Field_015.split('|').map(x => x.trim());
            parts.forEach(p => {
                const val = p.split(':')[1]?.trim();
                if (val && val !== '0' && val !== '0:0:0' && val !== 'خیر' && val !== '') {
                    console.log(p);
                }
            });
        } else {
            console.log("No data found for Employee 1102 in Month 33.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
