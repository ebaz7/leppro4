// Pure utilities for ERP sequential plain numbering, line-derived reference codes,
// and normalized multi-token Farsi/English archive search.

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const PERSIAN_CHAR_TRANSLIT: Record<string, string> = {
  آ: 'A',
  ا: 'A',
  ب: 'B',
  پ: 'P',
  ت: 'T',
  ث: 'S',
  ج: 'J',
  چ: 'C',
  ح: 'H',
  خ: 'K',
  د: 'D',
  ذ: 'Z',
  ر: 'R',
  ز: 'Z',
  ژ: 'J',
  س: 'S',
  ش: 'S',
  ص: 'S',
  ض: 'Z',
  ط: 'T',
  ظ: 'Z',
  ع: 'A',
  غ: 'G',
  ف: 'F',
  ق: 'G',
  ک: 'K',
  گ: 'G',
  ل: 'L',
  م: 'M',
  ن: 'N',
  و: 'V',
  ه: 'H',
  ی: 'Y'
};

export function normalizeFaSearch(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  for (let i = 0; i < 10; i++) {
    str = str.split(PERSIAN_DIGITS[i]).join(String(i));
    str = str.split(ARABIC_DIGITS[i]).join(String(i));
  }
  return str
    .replace(/[يئى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\u200c/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getNextPlainSequentialNumber(
  existingValues: Array<string | number | undefined | null>,
  startAt = 1
): string {
  const used = new Set<number>();
  let maxExisting = startAt - 1;

  for (const raw of existingValues) {
    const norm = normalizeFaSearch(raw);
    if (/^\d+$/.test(norm)) {
      const n = parseInt(norm, 10);
      if (Number.isFinite(n) && n >= 0) {
        used.add(n);
        if (n > maxExisting) maxExisting = n;
      }
    }
  }

  let candidate = Math.max(startAt, maxExisting + 1);
  while (used.has(candidate)) {
    candidate++;
  }
  return String(candidate);
}

export function deriveLineReferencePrefix(
  lineName?: string,
  lineCode?: string,
  customPrefix?: string
): string {
  const customClean = normalizeFaSearch(customPrefix || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
  if (customClean.length >= 2) {
    return customClean;
  }

  const normName = normalizeFaSearch(lineName || '');
  const compactName = normName.replace(/[\s_.\-/()]+/g, '');

  const keywordPrefixes: Array<[RegExp, string]> = [
    [/(poy|پیاووای|پیاووی)/i, 'PO'],
    [/(dty|دیتیوای|تکسچر|textur)/i, 'DT'],
    [/(fdy|افدیوای)/i, 'FD'],
    [/(aty|ایتیای|ایرجت|تاسلان)/i, 'AT'],
    [/(bcf|بیسیاف)/i, 'BC'],
    [/(پلاست|پلیاستر|polyester)/i, 'PL'],
    [/(اکریلیک|acrylic)/i, 'AC'],
    [/(ریسند|رینگ|spinning)/i, 'SP'],
    [/(تابند|دولاتاب|twisting)/i, 'TW'],
    [/(بافند|گردباف|تریکو|weav|knit)/i, 'WV'],
    [/(رنگرز|چله|dyeing)/i, 'DY'],
    [/(پنب|cotton)/i, 'CT'],
    [/(ویسکوز|viscose)/i, 'VS'],
    [/(نایلون|پلیامید|nylon)/i, 'NY'],
    [/(بستهبند|pack)/i, 'PK']
  ];

  for (const [pattern, prefix] of keywordPrefixes) {
    if (pattern.test(compactName) || pattern.test(normName)) {
      return prefix;
    }
  }

  const latinMatches: string[] = (lineName || '').match(/[A-Za-z]{2,}/g) || [];
  const meaningfulLatin = latinMatches.find(
    token => !['line', 'pl', 'prd', 'tmt'].includes(token.toLowerCase())
  );
  if (meaningfulLatin) {
    return meaningfulLatin.slice(0, 2).toUpperCase();
  }

  const strippedFa = normName
    .replace(/(خط|تولید|ماشین|دستگاه|بخش|سالن|واحد|شماره)/g, ' ')
    .replace(/[^آ-یa-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (strippedFa) {
    let translit = '';
    for (const ch of strippedFa) {
      if (ch === ' ') continue;
      if (PERSIAN_CHAR_TRANSLIT[ch]) {
        translit += PERSIAN_CHAR_TRANSLIT[ch];
      } else if (/[a-z]/.test(ch)) {
        translit += ch.toUpperCase();
      }
      if (translit.length >= 2) break;
    }
    if (translit.length >= 2) {
      return translit;
    }
  }

  const fallbackCode = normalizeFaSearch(lineCode || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (fallbackCode.length >= 2) {
    return fallbackCode;
  }

  return 'LN';
}

export function formatNetWeightForReference(netWeightKg: number): string {
  const safe = Math.max(0, Number(netWeightKg) || 0);
  return Number(safe.toFixed(3)).toString();
}

export function buildCartonReferenceCode(
  line: { name?: string; code?: string; referencePrefix?: string } | undefined | null,
  seqCounter: number,
  netWeightKg: number
): string {
  const prefix = deriveLineReferencePrefix(line?.name, line?.code, line?.referencePrefix);
  const seqStr = String(Math.max(1, Math.floor(seqCounter || 1))).padStart(5, '0');
  const netStr = formatNetWeightForReference(netWeightKg);
  return `${prefix}-${seqStr}-${netStr}`;
}

export function matchesSearchQuery(query: string, fields: Array<unknown>): boolean {
  const normQuery = normalizeFaSearch(query);
  if (!normQuery) return true;

  const tokens = normQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = fields
    .map(f => normalizeFaSearch(f))
    .filter(Boolean)
    .join(' | ');

  return tokens.every(tok => haystack.includes(tok));
}
