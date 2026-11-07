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
        console.log("Querying working BUR_TBL_009 rows (ArchiveCode 1919):");
        const workingRows = await executeQuery("SELECT * FROM BUR_TBL_009 WHERE Field_004 = '1919'");
        console.log("Working rows count:", workingRows.length);
        console.log("Working first row:", workingRows[0]);

        console.log("Querying repaired BUR_TBL_009 rows (ArchiveCode 1918):");
        const repairedRows = await executeQuery("SELECT * FROM BUR_TBL_009 WHERE Field_004 = '1918'");
        console.log("Repaired rows count:", repairedRows.length);
        console.log("Repaired first row:", repairedRows[0]);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
