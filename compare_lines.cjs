const axios = require('axios');

async function run() {
  const apiKey = 's_gate_live_73f08a91b2c';
  const url = 'http://80.210.31.176:5000/api/external/v1/query';
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  const resW = await axios.post(url, { query: "SELECT * FROM ACT_TBL_009 WHERE Field_001 = '61570'" }, { headers });
  const resD = await axios.post(url, { query: "SELECT * FROM ACT_TBL_009 WHERE Field_001 = '471854'" }, { headers });

  const w = resW.data.data[0];
  const d = resD.data.data[0];

  console.log('Field comparison:');
  Object.keys(w).forEach(k => {
    console.log(`${k}: working = [${w[k]}], doc7000 = [${d[k]}]`);
  });
}

run().catch(err => console.error(err));
