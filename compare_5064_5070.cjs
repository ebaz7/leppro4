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
        console.log("Comparing 5064 (working) and 5070 (not showing):");
        const act8_5064 = await executeQuery("SELECT * FROM ACT_TBL_008 WHERE Field_005 = '5064'");
        const act8_5070 = await executeQuery("SELECT * FROM ACT_TBL_008 WHERE Field_005 = '5070' AND Field_004 = '4'");
        console.log("ACT8 5064:", act8_5064);
        console.log("ACT8 5070:", act8_5070);

        const act9_5064 = await executeQuery("SELECT * FROM ACT_TBL_009 WHERE Field_004 = '5064'");
        const act9_5070 = await executeQuery("SELECT * FROM ACT_TBL_009 WHERE Field_004 = '5070' AND Field_003 = '4'");
        console.log("ACT9 5064 length:", act9_5064.length, "first row:", act9_5064[0]);
        console.log("ACT9 5070 length:", act9_5070.length, "first row:", act9_5070[0]);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
