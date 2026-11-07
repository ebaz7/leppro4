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
        console.log("ACT_TBL_009 row for 5064 (Working):");
        const row5064 = await executeQuery("SELECT TOP 1 * FROM ACT_TBL_009 WHERE Field_004 = '5064' AND Field_003 = '4' AND Field_007 = '101'");
        console.log(JSON.stringify(row5064, null, 2));

        console.log("\nACT_TBL_009 row for 5070 (Not working):");
        const row5070 = await executeQuery("SELECT TOP 1 * FROM ACT_TBL_009 WHERE Field_004 = '5070' AND Field_003 = '4' AND Field_007 = '101'");
        console.log(JSON.stringify(row5070, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
