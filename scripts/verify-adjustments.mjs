import { executeSayanQuery } from '../backend/sayan-order-automation.js';
import fs from 'fs';

async function main() {
  const pdfText = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const lines = pdfText.split('\n');

  console.log('--- STEP 1: Parsing PDF Data ---');

  const rows = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    const codeMatch = line.match(/^(\d{3,5}|—)\s+(.+)/);
    if (!codeMatch) continue;

    const code = codeMatch[1];
    const rest = codeMatch[2];

    if (code === '—') continue; // Skip unlinked items without Sayan code

    // Extract numbers in order
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

      // Validate relationship: disc = sayanBal - holooBal
      const expectedDisc = sayanBal - holooBal;
      const adjustment = holooBal - sayanBal; // Amount needed to add to Sayan

      rows.push({
        code,
        sayanBal,
        disc,
        holooBal,
        expectedDisc,
        adjustment
      });
    }
  }

  console.log(`Total parsed valid person rows: ${rows.length}`);

  // 2. Fetch all Sayan Persons and Tafsili Codes
  console.log('\n--- STEP 2: Verifying Sayan Tafsili Accounts ---');
  const sayanPersons = await executeSayanQuery(`
    SELECT 
      a7.Field_001 as TafsiliId,
      a7.Field_004 as GroupCode,
      a7.Field_005 as TafsiliCode,
      a7.Field_006 as PersonName,
      g.Field_003 as PersonCode
    FROM ACT_TBL_007 a7 WITH (NOLOCK)
    LEFT JOIN GNR_TBL_001 g WITH (NOLOCK) ON RTRIM(LTRIM(g.Field_003)) = RTRIM(LTRIM(a7.Field_005)) OR RTRIM(LTRIM('11' + g.Field_003)) = RTRIM(LTRIM(a7.Field_005))
    WHERE a7.Field_004 = '11'
  `);

  console.log(`Fetched ${sayanPersons.length} Tafsili records from ACT_TBL_007 (Group 11).`);

  const tafsiliMapByPersonCode = {};
  for (const p of sayanPersons) {
    const pCode = String(p.PersonCode || p.TafsiliCode).replace(/^11/, '').trim();
    tafsiliMapByPersonCode[pCode] = {
      tafsiliCode: String(p.TafsiliCode).trim(),
      personName: p.PersonName
    };
  }

  let validAdjustmentsCount = 0;
  let totalDebitAmount = 0;
  let totalCreditAmount = 0;

  const validAdjustments = [];

  for (const r of rows) {
    if (r.adjustment === 0) continue;

    const personInfo = tafsiliMapByPersonCode[r.code] || {
      tafsiliCode: (r.code.startsWith('11') ? r.code : `11${r.code}`),
      personName: `شخص ${r.code}`
    };

    // If adjustment > 0 -> Debit person (بدهکار)
    // If adjustment < 0 -> Credit person (بستانکار)
    const isDebit = r.adjustment > 0;
    const absAmt = Math.abs(r.adjustment);

    if (isDebit) {
      totalDebitAmount += absAmt;
    } else {
      totalCreditAmount += absAmt;
    }

    validAdjustmentsCount++;
    validAdjustments.push({
      personCode: r.code,
      tafsiliCode: personInfo.tafsiliCode,
      personName: personInfo.personName,
      sayanBal: r.sayanBal,
      holooBal: r.holooBal,
      disc: r.disc,
      adjustment: r.adjustment,
      isDebit,
      absAmt
    });
  }

  console.log(`\n--- STEP 3: Adjustment Totals ---`);
  console.log(`Total persons requiring adjustment: ${validAdjustmentsCount}`);
  console.log(`Total Debit adjustment to Persons (Moein 3/101): ${totalDebitAmount.toLocaleString('fa-IR')} Rials`);
  console.log(`Total Credit adjustment to Persons (Moein 3/101): ${totalCreditAmount.toLocaleString('fa-IR')} Rials`);

  const netBalance = totalDebitAmount - totalCreditAmount;
  console.log(`Net Adjustment Difference: ${netBalance.toLocaleString('fa-IR')} Rials`);
  if (netBalance > 0) {
    console.log(`Counter Account (Moein 5/103 - تعدیلات سنواتی) will be CREDITED by ${Math.abs(netBalance).toLocaleString('fa-IR')} Rials to balance the document.`);
  } else if (netBalance < 0) {
    console.log(`Counter Account (Moein 5/103 - تعدیلات سنواتی) will be DEBITED by ${Math.abs(netBalance).toLocaleString('fa-IR')} Rials to balance the document.`);
  } else {
    console.log(`Document is inherently balanced!`);
  }

  // Sample adjustments
  console.log('\nSample First 10 Adjustments:');
  validAdjustments.slice(0, 10).forEach((a, i) => {
    console.log(`${i+1}. Code: ${a.personCode} (${a.personName}) | Tafsili: ${a.tafsiliCode} | Action: ${a.isDebit ? 'DEBIT (بدهکار)' : 'CREDIT (بستانکار)'} ${a.absAmt.toLocaleString('fa-IR')} Rials | Disc: ${a.disc}`);
  });
}

main().catch(console.error);
