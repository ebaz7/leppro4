const axios = require('axios');
const fs = require('fs');

async function q(sql) {
  const res = await axios.post('http://80.210.31.176:5000/api/external/v1/query', { query: sql }, { 
    headers: { 'Authorization': 'Bearer s_gate_live_vzje5nkn7q4u', 'Content-Type': 'application/json' },
    timeout: 15000
  });
  return res.data.data;
}

async function buildBenchmark() {
  console.log("Building high-fidelity ground truth benchmark from real Sayan database...");

  // 1. Get Item Names and Groups Map
  const nameRows = await q(`
    SELECT 
      RTRIM(LTRIM(t21.Field_004)) as ItemCode,
      RTRIM(LTRIM(t02.Field_003)) as ItemName,
      RTRIM(LTRIM(COALESCE(t02_parent.Field_003, t02.Field_003))) as GroupName,
      RTRIM(LTRIM(t02.Field_003)) as SubGroupName
    FROM IND_TBL_021 t21
    INNER JOIN IND_TBL_002 t02 ON RTRIM(LTRIM(t21.Field_003)) = RTRIM(LTRIM(t02.Field_008))
    LEFT JOIN IND_TBL_002 t02_parent ON RTRIM(LTRIM(t02.Field_009)) = RTRIM(LTRIM(t02_parent.Field_008))
  `);

  const nameMap = {};
  nameRows.forEach(r => {
    if (r.ItemCode && !nameMap[r.ItemCode]) {
      nameMap[r.ItemCode] = { name: r.ItemName, group: r.GroupName, subGroup: r.SubGroupName };
    }
  });

  const ind22 = await q(`SELECT RTRIM(LTRIM(Field_005)) as ItemCode, RTRIM(LTRIM(Field_004)) as ItemName FROM IND_TBL_022`);
  ind22.forEach(r => {
    if (r.ItemCode && !nameMap[r.ItemCode]) {
      nameMap[r.ItemCode] = { name: r.ItemName, group: '', subGroup: '' };
    }
  });

  // Default Persian Group names mapping for standard groups
  const standardGroupNames = {
    '0101': 'چیپس',
    '0102': 'POY',
    '0103': 'dty یا پلی استر',
    '0104': 'لاستیک',
    '0105': 'لاکرا',
    '0106': 'پلی استر اسپان',
    '0107': 'مستر بچ',
    '0108': 'نایلون',
    '0401': 'اسپاندکس (کاور)',
    '0402': 'کش',
    '0403': 'اسپاندکس جوشی ( ساپورت )',
    '0405': 'پلی استر شوایتر',
    '0407': 'نایلون',
    '0408': 'نخ ملت',
    '0409': 'الیاف',
    '0410': 'FDY'
  };

  // 2. Query Last Year (FY 3, up to 2026-03-20)
  const rowsFY3 = await q(`
    SELECT 
      t11.Field_005 as ItemCode,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 ELSE 0 END) as InflowQty,
      SUM(CASE WHEN s06.Field_010 = -1 THEN t11.Field_006 ELSE 0 END) as OutflowQty,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 WHEN s06.Field_010 = -1 THEN -t11.Field_006 ELSE 0 END) as StockQty,
      SUM(CASE 
        WHEN t11.Field_005 LIKE '04%' AND t11.Field_031 LIKE N'%تعداد کارتن:%' THEN
          TRY_CAST(
            LTRIM(RTRIM(SUBSTRING(
              t11.Field_031, 
              CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12, 
              CHARINDEX(N'|', t11.Field_031 + N'|', CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12) - (CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12)
            ))) as float
          ) * s06.Field_010
        ELSE 0 
      END) as CartonsQty
    FROM STR_TBL_011 t11 WITH (NOLOCK)
    INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 AND t11.Field_003 = t10.Field_004 AND t11.Field_012 = t10.Field_018
    INNER JOIN STR_TBL_006 s06 WITH (NOLOCK) ON t10.Field_009 = s06.Field_003
    WHERE t11.Field_003 = '3'
      AND t10.Field_008 <= '2026-03-20T23:59:59.000Z'
      AND t10.Field_009 NOT IN ('19', '82')
      AND (t11.Field_005 LIKE '01%' OR t11.Field_005 LIKE '04%')
    GROUP BY t11.Field_005
  `);

  // 3. Query Current Year (FY 4, up to today)
  const rowsFY4 = await q(`
    SELECT 
      t11.Field_005 as ItemCode,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 ELSE 0 END) as InflowQty,
      SUM(CASE WHEN s06.Field_010 = -1 THEN t11.Field_006 ELSE 0 END) as OutflowQty,
      SUM(CASE WHEN s06.Field_010 = 1 THEN t11.Field_006 WHEN s06.Field_010 = -1 THEN -t11.Field_006 ELSE 0 END) as StockQty,
      SUM(CASE 
        WHEN t11.Field_005 LIKE '04%' AND t11.Field_031 LIKE N'%تعداد کارتن:%' THEN
          TRY_CAST(
            LTRIM(RTRIM(SUBSTRING(
              t11.Field_031, 
              CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12, 
              CHARINDEX(N'|', t11.Field_031 + N'|', CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12) - (CHARINDEX(N'تعداد کارتن:', t11.Field_031) + 12)
            ))) as float
          ) * s06.Field_010
        ELSE 0 
      END) as CartonsQty
    FROM STR_TBL_011 t11 WITH (NOLOCK)
    INNER JOIN STR_TBL_010 t10 WITH (NOLOCK) ON t11.Field_004 = t10.Field_005 AND t11.Field_003 = t10.Field_004 AND t11.Field_012 = t10.Field_018
    INNER JOIN STR_TBL_006 s06 WITH (NOLOCK) ON t10.Field_009 = s06.Field_003
    WHERE t11.Field_003 = '4'
      AND t10.Field_008 <= '2026-10-04T23:59:59.000Z'
      AND t10.Field_009 NOT IN ('19', '82')
      AND (t11.Field_005 LIKE '01%' OR t11.Field_005 LIKE '04%')
    GROUP BY t11.Field_005
  `);

  console.log(`Extracted ${rowsFY3.length} FY3 items and ${rowsFY4.length} FY4 items.`);

  const formatItem = (r) => {
    const code = String(r.ItemCode || '').trim();
    const grpCode = code.substring(0, 4);
    const mapped = nameMap[code] || {};
    const defaultGrp = standardGroupNames[grpCode] || `گروه ${grpCode}`;
    return {
      itemCode: code,
      itemName: mapped.name || `${defaultGrp} - کد ${code.substring(4) || code}`,
      groupName: standardGroupNames[grpCode] || mapped.group || defaultGrp,
      subGroupName: mapped.subGroup || '',
      inflowQty: parseFloat((r.InflowQty || 0).toFixed(3)),
      outflowQty: parseFloat((r.OutflowQty || 0).toFixed(3)),
      stockQty: parseFloat((r.StockQty || 0).toFixed(3)),
      cartonsQty: Math.round(r.CartonsQty || 0)
    };
  };

  const lastYearStock = rowsFY3.map(formatItem);
  const currentStock = rowsFY4.map(formatItem);

  const fileContent = `// Ground-truth benchmark dataset extracted directly from Sayan ERP database
// Reflects authentic item codes, accurate names, genuine weights (kg) and carton counts.

export function generateBenchmarkData() {
    const lastYearStock = ${JSON.stringify(lastYearStock, null, 4)};
    const currentStock = ${JSON.stringify(currentStock, null, 4)};
    return { lastYearStock, currentStock };
}

export default {
    generateBenchmarkData
};
`;

  fs.writeFileSync('backend/sayanBenchmarkData.js', fileContent, 'utf8');
  console.log("Successfully wrote backend/sayanBenchmarkData.js with real items!");
}

buildBenchmark().catch(e => console.error("Error:", e.message));
