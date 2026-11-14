import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const utilsPath = path.resolve(process.cwd(), 'components/industrial-erp/erpCodeUtils.ts');
const tsSource = fs.readFileSync(utilsPath, 'utf8');
const { outputText } = ts.transpileModule(tsSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});

const mod = { exports: {} };
vm.runInNewContext(outputText, {
  module: mod,
  exports: mod.exports,
  console,
});

const {
  normalizeFaSearch,
  getNextPlainSequentialNumber,
  deriveLineReferencePrefix,
  formatNetWeightForReference,
  buildCartonReferenceCode,
  matchesSearchQuery,
} = mod.exports;

test('deriveLineReferencePrefix maps Persian/English line names properly', () => {
  assert.equal(deriveLineReferencePrefix('خط پی او وای ۱'), 'PO');
  assert.equal(deriveLineReferencePrefix('POY Line 2'), 'PO');
  assert.equal(deriveLineReferencePrefix('خط تکسچره ۱ (DTY-01)'), 'DT');
  assert.equal(deriveLineReferencePrefix('خط اف دی وای'), 'FD');
  assert.equal(deriveLineReferencePrefix('خط پلی‌استر ۳'), 'PL');
  assert.equal(deriveLineReferencePrefix('خط سفارشی', 'LN-9', 'ab7'), 'AB7');
});

test('buildCartonReferenceCode creates <PREFIX>-<5DIGIT>-<NET_KG>', () => {
  const ref = buildCartonReferenceCode({ name: 'خط پی او وای', code: 'L1' }, 1001, 24.835);
  assert.equal(ref, 'PO-01001-24.835');

  const refWhole = buildCartonReferenceCode({ name: 'خط تکسچره ۱', code: 'L2' }, 42, 25.0);
  assert.equal(refWhole, 'DT-00042-25');

  assert.equal(formatNetWeightForReference(18.500), '18.5');
});

test('getNextPlainSequentialNumber generates plain numeric doc & archive sequences ignoring legacy text codes', () => {
  assert.equal(getNextPlainSequentialNumber([], 1), '1');
  assert.equal(getNextPlainSequentialNumber(['PRD-14050823-0001'], 1), '1');
  assert.equal(getNextPlainSequentialNumber(['1', '2', 'PRD-14050823-0001'], 1), '3');
  assert.equal(getNextPlainSequentialNumber(['۱۰', '11'], 1), '12');

  assert.equal(getNextPlainSequentialNumber([], 1001), '1001');
  assert.equal(getNextPlainSequentialNumber(['PRD-ARC-14050823-0001'], 1001), '1001');
  assert.equal(getNextPlainSequentialNumber(['1001', '1002'], 1001), '1003');
});

test('matchesSearchQuery supports normalized Persian digits, Arabic characters, and multi-token carton reference searches', () => {
  assert.equal(normalizeFaSearch('خط پی‌او‌وای ۱۲۳ ي ك'), 'خط پی او وای 123 ی ک');

  const voucherFields = [
    '1',
    '1001',
    'خط پی او وای',
    'نخ POY 250/48',
    'PO-01001-24.835',
    '1405/08/23',
    'درجه A',
  ];

  assert.equal(matchesSearchQuery('PO-01001-24.835', voucherFields), true);
  assert.equal(matchesSearchQuery('po 24.835', voucherFields), true);
  assert.equal(matchesSearchQuery('۱۰۰۱ پی او وای', voucherFields), true);
  assert.equal(matchesSearchQuery('۲۴.۸۳۵', voucherFields), true);
  assert.equal(matchesSearchQuery('DT-09999', voucherFields), false);
});
