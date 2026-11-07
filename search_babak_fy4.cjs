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
        console.log("Querying ACT_TBL_009 for Babak Memari in Fiscal Year 4 (Field_003 = '4'):");
        const rows = await executeQuery("SELECT Field_001, Field_004, Field_007, Field_008, Field_009, Field_010, Field_011, Field_015 FROM ACT_TBL_009 WHERE Field_003 = '4' AND Field_015 LIKE '%2220%'");
        console.log(rows);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
