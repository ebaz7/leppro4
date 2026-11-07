import { executeSayanQuery } from '../backend/sayan-order-automation.js';
import fs from 'fs';

async function main() {
  const pdfText = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const lines = pdfText.split('\n');

  const rows = [];

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

      rows.push({
        code,
        sayanBal,
        disc,
        holooBal,
        adjustment
      });
    }
  }

  const sayanTafsili = await executeSayanQuery(`
    SELECT Field_005 as TafsiliCode, Field_006 as PersonName
    FROM ACT_TBL_007 WITH (NOLOCK)
    WHERE Field_004 = '11'
  `);

  const tafsiliSet = new Set(sayanTafsili.map(t => String(t.TafsiliCode).trim()));
  const tafsiliNameMap = new Map(sayanTafsili.map(t => [String(t.TafsiliCode).trim(), t.PersonName]));

  let foundCount = 0;
  let missingCount = 0;

  for (const r of rows) {
    if (r.adjustment === 0) continue;

    // Check if code or 11+code exists in ACT_TBL_007
    let matchedTafsili = null;
    if (tafsiliSet.has(r.code)) {
      matchedTafsili = r.code;
    } else if (tafsiliSet.has(`11${r.code}`)) {
      matchedTafsili = `11${r.code}`;
    }

    if (matchedTafsili) {
      foundCount++;
      r.resolvedTafsili = matchedTafsili;
      r.resolvedName = tafsiliNameMap.get(matchedTafsili);
    } else {
      missingCount++;
      console.warn(`WARNING: Person code ${r.code} not found in ACT_TBL_007! Fallback to 11${r.code}`);
      r.resolvedTafsili = (r.code.length >= 6 && r.code.startsWith('11')) ? r.code : `11${r.code}`;
      r.resolvedName = `کد ${r.code}`;
    }
  }

  console.log(`Matched ${foundCount} / 166 persons directly in ACT_TBL_007.`);
  console.log(`Missing directly: ${missingCount}`);
}

main().catch(console.error);
