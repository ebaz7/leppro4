import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const readWorkspaceFile = (relPath) =>
    fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

test('Sayan sales invoice service filters pending & invoiced remittances in SQL via STR_TBL_021 and excludes voided lines', () => {
    const src = readWorkspaceFile('backend/sayan-sales-invoice-service.js');

    // 1. SQL-level pending filter must require active non-voided lines (Field_009 = 0) not linked in STR_TBL_021 (Field_005 = 2)
    assert.match(
        src,
        /if\s*\(\s*status\s*===\s*'pending'\s*\)[\s\S]*?ISNULL\(r\.Field_009,\s*0\)\s*=\s*0[\s\S]*?NOT EXISTS[\s\S]*?FROM STR_TBL_021 m[\s\S]*?m\.Field_007\s*=\s*r\.Field_001\s+AND\s+m\.Field_005\s*=\s*2/,
        'status === pending must filter directly in SQL using STR_TBL_021 and ISNULL(r.Field_009, 0) = 0'
    );

    // 2. SQL-level invoiced filter must join STR_TBL_021 with Field_005 = 2
    assert.match(
        src,
        /else if\s*\(\s*status\s*===\s*'invoiced'\s*\)[\s\S]*?INNER JOIN STR_TBL_021 m[\s\S]*?m\.Field_007\s*=\s*r\.Field_001\s+AND\s+m\.Field_005\s*=\s*2/,
        'status === invoiced must filter directly in SQL via STR_TBL_021'
    );

    // 3. Batch invoice link lookup must read linked invoice number & official/unofficial param (STR_TBL_013.Field_005 = 336)
    assert.match(
        src,
        /FROM STR_TBL_011 rem[\s\S]*?INNER JOIN STR_TBL_021 m[\s\S]*?m\.Field_007\s*=\s*rem\.Field_001[\s\S]*?LEFT JOIN STR_TBL_013 pType[\s\S]*?pType\.Field_005\s*=\s*336/,
        'batch link lookup must inspect STR_TBL_021 and STR_TBL_013 param 336'
    );

    // 4. Voided remittance lines must be tracked separately from active lines
    assert.match(src, /ISNULL\(Field_009,\s*0\)\s*=\s*0[\s\S]*?ActiveLineCount/);
    assert.match(src, /ISNULL\(Field_009,\s*0\)\s*=\s*1[\s\S]*?VoidedLineCount/);
    assert.match(src, /const isVoided\s*=\s*stats\.totalLineCount\s*>\s*0\s*&&\s*stats\.activeLineCount\s*===\s*0;/);
});

test('getRemittanceLinesForInvoice excludes voided lines and checks per-line STR_TBL_021 invoicing', () => {
    const src = readWorkspaceFile('backend/sayan-sales-invoice-service.js');

    assert.match(
        src,
        /FROM STR_TBL_011 t11[\s\S]*?AND ISNULL\(t11\.Field_009,\s*0\)\s*=\s*0/,
        'getRemittanceLinesForInvoice must exclude voided lines (Field_009 = 1)'
    );
    assert.match(
        src,
        /FROM STR_TBL_021 m[\s\S]*?m\.Field_007\s*=\s*t11\.Field_001\s+AND\s+m\.Field_005\s*=\s*2[\s\S]*?as AlreadyInvoiced/,
        'getRemittanceLinesForInvoice must flag already-invoiced rows via STR_TBL_021'
    );
    assert.match(src, /allLinesAlreadyInvoiced/);
});

test('registerSalesInvoiceInSayan prevents duplicate invoicing and writes native Sayan STR_TBL_013 + STR_TBL_021 links', () => {
    const src = readWorkspaceFile('backend/sayan-sales-invoice-service.js');

    // Duplicate guard via STR_TBL_021 returning HTTP 409
    assert.match(
        src,
        /FROM STR_TBL_021 m[\s\S]*?m\.Field_005\s*=\s*2[\s\S]*?m\.Field_007 IN[\s\S]*?err\.statusCode\s*=\s*409/,
        'registerSalesInvoiceInSayan must block duplicate invoicing with HTTP 409'
    );

    // Official STR_TBL_013 header params (14 = Customer, 336 = رسمی / غیر رسمی)
    assert.match(
        src,
        /INSERT INTO STR_TBL_013 \(Field_003, Field_004, Field_005, Field_006, Field_007\) VALUES \(@FY, @NextArchiveNo, 14,[\s\S]*?\(@FY, @NextArchiveNo, 336,/,
        'registerSalesInvoiceInSayan must write STR_TBL_013 params 14 and 336'
    );

    // Capture invoice line ID & insert STR_TBL_021 links
    assert.match(src, /SET @InvLineId = SCOPE_IDENTITY\(\);/);
    assert.match(
        src,
        /INSERT INTO STR_TBL_021 \(Field_003, Field_004, Field_005, Field_006, Field_007\) VALUES/,
        'registerSalesInvoiceInSayan must write STR_TBL_021 links so Sayan ERP recognizes the remittance as invoiced'
    );
});

test('SayanSalesInvoiceIssuer UI guards voided & already-invoiced remittances across desktop and mobile/Android views', () => {
    const ui = readWorkspaceFile('components/SayanSalesInvoiceIssuer.tsx');

    assert.match(ui, /if\s*\(\s*rem\.isVoided\s*\)/);
    assert.match(ui, /if\s*\(\s*rem\.isInvoiced\s*\)/);
    assert.match(ui, /if\s*\(\s*data\.allLinesAlreadyInvoiced\s*\)/);
    assert.match(ui, /ابطال شده/);
    assert.match(ui, /فاکتور جزئی/);
    assert.match(ui, /ثبت شده/);
});
