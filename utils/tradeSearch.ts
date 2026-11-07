/**
 * Enterprise Trade Search Utility
 * Provides comprehensive, multi-field, normalized search for Trade Records (ثبت سفارش و پرونده‌های بازرگانی)
 */

import { TradeRecord } from '../types';

/**
 * Normalizes Persian/Arabic strings for resilient fuzzy matching:
 * - Unifies Ye (ي -> ی) and Kaf (ك -> ک)
 * - Removes zero-width non-joiners (ZWNJ) and invisible formatting chars
 * - Removes Persian/Arabic diacritics (Aerab)
 * - Unifies Arabic & Persian digits to standard ASCII (0-9)
 * - Converts to lower-case and trims superfluous whitespace
 */
export const normalizeSearchText = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '';
    return String(str)
        .toLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces & joiners
        .replace(/[\u200c]/g, ' ')             // ZWNJ to single space
        .replace(/[\u064B-\u065F]/g, '')       // Arabic Diacritics (Tanwin, Sukun, Fatha, etc.)
        .replace(/[ي]/g, 'ی')
        .replace(/[ك]/g, 'ک')
        .replace(/[آأإٱ]/g, 'ا')
        .replace(/[ة]/g, 'ه')
        // Persian digits to Latin
        .replace(/[۰]/g, '0').replace(/[۱]/g, '1').replace(/[۲]/g, '2').replace(/[۳]/g, '3').replace(/[۴]/g, '4')
        .replace(/[۵]/g, '5').replace(/[۶]/g, '6').replace(/[۷]/g, '7').replace(/[۸]/g, '8').replace(/[۹]/g, '9')
        // Arabic digits to Latin
        .replace(/[٠]/g, '0').replace(/[١]/g, '1').replace(/[٢]/g, '2').replace(/[٣]/g, '3').replace(/[٤]/g, '4')
        .replace(/[٥]/g, '5').replace(/[٦]/g, '6').replace(/[٧]/g, '7').replace(/[٨]/g, '8').replace(/[٩]/g, '9')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Checks if a TradeRecord matches the given search query across ALL fields and sub-entities:
 * - File Number (شماره پرونده)
 * - Proforma Number (شماره پروفرم)
 * - Order Number (شماره سفارش)
 * - Registration Number / Sabt-e-Sefaresh (شماره ثبت سفارش)
 * - Goods Name (نام کالا)
 * - Seller / Supplier Name (نام فروشنده / ذینفع)
 * - Company (نام شرکت)
 * - Commodity Group (گروه کالایی)
 * - Currency (ارز اصلی)
 * - Operating Bank (بانک عامل)
 * - Items: Name, HS Code (کد تعرفه)
 * - Green Leaf / Customs (گمرک و برگ سبز):
 *     - Cottage Numbers (شماره کوتاژ)
 *     - Guarantees (شماره ضمانت‌نامه، شماره سپام، چک ضمانت، بانک)
 *     - Taxes & Road Tolls (مالیات و عوارض راه)
 * - Shipping Documents (اسناد حمل):
 *     - Document Number (شماره سند / بارنامه / فاکتور حمل)
 *     - Vessel / Ship Name (نام کشتی)
 *     - Ports (بندر بارگیری، بندر تخلیه)
 *     - Invoice & Packing Items (شرح اقلام و پکینگ)
 * - Clearance Data (ترخیص):
 *     - Warehouse Receipt Number (شماره قبض انبار)
 *     - Warehouse Name (نام انبار)
 * - Insurance Data (بیمه):
 *     - Policy Number (شماره بیمه‌نامه)
 *     - Company & Agency Name / Code (نام شرکت بیمه، نام نمایندگی، کد نمایندگی)
 *     - Endorsements (الحاقیه)
 * - Currency Purchase (خرید و تخصیص ارز):
 *     - Broker / Exchange Name (نام صرافی / کارگزار)
 *     - Tracking Code / Deal Number (کد رهگیری / شماره معامله نیما)
 *     - Bank Name & Recipients (بانک ارز، تحویل‌گیرنده)
 * - Inspection (بازرسی):
 *     - Certificate Number (شماره گواهی بازرسی)
 *     - Inspection Company (شرکت بازرسی)
 * - Agent / Clearance (حق‌العمل‌کار / ترخیص‌کار):
 *     - Agent Name & Bank (نام کارگزار و بانک)
 * - Internal Shipping (حمل داخلی)
 * - Comments & Stage Notes (یادداشت‌ها و مراحل)
 * - Transfers & Proforma History (تاریخچه و پرونده‌های منتقله)
 */
export const matchesTradeRecord = (record: TradeRecord, searchQuery: string): boolean => {
    if (!searchQuery || !searchQuery.trim()) return true;

    const normalizedQuery = normalizeSearchText(searchQuery);
    const queryTokens = normalizedQuery.split(' ').filter(token => token.length > 0);

    // Collect all searchable strings into a composite text
    const searchableParts: string[] = [];

    // 1. Core Header Fields
    if (record.fileNumber) searchableParts.push(`پرونده ${record.fileNumber}`);
    if (record.proformaNumber) searchableParts.push(`پروفرما پروفرم ${record.proformaNumber}`);
    if (record.orderNumber) searchableParts.push(`سفارش ${record.orderNumber}`);
    if (record.registrationNumber) searchableParts.push(`ثبت سفارش ${record.registrationNumber}`);
    if (record.goodsName) searchableParts.push(record.goodsName);
    if (record.sellerName) searchableParts.push(`فروشنده ${record.sellerName}`);
    if (record.company) searchableParts.push(`شرکت ${record.company}`);
    if (record.commodityGroup) searchableParts.push(`گروه کالایی ${record.commodityGroup}`);
    if (record.mainCurrency) searchableParts.push(`ارز ${record.mainCurrency}`);
    if (record.operatingBank) searchableParts.push(`بانک عامل ${record.operatingBank}`);
    if (record.currencyAllocationType) searchableParts.push(record.currencyAllocationType);
    if (record.allocationCurrencyRank) searchableParts.push(record.allocationCurrencyRank);
    if (record.startDate) searchableParts.push(record.startDate);
    if (record.registrationDate) searchableParts.push(record.registrationDate);
    if (record.registrationExpiry) searchableParts.push(record.registrationExpiry);

    // 2. Items & HS Codes (اقلام و تعرفه گمرکی)
    if (Array.isArray(record.items)) {
        record.items.forEach(item => {
            if (item.name) searchableParts.push(`کالا ${item.name}`);
            if (item.hsCode) searchableParts.push(`تعرفه تعرفه_گمرکی ${item.hsCode}`);
        });
    }

    // 3. Green Leaf / Customs (برگ سبز و گمرک)
    if (record.greenLeafData) {
        if (Array.isArray(record.greenLeafData.duties)) {
            record.greenLeafData.duties.forEach(duty => {
                if (duty.cottageNumber) searchableParts.push(`کوتاژ کوتاژ_گمرکی ${duty.cottageNumber}`);
                if (duty.bank) searchableParts.push(`بانک گمرک ${duty.bank}`);
                if (duty.part) searchableParts.push(`پارت ${duty.part}`);
            });
        }
        if (Array.isArray(record.greenLeafData.guarantees)) {
            record.greenLeafData.guarantees.forEach(g => {
                if (g.guaranteeNumber) searchableParts.push(`ضمانت ضمانت_نامه ${g.guaranteeNumber}`);
                if (g.sepamNumber) searchableParts.push(`سپام ${g.sepamNumber}`);
                if (g.chequeNumber) searchableParts.push(`چک ضمانت ${g.chequeNumber}`);
                if (g.chequeBank) searchableParts.push(`بانک چک ${g.chequeBank}`);
                if (g.guaranteeBank) searchableParts.push(`بانک ضمانت ${g.guaranteeBank}`);
                if (g.part) searchableParts.push(`پارت ${g.part}`);
            });
        }
        if (Array.isArray(record.greenLeafData.taxes)) {
            record.greenLeafData.taxes.forEach(t => {
                if (t.bank) searchableParts.push(`بانک مالیات ${t.bank}`);
                if (t.part) searchableParts.push(`پارت مالیات ${t.part}`);
            });
        }
        if (Array.isArray(record.greenLeafData.roadTolls)) {
            record.greenLeafData.roadTolls.forEach(rt => {
                if (rt.bank) searchableParts.push(`بانک عوارض ${rt.bank}`);
                if (rt.part) searchableParts.push(`پارت عوارض ${rt.part}`);
            });
        }
    }

    // 4. Shipping Documents (اسناد حمل)
    if (Array.isArray(record.shippingDocuments)) {
        record.shippingDocuments.forEach(doc => {
            if (doc.documentNumber) searchableParts.push(`سند حمل بارنامه ${doc.documentNumber}`);
            if (doc.type) searchableParts.push(doc.type);
            if (doc.vesselName) searchableParts.push(`کشتی ${doc.vesselName}`);
            if (doc.portOfLoading) searchableParts.push(`بندر بارگیری ${doc.portOfLoading}`);
            if (doc.portOfDischarge) searchableParts.push(`بندر تخلیه ${doc.portOfDischarge}`);
            if (doc.description) searchableParts.push(doc.description);
            if (Array.isArray(doc.invoiceItems)) {
                doc.invoiceItems.forEach(inv => {
                    if (inv.name) searchableParts.push(`قلم فاکتور ${inv.name}`);
                    if (inv.part) searchableParts.push(`پارت ${inv.part}`);
                });
            }
            if (Array.isArray(doc.packingItems)) {
                doc.packingItems.forEach(pkg => {
                    if (pkg.description) searchableParts.push(`پکینگ ${pkg.description}`);
                    if (pkg.part) searchableParts.push(`پارت ${pkg.part}`);
                });
            }
        });
    }

    // 5. Clearance & Warehouse (ترخیص و قبوض انبار)
    if (record.clearanceData) {
        if (Array.isArray(record.clearanceData.receipts)) {
            record.clearanceData.receipts.forEach(rcp => {
                const rcpNum = rcp.number || (rcp as any).receiptNumber;
                if (rcpNum) searchableParts.push(`قبض انبار ${rcpNum}`);
                const whName = (rcp as any).warehouseName;
                if (whName) searchableParts.push(`انبار گمرک ${whName}`);
                if (rcp.part) searchableParts.push(`پارت ${rcp.part}`);
            });
        }
        if (Array.isArray(record.clearanceData.payments)) {
            record.clearanceData.payments.forEach(p => {
                if (p.bank) searchableParts.push(`بانک ترخیص ${p.bank}`);
                if ((p as any).description) searchableParts.push(`شرح ترخیص ${(p as any).description}`);
                if (p.part) searchableParts.push(`پارت ${p.part}`);
            });
        }
    }

    // 6. Insurance (بیمه‌نامه و نمایندگی)
    if (record.insuranceData) {
        if (record.insuranceData.policyNumber) searchableParts.push(`بیمه نامه ${record.insuranceData.policyNumber}`);
        if (record.insuranceData.company) searchableParts.push(`شرکت بیمه ${record.insuranceData.company}`);
        if (record.insuranceData.agencyName) searchableParts.push(`نمایندگی بیمه ${record.insuranceData.agencyName}`);
        if (record.insuranceData.agencyCode) searchableParts.push(`کد نمایندگی ${record.insuranceData.agencyCode}`);
        if (record.insuranceData.bank) searchableParts.push(`بانک بیمه ${record.insuranceData.bank}`);
        if (Array.isArray(record.insuranceData.endorsements)) {
            record.insuranceData.endorsements.forEach(e => {
                if ((e as any).endorsementNumber) searchableParts.push(`الحاقیه بیمه ${(e as any).endorsementNumber}`);
                if (e.description) searchableParts.push(`شرح الحاقیه ${e.description}`);
            });
        }
    }

    // 7. Currency Purchase (خرید ارز، صرافی، نیما، کد رهگیری)
    if (record.currencyPurchaseData) {
        if (record.currencyPurchaseData.brokerName) searchableParts.push(`صرافی کارگزار ${record.currencyPurchaseData.brokerName}`);
        if (record.currencyPurchaseData.exchangeName) searchableParts.push(`صرافی ${record.currencyPurchaseData.exchangeName}`);
        if (record.currencyPurchaseData.recipientName) searchableParts.push(`تحویل گیرنده ${record.currencyPurchaseData.recipientName}`);
        if (record.currencyPurchaseData.allocationCode) searchableParts.push(`کد تخصیص ${record.currencyPurchaseData.allocationCode}`);

        if (Array.isArray(record.currencyPurchaseData.tranches)) {
            record.currencyPurchaseData.tranches.forEach(tr => {
                if (tr.brokerName) searchableParts.push(`صرافی کارگزار ${tr.brokerName}`);
                if (tr.exchangeName) searchableParts.push(`صرافی ${tr.exchangeName}`);
                if ((tr as any).trackingCode) searchableParts.push(`کد رهگیری حواله ${(tr as any).trackingCode}`);
                if ((tr as any).dealNumber) searchableParts.push(`شماره معامله نیما ${(tr as any).dealNumber}`);
                if ((tr as any).bankName) searchableParts.push(`بانک ارز ${(tr as any).bankName}`);
                if ((tr as any).description) searchableParts.push(`شرح حواله ${(tr as any).description}`);
                if (Array.isArray(tr.deliveries)) {
                    tr.deliveries.forEach(del => {
                        if (del.recipientName) searchableParts.push(`تحویل گیرنده ${del.recipientName}`);
                        if (del.description) searchableParts.push(`شرح تحویل ${del.description}`);
                    });
                }
            });
        }
    }

    // 8. Inspection (بازرسی کالا)
    if (record.inspectionData) {
        if (record.inspectionData.certificateNumber) searchableParts.push(`گواهی بازرسی ${record.inspectionData.certificateNumber}`);
        if (record.inspectionData.inspectionCompany) searchableParts.push(`شرکت بازرسی ${record.inspectionData.inspectionCompany}`);
        if (Array.isArray(record.inspectionData.certificates)) {
            record.inspectionData.certificates.forEach(cert => {
                if (cert.company) searchableParts.push(`شرکت بازرسی ${cert.company}`);
                if (cert.certificateNumber) searchableParts.push(`گواهی بازرسی ${cert.certificateNumber}`);
                if (cert.part) searchableParts.push(`پارت ${cert.part}`);
                if (cert.description) searchableParts.push(cert.description);
            });
        }
    }

    // 9. Agent / Clearance (حق‌العمل‌کار / ترخیص‌کار)
    if (record.agentData && Array.isArray(record.agentData.payments)) {
        record.agentData.payments.forEach(p => {
            if (p.agentName) searchableParts.push(`حق العمل کار ترخیص کار ${p.agentName}`);
            if (p.bank) searchableParts.push(`بانک حق العمل ${p.bank}`);
            if (p.description) searchableParts.push(`شرح حق العمل ${p.description}`);
            if (p.part) searchableParts.push(`پارت ${p.part}`);
        });
    }

    // 10. Internal Shipping (حمل داخلی)
    if (record.internalShippingData && Array.isArray(record.internalShippingData.payments)) {
        record.internalShippingData.payments.forEach(p => {
            if (p.bank) searchableParts.push(`بانک حمل ${p.bank}`);
            if (p.description) searchableParts.push(`شرح حمل داخلی ${p.description}`);
            if (p.part) searchableParts.push(`پارت ${p.part}`);
        });
    }

    // 11. Licenses / Statistics (مجوزها)
    if (record.licenseData && Array.isArray(record.licenseData.transactions)) {
        record.licenseData.transactions.forEach(tx => {
            if ((tx as any).referenceNumber) searchableParts.push(`شماره مجوز ${(tx as any).referenceNumber}`);
            if (tx.description) searchableParts.push(`شرح مجوز ${tx.description}`);
            if (tx.bank) searchableParts.push(`بانک مجوز ${tx.bank}`);
        });
    }

    // 12. Comments & Notes (یادداشت‌ها)
    if (Array.isArray(record.comments)) {
        record.comments.forEach(c => {
            if (c.text) searchableParts.push(`توضیح یادداشت ${c.text}`);
            if (c.creatorName) searchableParts.push(`نویسنده ${c.creatorName}`);
            if (c.createdBy) searchableParts.push(`نویسنده ${c.createdBy}`);
        });
    }

    // 13. Stages Notes (مراحل)
    if (record.stages && typeof record.stages === 'object') {
        Object.values(record.stages).forEach((stage: any) => {
            if (stage && stage.notes) searchableParts.push(`مرحله ${stage.notes}`);
            if (stage && stage.title) searchableParts.push(`عنوان مرحله ${stage.title}`);
        });
    }

    // 14. Transfers & History (انتقالات و تاریخچه)
    if (record.transferredFrom) {
        searchableParts.push(`انتقال از ${record.transferredFrom.fileNumber} ${record.transferredFrom.goodsName}`);
    }
    if (record.transferredTo) {
        searchableParts.push(`انتقال به ${record.transferredTo.fileNumber} ${record.transferredTo.goodsName}`);
    }
    if (Array.isArray(record.proformaHistory)) {
        record.proformaHistory.forEach(h => {
            if (h.description) searchableParts.push(`تاریخچه پروفرما ${h.description}`);
            if (Array.isArray(h.items)) {
                h.items.forEach(it => {
                    if (it.name) searchableParts.push(`قلم تاریخچه ${it.name}`);
                });
            }
        });
    }

    // Combine all and normalize
    const fullSearchableText = normalizeSearchText(searchableParts.join(' '));

    // Every token in the user's query must match some part of the composite text
    return queryTokens.every(token => fullSearchableText.includes(token));
};

/**
 * Returns match highlight metadata to show in the UI which specific sub-field matched
 */
export interface MatchHighlight {
    label: string;
    value: string;
}

export const getTradeRecordMatchHighlights = (record: TradeRecord, searchQuery: string): MatchHighlight[] => {
    if (!searchQuery || !searchQuery.trim()) return [];

    const normQuery = normalizeSearchText(searchQuery);
    if (!normQuery) return [];

    const highlights: MatchHighlight[] = [];
    const testMatch = (val: any) => {
        if (!val) return false;
        return normalizeSearchText(val).includes(normQuery);
    };

    // Cottage / کوتاژ
    if (record.greenLeafData?.duties) {
        record.greenLeafData.duties.forEach(d => {
            if (testMatch(d.cottageNumber)) {
                highlights.push({ label: 'کوتاژ گمرکی', value: d.cottageNumber });
            }
        });
    }

    // Registration Number / ثبت سفارش
    if (testMatch(record.registrationNumber)) {
        highlights.push({ label: 'ثبت سفارش', value: record.registrationNumber! });
    }

    // Proforma / پروفرما
    if (testMatch(record.proformaNumber)) {
        highlights.push({ label: 'پروفرما', value: record.proformaNumber! });
    }

    // Shipping Docs / بارنامه
    if (record.shippingDocuments) {
        record.shippingDocuments.forEach(doc => {
            if (testMatch(doc.documentNumber)) {
                highlights.push({ label: doc.type || 'سند حمل', value: doc.documentNumber });
            }
        });
    }

    // Insurance / بیمه
    if (testMatch(record.insuranceData?.policyNumber)) {
        highlights.push({ label: 'بیمه‌نامه', value: record.insuranceData!.policyNumber });
    }

    // Currency Purchase / کد رهگیری حواله و صرافی
    if (record.currencyPurchaseData) {
        if (testMatch(record.currencyPurchaseData.brokerName)) {
            highlights.push({ label: 'صرافی', value: record.currencyPurchaseData.brokerName! });
        }
        if (record.currencyPurchaseData.tranches) {
            record.currencyPurchaseData.tranches.forEach(tr => {
                if (testMatch((tr as any).trackingCode)) {
                    highlights.push({ label: 'کد پیگیری حواله', value: (tr as any).trackingCode });
                }
                if (testMatch((tr as any).dealNumber)) {
                    highlights.push({ label: 'شماره معامله نیما', value: (tr as any).dealNumber });
                }
                if (testMatch(tr.brokerName)) {
                    highlights.push({ label: 'صرافی', value: tr.brokerName });
                }
            });
        }
    }

    // Guarantees / ضمانت‌نامه
    if (record.greenLeafData?.guarantees) {
        record.greenLeafData.guarantees.forEach(g => {
            if (testMatch(g.guaranteeNumber)) {
                highlights.push({ label: 'ضمانت‌نامه', value: g.guaranteeNumber });
            }
            if (testMatch(g.sepamNumber)) {
                highlights.push({ label: 'سپام', value: g.sepamNumber! });
            }
        });
    }

    // Warehouse Receipt / قبض انبار
    if (record.clearanceData?.receipts) {
        record.clearanceData.receipts.forEach(rcp => {
            const num = rcp.number || (rcp as any).receiptNumber;
            if (testMatch(num)) {
                highlights.push({ label: 'قبض انبار', value: num });
            }
        });
    }

    return highlights;
};
