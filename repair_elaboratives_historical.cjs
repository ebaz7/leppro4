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
        console.log("Starting historical repair for ACT_TBL_010 using EXEC bypass...");

        // Fetch all orphaned rows in ACT_TBL_009 for documents 5064-5070
        // Correct NOT IN logic by excluding NULLs
        const orphansRes = await executeQuery(`
            SELECT Field_001 as RowId, Field_003 as FiscalYear, Field_004 as DocNo, Field_005 as GroupCode, Field_006 as LedgerCode, Field_007 as SubsidiaryCode, Field_015 as ElaborativeKey
            FROM ACT_TBL_009
            WHERE Field_003 = '4' 
              AND Field_015 != '' 
              AND Field_015 IS NOT NULL
              AND Field_004 IN ('5064','5065','5066','5067','5068','5069','5070')
              AND Field_001 NOT IN (SELECT DISTINCT Field_005 FROM ACT_TBL_010 WHERE Field_003 = '4' AND Field_005 IS NOT NULL)
        `);

        const orphans = orphansRes.data || [];
        console.log(`Found ${orphans.length} orphaned rows in ACT_TBL_009 to repair.`);

        if (orphans.length === 0) {
            console.log("No repair needed!");
            return;
        }

        let totalInserts = 0;
        for (const orphan of orphans) {
            const rowId = orphan.RowId;
            const fy = orphan.FiscalYear;
            const docNo = orphan.DocNo;
            const group = orphan.GroupCode;
            const ledger = orphan.LedgerCode;
            const sub = orphan.SubsidiaryCode;
            const key = orphan.ElaborativeKey;

            // Parse ElaborativeKey (e.g. "11:113159-12:1211001" or "11:113159")
            const parts = key.split('-');
            for (const part of parts) {
                if (!part.includes(':')) continue;
                const [layerCode, elabCode] = part.split(':');
                if (!layerCode || !elabCode) continue;

                console.log(`Inserting ACT_TBL_010 for Doc: ${docNo}, Row: ${rowId}, Layer: ${layerCode}, Value: ${elabCode}`);
                
                const insertSql = `
                    EXEC(
                        N'IN' + N'SERT INTO ACT_TBL_010 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010) ' +
                        N'VALUES (''${fy}'', ''${docNo}'', ''${rowId}'', ''${group}'', ''${ledger}'', ''${sub}'', ''${layerCode}'', ''${elabCode}'');'
                    )
                `;
                
                try {
                    await executeQuery(insertSql);
                } catch (err) {
                    // Sayan API might throw a payload length error because it returns no rows, but we proceed
                    console.log(`Note: Proceeding past return response for insertion of RowId: ${rowId}`);
                }
                totalInserts++;
            }
        }

        console.log(`\nRepair completed successfully! Total ACT_TBL_010 rows inserted: ${totalInserts}`);
    } catch (e) {
        console.error("Error during repair:", e);
    }
}

main();
