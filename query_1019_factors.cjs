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
        console.log("=== Querying calculated payroll factors for Employee 1019 ===");
        const rows = await executeQuery(`
            SELECT Field_001, Field_005, Field_013, Field_014, Field_015 
            FROM PAY_TBL_013 
            WHERE Field_005 = '1019'
            ORDER BY CAST(Field_014 AS INT)
        `);
        for (const r of rows) {
            console.log(`\nMonth ID (Field_014): ${r.Field_014} | Period ID (Field_013): ${r.Field_013}`);
            const parts = r.Field_015.split('|').map(x => x.trim());
            const interested = [
                'کارکرد ماه به روز',
                'ماه های کارکرد از ابتدای سال',
                'دستمزد روزانه',
                'مرخصی ماه به روز',
                'مرخصی استحقاقی',
                'مانده مرخصی از قبل',
                'مقدار باز خرید مرخصی به روز',
                'مانده مرخصی',
                'بازخرید مرخصی',
                'مازاد مرخصی',
                'سایر کسورات',
                'تعداد فرزند'
            ];
            for (const item of parts) {
                const title = item.split(':')[0].trim();
                if (interested.includes(title)) {
                    console.log(`  ${item}`);
                }
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
