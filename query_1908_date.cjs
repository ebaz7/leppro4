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
        console.log("Querying BUR_TBL_008 and ACT_TBL_008 for ArchiveCode 1908:");
        const bur = await executeQuery("SELECT Field_001, Field_005, Field_006, Field_008, Field_010, Field_025 FROM BUR_TBL_008 WHERE Field_005 = '1908'");
        console.log("BUR Record:", bur);

        const act = await executeQuery("SELECT Field_001, Field_005, Field_006, Field_008, Field_014 FROM ACT_TBL_008 WHERE Field_014 = 1200000000 AND Field_004 = '4'");
        console.log("ACT Record (potential match):", act);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
