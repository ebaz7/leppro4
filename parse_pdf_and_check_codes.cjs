const fs = require('fs');
const axios = require('axios');

async function run() {
  const text = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const lines = text.split('\n');

  const pdfRecords = [];
  lines.forEach((line, idx) => {
    // Match code at beginning of line (e.g. 1003, 1006, 1007, etc.)
    const m = line.match(/^(\d{4,6})\s+(.+)/);
    if (m) {
      pdfRecords.push({
        pdfCode: m[1],
        rest: m[2]
      });
    }
  });

  console.log('Parsed PDF records count:', pdfRecords.length);
  console.log('First 10 PDF records:', pdfRecords.slice(0, 10));

  // Query Sayan database for document 7000 lines
  const apiKey = 's_gate_live_73f08a91b2c';
  const url = 'http://80.210.31.176:5000/api/external/v1/query';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  const resDoc = await axios.post(url, {
    query: "SELECT Field_001, Field_008, Field_009, Field_010, Field_015 FROM ACT_TBL_009 WHERE Field_004 = '7000' AND Field_003 = '4' AND Field_001 <> '472059' ORDER BY CAST(Field_008 as INT)"
  }, { headers });

  console.log('Doc 7000 lines count:', resDoc.data.data.length);
  console.log('Sample Doc 7000 lines (first 10):', resDoc.data.data.slice(0, 10));
}

run().catch(err => console.error(err));
