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
        console.log("Summing Bed/Bes of 5062 (working):");
        const res5062 = await executeQuery("SELECT SUM(CAST(Field_009 as bigint)) as Bed, SUM(CAST(Field_010 as bigint)) as Bes FROM ACT_TBL_009 WHERE Field_003 = '4' AND Field_004 = '5062'");
        console.log("5062 Sum:", res5062);

        console.log("Summing Bed/Bes of 5064 (generated):");
        const res5064 = await executeQuery("SELECT SUM(CAST(Field_009 as bigint)) as Bed, SUM(CAST(Field_010 as bigint)) as Bes FROM ACT_TBL_009 WHERE Field_003 = '4' AND Field_004 = '5064'");
        console.log("5064 Sum:", res5064);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
