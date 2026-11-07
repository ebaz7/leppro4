import { executeSayanQuery } from '../backend/sayan-order-automation.js';

async function main() {
  const rows = await executeSayanQuery(`
    SELECT 
      r.Field_001 as RowId,
      r.Field_003 as FiscalYear,
      r.Field_004 as ArchiveCode,
      r.Field_006 as Amount,
      r.Field_007 as ChequeId,
      h.Field_006 as DocNo,
      h.Field_008 as DocDate,
      h.Field_010 as PersonCode,
      c.Field_005 as ChequeNumber,
      c.Field_006 as DueDate,
      c.Field_009 as BankName,
      c.Field_011 as InNameOf,
      c.Field_013 as SayadOrAmount,
      c.Field_016 as PoshtNomreh,
      g.Field_006 as FirstName,
      g.Field_007 as LastName
    FROM BUR_TBL_009 r
    INNER JOIN BUR_TBL_008 h ON r.Field_003 = h.Field_004 AND r.Field_004 = h.Field_005
    LEFT JOIN BUR_TBL_012 c ON c.Field_001 = r.Field_007
    LEFT JOIN GNR_TBL_001 g ON RTRIM(LTRIM(g.Field_003)) = RTRIM(LTRIM(h.Field_010))
    WHERE r.Field_003 = '4' AND h.Field_009 = '11'
    ORDER BY CAST(h.Field_006 as bigint) ASC
  `);

  console.log('Total receipt cheque rows in Year 4:', rows.length);

  // 1. Khan Mohammadi details
  const khanRows = rows.filter(r => 
    r.PersonCode === '1521' || 
    (r.LastName && r.LastName.includes('خان محمدی')) ||
    (r.InNameOf && r.InNameOf.includes('خان محمدی'))
  );
  console.log('Khan Mohammadi rows in Year 4:', khanRows.length);

  const khanByCheque = {};
  for (const r of khanRows) {
    const chNo = (r.ChequeNumber || '').trim();
    if (!khanByCheque[chNo]) khanByCheque[chNo] = [];
    khanByCheque[chNo].push(r);
  }

  console.log('\n=== KHAN MOHAMMADI CHEQUES ===');
  for (const [chNo, list] of Object.entries(khanByCheque)) {
    if (list.length > 1) {
      console.log(`DUPLICATE KHAN MOHAMMADI CHEQUE [${chNo}]:`);
      for (const item of list) {
        console.log(`  DocNo: ${item.DocNo}, Arch: ${item.ArchiveCode}, ChequeId: ${item.ChequeId}, Amount: ${item.Amount}, DueDate: ${item.DueDate?.slice(0,10)}, Bank: ${item.BankName}`);
      }
    }
  }

  // Also check if any cheque of Khan Mohammadi matches by amount and due date with different number or whitespace
  const khanByAmtDate = {};
  for (const r of khanRows) {
    const d = r.DueDate ? String(r.DueDate).slice(0, 10) : '';
    const key = `${r.Amount}_${d}_${r.BankName}`;
    if (!khanByAmtDate[key]) khanByAmtDate[key] = [];
    khanByAmtDate[key].push(r);
  }
  for (const [key, list] of Object.entries(khanByAmtDate)) {
    if (list.length > 1) {
      console.log(`MATCH BY AMOUNT+DATE+BANK FOR KHAN MOHAMMADI [${key}]:`);
      for (const item of list) {
        console.log(`  DocNo: ${item.DocNo}, Arch: ${item.ArchiveCode}, ChequeNo: ${item.ChequeNumber}, ChequeId: ${item.ChequeId}, Amount: ${item.Amount}, DueDate: ${item.DueDate?.slice(0,10)}, Bank: ${item.BankName}`);
      }
    }
  }

  // 2. Scan ALL duplicates in Year 4
  const allByChequeBank = {};
  for (const r of rows) {
    const chNo = (r.ChequeNumber || '').trim();
    if (!chNo) continue;
    const cleanBank = (r.BankName || '').trim().replace(/بانک\s+/, '');
    const key = `${chNo} | ${cleanBank}`;
    if (!allByChequeBank[key]) allByChequeBank[key] = [];
    allByChequeBank[key].push(r);
  }

  console.log('\n=== ALL DUPLICATES IN YEAR 4 (BY CHEQUE NO & BANK) ===');
  let dupIdx = 0;
  const duplicateGroups = [];
  for (const [key, list] of Object.entries(allByChequeBank)) {
    if (list.length > 1) {
      dupIdx++;
      duplicateGroups.push({ key, list });
      console.log(`Duplicate #${dupIdx} [${key}]:`);
      for (const item of list) {
        console.log(`  DocNo: ${item.DocNo}, Arch: ${item.ArchiveCode}, Person: ${item.PersonCode} (${item.FirstName || ''} ${item.LastName || ''}), InName: ${item.InNameOf}, Amount: ${item.Amount}, DueDate: ${item.DueDate?.slice(0,10)}, ChequeId: ${item.ChequeId}, RowId: ${item.RowId}`);
      }
    }
  }

  console.log(`\nFound ${duplicateGroups.length} duplicate groups across Year 4.`);
}

main().catch(console.error);
