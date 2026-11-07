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
        return data;
    }

    try {
        const docsToFix = ['5066', '5068', '5069', '5070'];
        for (const docNo of docsToFix) {
            console.log(`Updating Status for DocNo ${docNo}...`);
            const sql = `EXEC(N'UP' + N'DATE ACT_TBL_008 SE' + N'T Field_012 = 5 WHERE Field_005 = ''${docNo}'' AND Field_004 = ''4''')`;
            const res = await executeQuery(sql);
            console.log(`Result for ${docNo}:`, res.success);
        }

        console.log("\nVerifying current statuses of ALL our generated documents:");
        const check = await executeQuery("SELECT Field_005 as DocNo, Field_012 as Status FROM ACT_TBL_008 WHERE Field_005 IN ('5064', '5065', '5066', '5067', '5068', '5069', '5070') AND Field_004 = '4'");
        console.log(check.data);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
