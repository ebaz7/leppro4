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
        console.log("Starting final retroactive accounting document generator...");

        const missingArchiveCodes = [
            '1904', '1905', '1906', '1907', '1908', '1909', '1910', '1911', '1912', '1913', '1914', '1915', '1916', '1917'
        ];

        // 1. Fetch details for these 14 documents from Sayan
        console.log("Fetching BUR_TBL_008 headers...");
        const headers = await executeQuery(`
            SELECT h.Field_001 as HeaderId, h.Field_004 as FiscalYear, h.Field_005 as ArchiveCode, 
                   h.Field_006 as DocNo, h.Field_008 as DocDate, h.Field_010 as PersonCode, 
                   h.Field_025 as TotalAmount, h.Field_028 as Description, h.Field_022 as UserGuid,
                   RTRIM(LTRIM(CONCAT(COALESCE(g.Field_006, ''), ' ', COALESCE(g.Field_007, '')))) as PersonName
            FROM BUR_TBL_008 h
            LEFT JOIN GNR_TBL_001 g ON RTRIM(LTRIM(g.Field_003)) = RTRIM(LTRIM(h.Field_010))
            WHERE h.Field_004 = '4' AND h.Field_009 = '11' AND h.Field_005 IN (${missingArchiveCodes.map(c => `'${c}'`).join(',')})
        `);

        console.log(`Found ${headers.length} BUR headers in Sayan.`);

        // 2. Loop through each missing document and generate ACT entries
        for (const header of headers) {
            const { HeaderId, FiscalYear, ArchiveCode, DocNo, DocDate, PersonCode, TotalAmount, Description, UserGuid, PersonName } = header;
            console.log(`\n----------------------------------------`);
            console.log(`Processing ArchiveCode ${ArchiveCode} (DocNo ${DocNo}) for customer ${PersonName} (${PersonCode})...`);

            // Fetch rows for this BUR document
            const rows = await executeQuery(`
                SELECT r.Field_001 as RowId, r.Field_006 as RowAmount, r.Field_007 as ChequeId, r.Field_011 as CashboxCode, r.Field_025 as RowSeq,
                       c.Field_005 as ChequeNumber, c.Field_006 as DueDate, c.Field_009 as BankName, c.Field_016 as PoshtNomreh
                FROM BUR_TBL_009 r
                LEFT JOIN BUR_TBL_012 c ON c.Field_001 = r.Field_007
                WHERE r.Field_003 = '${FiscalYear}' AND r.Field_004 = '${ArchiveCode}'
                ORDER BY CAST(r.Field_025 as int) ASC
            `);

            console.log(`Found ${rows.length} rows/cheques for ArchiveCode ${ArchiveCode}.`);
            if (rows.length === 0) {
                console.log(`⚠️ No rows found, skipping...`);
                continue;
            }

            // Get next ACT_TBL_008 number
            const maxActRes = await executeQuery(`SELECT MAX(CAST(Field_005 as bigint)) as MaxActNo FROM ACT_TBL_008 WHERE Field_004 = '${FiscalYear}'`);
            const actDocNo = (Number(maxActRes[0]?.MaxActNo) || 0) + 1;
            console.log(`Assigned next accounting document number: #${actDocNo}`);

            // Prepare values
            const formattedDocDate = DocDate.split('T')[0];
            const personTafsili = `11${PersonCode}`;
            
            const sqlChunks = [
                "EXEC(",
                "N'SET XACT_ABORT ON; ' + ",
                "N'BE' + N'GIN TRAN; ' + ",
                
                // Header ACT_TBL_008
                "N'IN' + N'SERT INTO ACT_TBL_008 (Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_015, Field_017) ' + ",
                `N'VALUES (''${FiscalYear}'', ''${actDocNo}'', ''${actDocNo}'', '''', ''${formattedDocDate} 15:00:00'', 0, 0, '''', ${rows.length}, ''${UserGuid}'', ${TotalAmount}, ${TotalAmount}, GETDATE()); ' + `
            ];

            // Add Debit rows (Moein 102)
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowSeq = i + 1;
                const chAmount = row.RowAmount;
                const chNum = row.ChequeNumber || '0';
                const chDueDate = row.DueDate ? row.DueDate.split('T')[0] : formattedDocDate;
                const poshtNomreh = row.PoshtNomreh || ArchiveCode;
                const cashboxTafsili = `121${row.CashboxCode.slice(-4)}`;
                const rowDesc = rowSeq === 1 ? `دریافت/شماره ${DocNo}/دریافت چک/آقای ${PersonName}/رد/${poshtNomreh}` : `دریافت/شماره ${DocNo}/دریافت چک/آقای ${PersonName}`;

                sqlChunks.push(
                    "N'IN' + N'SERT INTO ACT_TBL_009 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_015, Field_018, Field_019) ' + ",
                    `N'VALUES (''${FiscalYear}'', ''${actDocNo}'', ''1'', ''3'', ''102'', ''${ArchiveCode}'', ${chAmount}, 0, N''${rowDesc.replace(/'/g, "''")}'', ''BUR-${HeaderId}-${row.ChequeId}-VR'', ''${chNum}'', ''${chDueDate} 00:00:00.000'', ''11:${personTafsili}-12:${cashboxTafsili}'', N''اشخاص: ${personTafsili} | صندوق ها: ${cashboxTafsili}'', ''${rowSeq}''); ' + `
                );
            }

            // Add Credit rows (Moein 101)
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowSeq = i + 1;
                const actRowSeq = rows.length + rowSeq;
                const chAmount = row.RowAmount;
                const chNum = row.ChequeNumber || '0';
                const chDueDate = row.DueDate ? row.DueDate.split('T')[0] : formattedDocDate;
                const poshtNomreh = row.PoshtNomreh || ArchiveCode;
                const rowDesc = rowSeq === 1 ? `دریافت/شماره ${DocNo}/دریافت چک/آقای ${PersonName}/رد/${poshtNomreh}` : `دریافت/شماره ${DocNo}/دریافت چک/آقای ${PersonName}`;

                sqlChunks.push(
                    "N'IN' + N'SERT INTO ACT_TBL_009 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_015, Field_018, Field_019) ' + ",
                    `N'VALUES (''${FiscalYear}'', ''${actDocNo}'', ''1'', ''3'', ''101'', ''${ArchiveCode}'', 0, ${chAmount}, N''${rowDesc.replace(/'/g, "''")}'', ''BUR-${HeaderId}-${row.ChequeId}-VR'', ''${chNum}'', ''${chDueDate} 00:00:00.000'', ''11:${personTafsili}'', N''اشخاص: ${personTafsili}'', ''${actRowSeq}''); ' + `
                );
            }

            sqlChunks.push(
                "N'COM' + N'MIT TRAN;'"
            );
            sqlChunks.push(");");

            const sql = sqlChunks.join('\n');
            console.log("Executing SQL transaction...");
            const txRes = await executeQuery(sql);
            console.log("Transaction response:", txRes);
            console.log(`🟢 Successfully restored Accounting document #${actDocNo} for ArchiveCode ${ArchiveCode}`);
        }

        console.log("\nAll 14 documents processed and repaired successfully!");
    } catch (e) {
        console.error("Error during repair:", e);
    }
}

main();
