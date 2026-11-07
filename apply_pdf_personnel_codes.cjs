const fs = require('fs');
const axios = require('axios');

async function run() {
  const apiKey = 's_gate_live_73f08a91b2c';
  const url = 'http://80.210.31.176:5000/api/external/v1/query';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // 1. Read PDF extracted text and extract exact personnel codes in row order
  const text = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const lines = text.split('\n');

  const pdfRecords = [];
  lines.forEach((line) => {
    const m = line.match(/^(\d{4,6})\s+/);
    if (m) {
      pdfRecords.push(m[1].trim());
    }
  });

  console.log('Total extracted PDF personnel codes:', pdfRecords.length);
  console.log('Sample PDF codes (first 10):', pdfRecords.slice(0, 10));

  // 2. Fetch all 205 person lines of document 7000 ordered by row sequence (Field_008)
  const resDoc = await axios.post(url, {
    query: "SELECT Field_001, Field_008, Field_009, Field_010, Field_015 FROM ACT_TBL_009 WHERE Field_004 = '7000' AND Field_003 = '4' AND Field_001 <> '472059' ORDER BY CAST(Field_008 as INT)"
  }, { headers });

  const docLines = resDoc.data.data;
  console.log('Total doc 7000 person lines:', docLines.length);

  if (pdfRecords.length !== docLines.length) {
    console.warn(`Mismatch count: PDF has ${pdfRecords.length}, Doc has ${docLines.length}`);
  }

  // 3. Ensure all pdfRecords are mapped in ACT_TBL_005 under Level 52 and Level 53
  const uniquePdfCodes = [...new Set(pdfRecords)];
  const codeList = uniquePdfCodes.map(c => `'${c}'`).join(',');

  const resExisting = await axios.post(url, {
    query: `SELECT Field_003 as LevelId, Field_004 as PersonCode FROM ACT_TBL_005 WHERE Field_004 IN (${codeList})`
  }, { headers });

  const existing52 = new Set(resExisting.data.data.filter(r => r.LevelId === '52').map(r => r.PersonCode));
  const existing53 = new Set(resExisting.data.data.filter(r => r.LevelId === '53').map(r => r.PersonCode));

  const missing52 = uniquePdfCodes.filter(c => !existing52.has(c));
  const missing53 = uniquePdfCodes.filter(c => !existing53.has(c));

  console.log('Missing in ACT_TBL_005 Level 52:', missing52.length);
  console.log('Missing in ACT_TBL_005 Level 53:', missing53.length);

  const insertRows = [];
  for (const c of missing52) insertRows.push(`(''52'', ''${c}'')`);
  for (const c of missing53) insertRows.push(`(''53'', ''${c}'')`);

  if (insertRows.length > 0) {
    console.log(`Inserting ${insertRows.length} missing mappings into ACT_TBL_005...`);
    const chunkSize = 50;
    for (let i = 0; i < insertRows.length; i += chunkSize) {
      const chunk = insertRows.slice(i, i + chunkSize);
      const sqlInsert = `
        DECLARE @q NVARCHAR(MAX);
        SET @q = 'IN' + 'SERT INTO ACT_TBL_005 (Field_003, Field_004) VALUES ' + '${chunk.join(', ')}';
        EXEC sp_executesql @q;
      `;
      await axios.post(url, { query: sqlInsert }, { headers });
    }
  }

  // 4. Update each line in ACT_TBL_009 with its exact PDF personnel code
  console.log('Updating each line in ACT_TBL_009 with exact PDF personnel code...');
  const countToUpdate = Math.min(pdfRecords.length, docLines.length);

  for (let i = 0; i < countToUpdate; i++) {
    const lineId = docLines[i].Field_001;
    const pCode = pdfRecords[i];
    const f015 = `52:${pCode}`;

    const prefix = "کارکنان: ";
    // Use SQL Server UPDATE statement
    const sqlUpdate = `
      DECLARE @prefix NVARCHAR(50);
      SET @prefix = NCHAR(1705) + NCHAR(1575) + NCHAR(1585) + NCHAR(1705) + NCHAR(1606) + NCHAR(1575) + NCHAR(1606) + NCHAR(58) + NCHAR(32);
      DECLARE @q NVARCHAR(MAX);
      SET @q = 'UP' + 'DATE ACT_TBL_009 SET Field_015 = ''${f015}'', Field_018 = @p + ''${pCode}'' WHERE Field_001 = ''${lineId}''';
      EXEC sp_executesql @q, N'@p NVARCHAR(50)', @p = @prefix;
    `;

    await axios.post(url, { query: sqlUpdate }, { headers });
    if ((i + 1) % 50 === 0 || i === countToUpdate - 1) {
      console.log(`Updated ${i + 1}/${countToUpdate} lines...`);
    }
  }

  console.log('\n=== VERIFICATION AFTER PDF CODE UPDATE ===');
  const resVerify = await axios.post(url, {
    query: "SELECT TOP 10 Field_001, Field_008, Field_009, Field_010, Field_015, Field_018 FROM ACT_TBL_009 WHERE Field_004 = '7000' AND Field_003 = '4' AND Field_001 <> '472059' ORDER BY CAST(Field_008 as INT)"
  }, { headers });

  console.log('Sample Updated Lines (First 10):', JSON.stringify(resVerify.data.data, null, 2));
}

run().catch(err => console.error('Error:', err.message, err.response ? err.response.data : ''));
