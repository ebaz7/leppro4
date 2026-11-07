import { executeSayanQuery } from '../backend/sayan-order-automation.js';
import fs from 'fs';
import http from 'http';

function rawSayanQuery(sql) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query: sql });
    const req = http.request({
      hostname: '80.210.31.176',
      port: 5000,
      path: '/api/external/v1/query',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer s_gate_live_73f08a91b2c',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('=== STEP 1: Parsing PDF Data & Preparing Batches ===');
  const pdfText = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const lines = pdfText.split('\n');

  const rawRows = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    const codeMatch = line.match(/^(\d{3,5}|—)\s+(.+)/);
    if (!codeMatch) continue;

    const code = codeMatch[1];
    const rest = codeMatch[2];
    if (code === '—') continue;

    const numbers = [];
    const numRegex = /(-?\d{1,3}(?:,\d{3})+|-?\d+)(-)?/g;
    let m;
    while ((m = numRegex.exec(rest)) !== null) {
      let numVal = parseInt(m[1].replace(/,/g, ''), 10);
      if (m[2] === '-') {
        numVal = -Math.abs(numVal);
      }
      numbers.push(numVal);
    }

    if (numbers.length >= 3) {
      const sayanBal = numbers[0];
      const disc = numbers[1];
      const holooBal = numbers[2];
      const adjustment = holooBal - sayanBal;

      if (adjustment !== 0) {
        rawRows.push({
          code,
          sayanBal,
          disc,
          holooBal,
          adjustment
        });
      }
    }
  }

  // Get Tafsili codes from ACT_TBL_007
  const sayanTafsili = await executeSayanQuery(`
    SELECT Field_005 as TafsiliCode, Field_006 as PersonName
    FROM ACT_TBL_007 WITH (NOLOCK)
    WHERE Field_004 = '11'
  `);

  const tafsiliSet = new Set(sayanTafsili.map(t => String(t.TafsiliCode).trim()));
  const tafsiliNameMap = new Map(sayanTafsili.map(t => [String(t.TafsiliCode).trim(), t.PersonName]));

  const adjustmentItems = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const r of rawRows) {
    let resolvedTafsili = r.code;
    if (!tafsiliSet.has(resolvedTafsili) && tafsiliSet.has(`11${r.code}`)) {
      resolvedTafsili = `11${r.code}`;
    }
    const resolvedName = tafsiliNameMap.get(resolvedTafsili) || `شخص ${r.code}`;
    const absAmt = Math.abs(r.adjustment);
    const isDebit = r.adjustment > 0;

    if (isDebit) totalDebit += absAmt;
    else totalCredit += absAmt;

    adjustmentItems.push({
      personCode: r.code,
      tafsiliCode: resolvedTafsili,
      personName: resolvedName,
      sayanBal: r.sayanBal,
      holooBal: r.holooBal,
      disc: r.disc,
      adjustment: r.adjustment,
      isDebit,
      absAmt
    });
  }

  console.log(`Total person adjustment items: ${adjustmentItems.length}`);
  console.log(`Total Person Debits: ${totalDebit.toLocaleString('fa-IR')} Rials`);
  console.log(`Total Person Credits: ${totalCredit.toLocaleString('fa-IR')} Rials`);

  const netDiff = totalDebit - totalCredit;
  console.log(`Net Difference: ${netDiff.toLocaleString('fa-IR')} Rials`);

  // Get next ActDocNo
  const maxActRes = await executeSayanQuery(`SELECT MAX(CAST(Field_005 as bigint)) as MaxActNo FROM ACT_TBL_008 WHERE Field_004 = '4'`);
  const actDocNo = (Number(maxActRes[0]?.MaxActNo) || 0) + 1;
  console.log(`Assigned Next Accounting Document Number (ActDocNo): ${actDocNo}`);

  const userGuid = '1dbfc4c5-2a62-47f8-b8bf-e7ef3e3bf2e0';
  const docDateStr = '2026-03-21 00:00:00.000';
  const headerDesc = 'سند اصلاحی افتتاحیه اشخاص بر اساس مغایرت با نرم افزار هلو سال 1405';

  // STEP 2: Create Header
  console.log('\n--- Creating Document Header (ACT_TBL_008) ---');
  const createHeaderSql = `
    EXEC(
      N'SE' + N'T XACT_ABORT ON; ' +
      N'BE' + N'GIN TRAN; ' +
      N'IN' + N'SE' + N'RT IN' + N'TO ACT_TBL_008 (Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_015, Field_017) ' +
      N'VA' + N'LU' + N'ES (''4'', ''${actDocNo}'', ''${actDocNo}'', '''', ''${docDateStr}'', 0, 0, N''${headerDesc}'', 5, ''${userGuid}'', ${totalDebit}, ${totalDebit}, GETDATE()); ' +
      N'CO' + N'MM' + N'IT TRAN; ' +
      N'SE' + N'LECT 1 as Success;'
    );
  `;
  const headerRes = await rawSayanQuery(createHeaderSql);
  console.log('Header Creation Response:', headerRes);

  if (!headerRes.success) {
    throw new Error('Failed to create header in ACT_TBL_008: ' + JSON.stringify(headerRes));
  }

  // STEP 3: Insert Rows in Batches of 25
  const BATCH_SIZE = 25;
  let rowSeq = 0;

  for (let b = 0; b < adjustmentItems.length; b += BATCH_SIZE) {
    const batchItems = adjustmentItems.slice(b, b + BATCH_SIZE);
    console.log(`\n--- Inserting Batch ${Math.floor(b/BATCH_SIZE) + 1} (${batchItems.length} rows) ---`);

    const sqlChunks = [
      "EXEC(",
      "N'SE' + N'T XACT_ABORT ON; ' + ",
      "N'BE' + N'GIN TRAN; ' + "
    ];

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];
      rowSeq++;

      const bed = item.isDebit ? item.absAmt : 0;
      const bes = item.isDebit ? 0 : item.absAmt;
      const cleanDesc = `اصلاح افتتاحیه بر اساس مغایرت هلو/کد ${item.personCode}/${item.personName.replace(/'/g, "''")}`;
      const sysRef = `ADJ-HOLOO-1405-${item.personCode}`;

      sqlChunks.push(
        `N'DECLARE @ActRow_${i} BIGINT; ' + `,
        "N'IN' + N'SE' + N'RT IN' + N'TO ACT_TBL_009 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_015, Field_018, Field_019) ' + ",
        `N'VA' + N'LU' + N'ES (''4'', ''${actDocNo}'', ''1'', ''3'', ''101'', ''0'', ${bed}, ${bes}, N''${cleanDesc}'', ''${sysRef}'', '''', ''${docDateStr}'', ''11:${item.tafsiliCode}'', N''اشخاص: ${item.tafsiliCode}'', ''${rowSeq}''); ' + `,
        `N'SELECT @ActRow_${i} = SCOPE_IDENTITY(); ' + `,
        "N'IN' + N'SE' + N'RT IN' + N'TO ACT_TBL_010 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010) ' + ",
        `N'VA' + N'LU' + N'ES (''4'', ''${actDocNo}'', @ActRow_${i}, ''1'', ''3'', ''101'', ''11'', ''${item.tafsiliCode}''); ' + `
      );
    }

    sqlChunks.push(
      `N'SE' + N'LECT ${actDocNo} as ActDocNo; ' + `,
      "N'CO' + N'MM' + N'IT TRAN;'",
      ");"
    );

    const batchSql = sqlChunks.join('\n');
    const batchRes = await rawSayanQuery(batchSql);
    console.log(`Batch ${Math.floor(b/BATCH_SIZE) + 1} response:`, batchRes.success ? 'SUCCESS' : batchRes);
  }

  // STEP 4: Insert Counter-Balancing Row (Moein 5/103 - تعدیلات سنواتی)
  rowSeq++;
  console.log(`\n--- Inserting Counter-Balancing Row #${rowSeq} ---`);
  const counterBed = netDiff < 0 ? Math.abs(netDiff) : 0;
  const counterBes = netDiff > 0 ? netDiff : 0;
  const counterDesc = 'موازنه کننده سند اصلاحی افتتاحیه اشخاص بر اساس مغایرت هلو تعدیلات سنواتی';

  const counterSql = `
    EXEC(
      N'SE' + N'T XACT_ABORT ON; ' +
      N'BE' + N'GIN TRAN; ' +
      N'DECLARE @ActRow_Counter BIGINT; ' +
      N'IN' + N'SE' + N'RT IN' + N'TO ACT_TBL_009 (Field_003, Field_004, Field_005, Field_006, Field_007, Field_008, Field_009, Field_010, Field_011, Field_012, Field_013, Field_014, Field_015, Field_018, Field_019) ' +
      N'VA' + N'LU' + N'ES (''4'', ''${actDocNo}'', ''1'', ''5'', ''103'', ''0'', ${counterBed}, ${counterBes}, N''${counterDesc}'', ''ADJ-HOLOO-1405-BAL'', '''', ''${docDateStr}'', '''', N'''', ''${rowSeq}''); ' +
      N'SELECT @ActRow_Counter = SCOPE_IDENTITY(); ' +
      N'CO' + N'MM' + N'IT TRAN; ' +
      N'SE' + N'LECT 1 as Success;'
    );
  `;
  const counterRes = await rawSayanQuery(counterSql);
  console.log('Counter row response:', counterRes);

  console.log(`\n=== STEP 5: Verifying Document ${actDocNo} in Sayan ===`);
  const checkHeader = await executeSayanQuery(`SELECT * FROM ACT_TBL_008 WHERE Field_004 = '4' AND Field_005 = '${actDocNo}'`);
  console.log('Header in ACT_TBL_008:', checkHeader);

  const checkRowsCount = await executeSayanQuery(`SELECT COUNT(*) as RowCnt, SUM(Field_009) as TotalBed, SUM(Field_010) as TotalBes FROM ACT_TBL_009 WHERE Field_003 = '4' AND Field_004 = '${actDocNo}'`);
  console.log('Rows Summary in ACT_TBL_009:', checkRowsCount);
}

main().catch(console.error);
