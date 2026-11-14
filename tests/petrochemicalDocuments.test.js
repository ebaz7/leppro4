import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const searchPath = path.resolve(process.cwd(), 'utils/tradeSearch.ts');
const searchSource = fs.readFileSync(searchPath, 'utf8');
const { outputText } = ts.transpileModule(searchSource, {
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

const { matchesTradeRecord, getTradeRecordMatchHighlights } = mod.exports;

const samplePetroRecord = {
  id: 'petro-1',
  company: 'تولیدی لپان بافت',
  fileNumber: 'DOM-1405338318',
  proformaNumber: 'PI-1405-39',
  orderNumber: '1405338318',
  registrationNumber: '1405338318',
  goodsName: 'پلی اتیلن ترفتالات نساجی TG645',
  sellerName: 'پتروشیمی شهید تندگویان',
  commodityGroup: 'مواد اولیه پتروشیمی',
  mainCurrency: 'IRR',
  purchaseType: 'domestic_bourse',
  items: [
    {
      id: 'item-1',
      name: 'پلی اتیلن ترفتالات نساجی TG645',
      weight: 22000,
      grossWeight: 22070,
      unitPrice: 3800000,
      totalPrice: 83600000000,
    },
  ],
  freightCost: 0,
  startDate: '1405/07/21',
  status: 'Active',
  stages: {},
  petrochemicalData: {
    petrochemicalName: 'پتروشیمی شهید تندگویان',
    brokerName: 'هامرز',
    sellerBrokerName: 'خلیج فارس',
    customerName: 'تولیدی لپان بافت',
    exchangeMarket: 'بورس کالای ایران',
    deliveryLocation: 'انبار کارخانه',
    contractNumber: '1405338318',
    contractSubNumber: '39',
    offeringDate: '1405/07/21',
    contractDate: '1405/07/21',
    calculatedDeliveryDeadline: '1405/08/26',
    deliveryDate: '1405/08/19',
    settlementDate: '1405/07/26',
    currentStage: 'انبار محصول پتروشیمی تندگویان',
    paymentIdentifier: 'PAY-99412',
    symbolTitle: 'PTC-PETTG645J-00',
    packagingTitle: 'جامبوبگ 1100 کیلویی',
    qualityCode: 'منطبق',
    baseCurrency: 'ریال',
    vatStatus: 'subject',
    penaltyStatus: 'ندارد',
    sellerShareRial: 83439488000,
    gradeName: 'پلی اتیلن ترفتالات نساجی TG645',
    quantityKg: 22000,
    basePricePerKg: 3800000,
    totalGoodsPrice: 83600000000,
    vatAmount: 8360000000,
    brokerageFee: 160512000,
    totalInvoiceAmount: 92252600000,
    invoiceInfo: {
      invoiceNumber: 'PTC0508/05483',
      invoiceDate: '1405/08/16',
      invoiceQuantityKg: 22070,
      finalInvoiceAmount: 92252600000,
    },
    paymentMethod: 'cash',
    loadingNotice: {
      remittanceNumber: 'BT03802/05',
      remittanceDate: '1405/07/26',
      remittanceQuantityKg: 22000,
      remittanceRemainingKg: -70,
      transportCompany: 'بهرام بار بندر',
      deliveryNoteSerial: '142592',
      unloadingAddress: 'شهرک صنعتی علی آباد خیابان تیر روزبه 8 و 9 شرکت لپان',
      originNetWeightKg: 22070,
      exitDateTime: '1405/08/11 00:00',
      truckPlate: '66ایران279ع69',
      driverName: 'نامشخص',
      loadingDate: '1405/08/11',
      deliveryStatus: 'delivered',
    },
  },
};

test('matchesTradeRecord indexes all ARCA petrochemical remittance, contract, invoice, and loading fields', () => {
  assert.equal(matchesTradeRecord(samplePetroRecord, 'BT03802/05'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'bt03802'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, '1405338318/39'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'PTC0508/05483'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, '142592'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'PTC-PETTG645J-00'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'بهرام بار بندر'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'خلیج فارس'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'PAY-99412'), true);
  assert.equal(matchesTradeRecord(samplePetroRecord, 'NON-EXISTENT-999'), false);
});

test('getTradeRecordMatchHighlights returns structured ARCA match labels', () => {
  const remitHl = getTradeRecordMatchHighlights(samplePetroRecord, 'BT03802/05');
  assert.ok(remitHl.some(h => h.label === 'شماره حواله' && h.value === 'BT03802/05'));

  const contractHl = getTradeRecordMatchHighlights(samplePetroRecord, '1405338318/39');
  assert.ok(contractHl.some(h => h.label === 'قرارداد بورس' && h.value === '1405338318/39'));

  const invoiceHl = getTradeRecordMatchHighlights(samplePetroRecord, 'PTC0508/05483');
  assert.ok(invoiceHl.some(h => h.label === 'شماره صورتحساب' && h.value === 'PTC0508/05483'));

  const deliveryHl = getTradeRecordMatchHighlights(samplePetroRecord, '142592');
  assert.ok(deliveryHl.some(h => h.label === 'سریال برگه تحویل' && h.value === '142592'));
});

test('Petrochemical UI, print, and report modules include ARCA remittance, invoice, and loading fields', () => {
  const tabSource = fs.readFileSync(path.resolve(process.cwd(), 'components/trade/DomesticPetrochemicalTab.tsx'), 'utf8');
  const printSource = fs.readFileSync(path.resolve(process.cwd(), 'components/print/PrintDomesticPetrochemical.tsx'), 'utf8');
  const tradeModuleSource = fs.readFileSync(path.resolve(process.cwd(), 'components/TradeModule.tsx'), 'utf8');
  const reportSource = fs.readFileSync(path.resolve(process.cwd(), 'components/reports/GeneralTradeListReport.tsx'), 'utf8');

  for (const snippet of ['remittanceNumber', 'remittanceDate', 'remittanceQuantityKg', 'remittanceRemainingKg', 'invoiceNumber', 'deliveryNoteSerial', 'contractSubNumber', 'symbolTitle', 'sellerShareRial']) {
    assert.ok(tabSource.includes(snippet), `DomesticPetrochemicalTab missing ${snippet}`);
    assert.ok(printSource.includes(snippet), `PrintDomesticPetrochemical missing ${snippet}`);
  }

  assert.ok(tradeModuleSource.includes('remittanceNumber'), 'TradeModule missing remittanceNumber');
  assert.ok(tradeModuleSource.includes('settings={settings}'), 'TradeModule must pass settings to DomesticPetrochemicalTab');
  assert.ok(reportSource.includes('remittanceNumber'), 'GeneralTradeListReport missing remittanceNumber');
  assert.ok(reportSource.includes('invoiceInfo?.invoiceNumber'), 'GeneralTradeListReport missing invoiceNumber');
});
