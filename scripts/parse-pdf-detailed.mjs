import { executeSayanQuery } from '../backend/sayan-order-automation.js';
import fs from 'fs';

async function main() {
  const pdfText = fs.readFileSync('pdf_extracted_text.txt', 'utf8');
  const lines = pdfText.split('\n');

  console.log('Total extracted raw lines:', lines.length);

  const parsedItems = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    // Look for lines starting with person code (3 to 5 digits) or '—'
    const codeMatch = line.match(/^(\d{3,5}|—)\s+(.+)/);
    if (!codeMatch) continue;

    const code = codeMatch[1];
    const rest = codeMatch[2];

    // Find all numbers in the string
    // Standard format in PDF: SayanBalance, Discrepancy (with optional trailing minus), HolooBalance
    // E.g.: 419,090,055 ... 55,822,455- ... 474,912,510
    const numbersWithPos = [];
    const numRegex = /(-?\d{1,3}(?:,\d{3})+|-?\d+)(-)?/g;
    let m;
    while ((m = numRegex.exec(rest)) !== null) {
      let numVal = parseInt(m[1].replace(/,/g, ''), 10);
      if (m[2] === '-') {
        numVal = -Math.abs(numVal);
      }
      numbersWithPos.push({
        raw: m[0],
        val: numVal,
        index: m.index
      });
    }

    if (numbersWithPos.length >= 2) {
      parsedItems.push({
        lineIdx: idx,
        code,
        rawLine: line,
        numbers: numbersWithPos
      });
    }
  }

  console.log('Parsed item lines with numbers:', parsedItems.length);
  parsedItems.slice(0, 10).forEach(item => {
    console.log(`Code: ${item.code} | Numbers:`, item.numbers.map(n => n.val));
  });
}

main().catch(console.error);
