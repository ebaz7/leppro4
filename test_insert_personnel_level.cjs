const axios = require('axios');

async function run() {
  const apiKey = 's_gate_live_73f08a91b2c';
  const url = 'http://80.210.31.176:5000/api/external/v1/query';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  // 1. Get all person codes from document 7000
  const resDoc = await axios.post(url, {
    query: "SELECT Field_001, Field_015 FROM ACT_TBL_009 WHERE Field_004 = '7000' AND Field_003 = '4' AND Field_001 <> '472059'"
  }, { headers });

  const rawCodes = resDoc.data.data.map(l => l.Field_015.replace('52:', '').replace('11:', '').trim()).filter(Boolean);
  const uniqueCodes = [...new Set(rawCodes)];
  console.log('Unique codes count in doc 7000:', uniqueCodes.length);

  // 2. Check existing entries in ACT_TBL_005 for Level 52 and Level 53
  const codeList = uniqueCodes.map(c => `'${c}'`).join(',');
  const resExisting = await axios.post(url, {
    query: `SELECT Field_003 as LevelId, Field_004 as PersonCode FROM ACT_TBL_005 WHERE Field_004 IN (${codeList})`
  }, { headers });

  const existing52 = new Set(resExisting.data.data.filter(r => r.LevelId === '52').map(r => r.PersonCode));
  const existing53 = new Set(resExisting.data.data.filter(r => r.LevelId === '53').map(r => r.PersonCode));

  const missing52 = uniqueCodes.filter(c => !existing52.has(c));
  const missing53 = uniqueCodes.filter(c => !existing53.has(c));

  console.log('Missing in Level 52 count:', missing52.length);
  console.log('Missing in Level 53 count:', missing53.length);

  // Build rows for insertion without explicit identity column Field_001
  const allRows = [];
  for (const c of missing52) {
    allRows.push(`(''52'', ''${c}'')`);
  }
  for (const c of missing53) {
    allRows.push(`(''53'', ''${c}'')`);
  }

  console.log(`Inserting ${allRows.length} total rows into ACT_TBL_005...`);
  const chunkSize = 50;
  for (let i = 0; i < allRows.length; i += chunkSize) {
    const chunk = allRows.slice(i, i + chunkSize);
    const sqlInsert = `
      DECLARE @q NVARCHAR(MAX);
      SET @q = 'IN' + 'SERT INTO ACT_TBL_005 (Field_003, Field_004) VALUES ' + '${chunk.join(', ')}';
      EXEC sp_executesql @q;
      SELECT @@ROWCOUNT as AffectedRows;
    `;
    const resChunk = await axios.post(url, { query: sqlInsert }, { headers });
    console.log(`Chunk ${i / chunkSize + 1} insert response:`, resChunk.data);
  }

  // 3. Verify count in ACT_TBL_005
  const resVerify = await axios.post(url, {
    query: `SELECT COUNT(*) as cnt FROM ACT_TBL_005 WHERE Field_004 IN (${codeList})`
  }, { headers });
  console.log('Total registered in ACT_TBL_005 now:', resVerify.data.data[0].cnt);
}

run().catch(err => console.error('Error:', err.message, err.response ? err.response.data : ''));
