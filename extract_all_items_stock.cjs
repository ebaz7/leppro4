const axios = require('axios');

async function q(sql) {
  const res = await axios.post('http://80.210.31.176:5000/api/external/v1/query', { query: sql }, { 
    headers: { 'Authorization': 'Bearer s_gate_live_vzje5nkn7q4u', 'Content-Type': 'application/json' },
    timeout: 10000
  });
  return res.data.data;
}

async function run() {
  console.log("Loading all item names and codes...");
  
  // 1. Get item names map from IND_TBL_021 + IND_TBL_002
  const nameRows = await q(`
    SELECT 
      RTRIM(LTRIM(t21.Field_004)) as ItemCode,
      RTRIM(LTRIM(t02.Field_003)) as ItemName,
      RTRIM(LTRIM(COALESCE(t02_parent.Field_003, t02.Field_003))) as GroupName
    FROM IND_TBL_021 t21
    INNER JOIN IND_TBL_002 t02 ON RTRIM(LTRIM(t21.Field_003)) = RTRIM(LTRIM(t02.Field_008))
    LEFT JOIN IND_TBL_002 t02_parent ON RTRIM(LTRIM(t02.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
  `);
  
  const nameMap = {};
  nameRows.forEach(r => {
    if (r.ItemCode && !nameMap[r.ItemCode]) {
      nameMap[r.ItemCode] = { name: r.ItemName, group: r.GroupName };
    }
  });

  // Also check IND_TBL_022
  const ind22 = await q(`SELECT RTRIM(LTRIM(Field_005)) as ItemCode, RTRIM(LTRIM(Field_004)) as ItemName FROM IND_TBL_022`);
  ind22.forEach(r => {
    if (r.ItemCode && !nameMap[r.ItemCode]) {
      nameMap[r.ItemCode] = { name: r.ItemName, group: '' };
    }
  });

  console.log("Total mapped items:", Object.keys(nameMap).length);

  // 2. Query stock for FY 3 (Last Year)
  const stockFY3 = await q(`
    SELECT 
      t11.Field_005 as ItemCode,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 ELSE 0 END) as InflowQty,
      SUM(CASE WHEN s06.Field_010 = -1 THEN t11.Field_006 ELSE 0 END) as OutflowQty,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 WHEN s06.Field_010 = -1 THEN -t11.Field_006 ELSE 0 END) as StockQty
    FROM STR_TBL_011 t11 WITH (NOLOCK)
    INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 AND t11.Field_003 = t10.Field_004 AND t11.Field_012 = t10.Field_018
    INNER JOIN STR_TBL_006 s06 WITH (NOLOCK) ON t10.Field_009 = s06.Field_003
    WHERE t10.Field_004 = '3'
      AND t10.Field_008 <= '2026-03-20T23:59:59.000Z'
      AND t10.Field_009 NOT IN ('19', '82')
      AND (t11.Field_005 LIKE '01%' OR t11.Field_005 LIKE '04%')
    GROUP BY t11.Field_005
  `);

  // 3. Query stock for FY 4 (Current Year)
  const stockFY4 = await q(`
    SELECT 
      t11.Field_005 as ItemCode,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 ELSE 0 END) as InflowQty,
      SUM(CASE WHEN s06.Field_010 = -1 THEN t11.Field_006 ELSE 0 END) as OutflowQty,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 WHEN s06.Field_010 = -1 THEN -t11.Field_006 ELSE 0 END) as StockQty
    FROM STR_TBL_011 t11 WITH (NOLOCK)
    INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 AND t11.Field_003 = t10.Field_004 AND t11.Field_012 = t10.Field_018
    INNER JOIN STR_TBL_006 s06 WITH (NOLOCK) ON t10.Field_009 = s06.Field_003
    WHERE t10.Field_004 = '4'
      AND t10.Field_008 <= '2026-08-22T23:59:59.000Z'
      AND t10.Field_009 NOT IN ('19', '82')
      AND (t11.Field_005 LIKE '01%' OR t11.Field_005 LIKE '04%')
    GROUP BY t11.Field_005
  `);

  console.log("FY3 items count:", stockFY3.length, "FY4 items count:", stockFY4.length);

  // Group summary
  const summary3 = {};
  stockFY3.forEach(r => {
    const grp = r.ItemCode.substring(0, 4);
    summary3[grp] = (summary3[grp] || 0) + r.StockQty;
  });

  const summary4 = {};
  stockFY4.forEach(r => {
    const grp = r.ItemCode.substring(0, 4);
    summary4[grp] = (summary4[grp] || 0) + r.StockQty;
  });

  console.log("Summary FY 3:", summary3);
  console.log("Summary FY 4:", summary4);
}

run().catch(e => console.error(e.response?.data || e.message));
