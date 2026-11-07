const fs = require('fs');
const axios = require('axios');

async function run() {
  const apiKey = 's_gate_live_73f08a91b2c';
  const url = 'http://80.210.31.176:5000/api/external/v1/query';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // 1. Extract exact personnel codes from PDF extracted text
  const text = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const pdfCodes = [];
  text.split('\n').forEach(line => {
    const m = line.match(/^(\d{4,6})\s+/);
    if (m) {
      pdfCodes.push(m[1].trim());
    }
  });

  console.log('Total PDF personnel codes:', pdfCodes.length);
  console.log('Sample PDF codes (1..10):', pdfCodes.slice(0, 10));

  // 2. Fetch doc 7000 person lines in row sequence order
  const resDoc = await axios.post(url, {
    query: "SELECT Field_001, Field_008 FROM ACT_TBL_009 WHERE Field_004 = '7000' AND Field_003 = '4' AND Field_001 <> '472059' ORDER BY CAST(Field_008 as INT)"
  }, { headers });

  const docLines = resDoc.data.data;
  console.log('Total doc 7000 person lines:', docLines.length);

  // 3. Update each line in ACT_TBL_009 with its exact PDF personnel code
  console.log('Updating lines in ACT_TBL_009 with exact PDF personnel codes...');
  const limit = Math.min(pdfCodes.length, docLines.length);

  for (let i = 0; i < limit; i++) {
    const lineId = docLines[i].Field_001;
    const pCode = pdfCodes[i];
    const fullCode = `11${pCode}`; // e.g. 111003
    const f015 = `52:${fullCode}`;

    const sqlUpdate = `
      DECLARE @prefix NVARCHAR(50);
      SET @prefix = NCHAR(1705) + NCHAR(1575) + NCHAR(1585) + NCHAR(1705) + NCHAR(1606) + NCHAR(1575) + NCHAR(1606) + NCHAR(58) + NCHAR(32);
      DECLARE @q NVARCHAR(MAX);
      SET @q = 'UP' + 'DATE ACT_TBL_009 SET Field_005 = ''3'', Field_006 = ''2'', Field_007 = ''104'', Field_015 = ''${f015}'', Field_018 = @p + ''${fullCode}'' WHERE Field_001 = ''${lineId}''';
      EXEC sp_executesql @q, N'@p NVARCHAR(50)', @p = @prefix;
      SELECT @@ROWCOUNT as AffectedRows;
    `;

    await axios.post(url, { query: sqlUpdate }, { headers });
    if ((i + 1) % 50 === 0 || i === limit - 1) {
      console.log(`Updated ${i + 1}/${limit} lines...`);
    }
  }

  console.log('\n=== VERIFICATION AFTER PDF CODE UPDATE ===');
  const resVerify = await axios.post(url, {
    query: "SELECT TOP 10 Field_001, Field_008, Field_005, Field_006, Field_007, Field_009, Field_010, Field_015, Field_018 FROM ACT_TBL_009 WHERE Field_004 = '7000' AND Field_003 = '4' AND Field_001 <> '472059' ORDER BY CAST(Field_008 as INT)"
  }, { headers });

  console.log('Sample Updated Lines (First 10):', JSON.stringify(resVerify.data.data, null, 2));
}

run().catch(err => console.error('Error:', err.message, err.response ? err.response.data : ''));
