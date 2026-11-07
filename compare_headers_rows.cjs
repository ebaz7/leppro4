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
        console.log("=== COMPARING HEADERS (ACT_TBL_008) ===");
        const hWorking = await executeQuery("SELECT * FROM ACT_TBL_008 WHERE Field_005 = '4997' AND Field_004 = '4'");
        const hNotWorking = await executeQuery("SELECT * FROM ACT_TBL_008 WHERE Field_005 = '5070' AND Field_004 = '4'");

        console.log("Working Header (4997):", hWorking[0]);
        console.log("Not Working Header (5070):", hNotWorking[0]);

        console.log("\n=== COMPARING ROWS (ACT_TBL_009) ===");
        const rWorking = await executeQuery("SELECT * FROM ACT_TBL_009 WHERE Field_004 = '4997' AND Field_003 = '4'");
        const rNotWorking = await executeQuery("SELECT * FROM ACT_TBL_009 WHERE Field_004 = '5070' AND Field_003 = '4'");

        console.log("Working Rows (4997):", rWorking);
        console.log("Not Working Rows (5070):", rNotWorking);

    } catch (e) {
        console.error("Error:", e);
    }
}

main();
