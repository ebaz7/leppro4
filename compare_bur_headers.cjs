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
        console.log("Querying working BUR_TBL_008 record (SayanHeaderId 186447):");
        const workingBur = await executeQuery("SELECT * FROM BUR_TBL_008 WHERE Field_001 = '186447'");
        console.log("Working BUR:", workingBur);

        console.log("Querying repaired BUR_TBL_008 record (SayanHeaderId 186446):");
        const repairedBur = await executeQuery("SELECT * FROM BUR_TBL_008 WHERE Field_001 = '186446'");
        console.log("Repaired BUR:", repairedBur);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
