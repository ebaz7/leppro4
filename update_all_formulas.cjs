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
        console.log("=== Updating Formulas in PAY_TBL_002 for Contract Type 11 ===");

        // Factor 77 (Sayan Code 180) - مانده مرخصی
        const f77_formula = "LEAVEREMAINED[CALC[[CP155]*[CP35]+SUM[175,1]+[CP175]-(SUM[177,2]+[CP177])],[CP10],1]";
        console.log("Updating Factor 77...");
        await executeQuery(`
            UPDATE PAY_TBL_002
            SET Field_013 = N'${f77_formula}', Field_015 = N'${f77_formula}'
            WHERE Field_003 = '11' AND Field_001 = '77'
        `);

        // Factor 78 (Sayan Code 177) - مقدار باز خرید مرخصی به روز
        const f78_formula = "SETVALUE\nCASE WHEN N'[CP11]' = N'بله' OR N'[CP19]' = N'بله'\nTHEN\n'TODAYS[LEAVEREMAINED[CALC[[CP155]*[CP35]+SUM[175,1]+[CP175]-SUM[177,2]],[CP10]]]'\nELSE\n'CASE WHEN TODAYS[LEAVEREMAINED[CALC[[CP155]*[CP35]+SUM[175,1]+[CP175]-SUM[177,2]],[CP10]]] < 0 THEN TODAYS[LEAVEREMAINED[CALC[[CP155]*[CP35]+SUM[175,1]+[CP175]-SUM[177,2]],[CP10]]] ELSE 0 END'\nEND";
        console.log("Updating Factor 78...");
        await executeQuery(`
            UPDATE PAY_TBL_002
            SET Field_013 = N'${f78_formula.replace(/'/g, "''")}', Field_015 = N'${f78_formula.replace(/'/g, "''")}'
            WHERE Field_003 = '11' AND Field_001 = '78'
        `);

        // Factor 79 (Sayan Code 205) - بازخرید مرخصی
        const f79_formula = "SETVALUE CASE WHEN(([CP177]*[CP20]) < 0 )THEN(0)ELSE([CP177]*[CP20])END";
        console.log("Updating Factor 79...");
        await executeQuery(`
            UPDATE PAY_TBL_002
            SET Field_013 = N'${f79_formula}', Field_015 = N'${f79_formula}'
            WHERE Field_003 = '11' AND Field_001 = '79'
        `);

        // Factor 80 (Sayan Code 207) - مازاد مرخصی
        const f80_formula = "SETVALUE CASE WHEN(([CP177]*[CP20]) < 0 )THEN(([CP177]*[CP20])*(-1))ELSE(0)END";
        console.log("Updating Factor 80...");
        await executeQuery(`
            UPDATE PAY_TBL_002
            SET Field_013 = N'${f80_formula}', Field_015 = N'${f80_formula}'
            WHERE Field_003 = '11' AND Field_001 = '80'
        `);

        console.log("=== Formulas Updated Successfully ===");

        // Let's verify the updates
        const rows = await executeQuery(`
            SELECT Field_001, Field_004, Field_013, Field_015
            FROM PAY_TBL_002
            WHERE Field_003 = '11' AND Field_001 IN ('77', '78', '79', '80')
        `);
        console.log(JSON.stringify(rows, null, 2));

    } catch (e) {
        console.error("Error during updates:", e);
    }
}

main();
