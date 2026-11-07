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
        console.log("=== Querying leave factors across all months for Employee 1102 ===");
        const rows = await executeQuery(`
            SELECT Field_014, Field_015 
            FROM PAY_TBL_013 
            WHERE Field_005 = '1102'
            ORDER BY CAST(Field_014 AS INT)
        `);
        rows.forEach(r => {
            const parts = r.Field_015.split('|').map(x => x.trim());
            let m_180 = 'N/A';
            let m_177 = 'N/A';
            let extra_deductions = 'N/A';
            let buyback_no_settle = 'N/A';
            parts.forEach(p => {
                if (p.startsWith('مانده مرخصی:')) m_180 = p.split(':')[1]?.trim();
                if (p.startsWith('مقدار باز خرید مرخصی به روز:')) m_177 = p.split(':')[1]?.trim();
                if (p.startsWith('سایر کسورات:')) extra_deductions = p.split(':')[1]?.trim();
                if (p.startsWith('باز خرید مرخصی بدون تسویه:')) buyback_no_settle = p.split(':')[1]?.trim();
            });
            console.log(`Month ${r.Field_014}: 180 (مانده مرخصی) = ${m_180} | 177 (مقدار بازخرید به روز) = ${m_177} | 313 (بدون تسویه) = ${buyback_no_settle} | سایر کسورات = ${extra_deductions}`);
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
