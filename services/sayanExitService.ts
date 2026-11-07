import React from 'react';
import { createRoot } from 'react-dom/client';
import { apiCall, LS_KEYS, getLocalData } from './apiService';
import { ExitPermit, ExitPermitItem } from '../types';
import html2canvas from 'html2canvas';
import SayanSalesRemittanceDoc, { SayanRemittanceData } from '../components/SayanSalesRemittanceDoc';
import toast from 'react-hot-toast';

export interface SayanPersonResult {
  id: string;
  personCode: string;
  name: string;
  fatherOrDetail?: string;
  nationalCode?: string;
  mobile?: string;
  accountingCode?: string;
  tafsiliCode?: string;
  address?: string;
}

export interface SayanSalesRemittanceItem {
  lineId?: string;
  docNo?: string;
  itemCode: string;
  goodsName: string;
  netQty: number; // مقدار خالص
  grossQty?: number; // مقدار ناخالص
  unitPrice?: number;
  totalPrice?: number;
  cartonCount?: number;
  bobbinCount?: number;
  grade?: string;
  twistDirection?: string;
  description?: string;
  detailNote?: string;
  rowNo?: number;
}

export interface SayanSalesRemittanceSummary {
  totalRemittances: number;
  totalNetWeight: number;
  totalGrossWeight: number;
  totalCartons: number;
  totalBobbins: number;
  totalAmount: number;
  uniqueCustomersCount: number;
}

export interface SayanSalesRemittanceResult {
  archiveCode: string;
  subSystem?: string;
  docNo?: string;
  remittanceNumber: string;
  subCode?: string;
  docDate: string;
  shamsiDate: string;
  dayOfWeek?: string;
  docType?: string;
  docTypeLabel?: string;
  personCode: string;
  personFullName: string;
  personAddress?: string;
  personPhone?: string;
  storeId?: string;
  note?: string;
  headerPayable?: number;
  items: SayanSalesRemittanceItem[];
  itemsCount?: number;
  totalNetWeight: number;
  totalGrossWeight: number;
  totalCartons: number;
  totalBobbins: number;
  totalAmount?: number;
}

/**
 * Helper to merge multiple Sayan sales remittances into one unified remittance
 */
export const mergeSayanRemittances = (remittances: SayanSalesRemittanceResult[]): SayanSalesRemittanceResult | null => {
  if (!remittances || remittances.length === 0) return null;
  if (remittances.length === 1) return remittances[0];

  const mergedItems: any[] = [];
  let totalNetWeight = 0;
  let totalGrossWeight = 0;
  let totalCartons = 0;
  let totalBobbins = 0;

  remittances.forEach(rem => {
    if (Array.isArray(rem.items)) {
      rem.items.forEach(it => {
        mergedItems.push({
          ...it,
          goodsName: `${it.goodsName} (حواله ${rem.remittanceNumber})`
        });
      });
    }
    totalNetWeight += Number(rem.totalNetWeight || 0);
    totalGrossWeight += Number(rem.totalGrossWeight || 0);
    totalCartons += Number(rem.totalCartons || 0);
    totalBobbins += Number(rem.totalBobbins || 0);
  });

  return {
    archiveCode: remittances.map(r => r.archiveCode).filter(Boolean).join('، '),
    remittanceNumber: remittances.map(r => r.remittanceNumber).filter(Boolean).join('، '),
    subCode: remittances.map(r => r.subCode).filter(Boolean).join('، '),
    docDate: remittances[0].docDate,
    shamsiDate: remittances.map(r => r.shamsiDate).filter(Boolean).join('، '),
    personCode: remittances[0].personCode,
    personFullName: remittances[0].personFullName,
    personAddress: remittances[0].personAddress,
    personPhone: remittances[0].personPhone,
    items: mergedItems,
    totalNetWeight: Number(totalNetWeight.toFixed(3)),
    totalGrossWeight: Number(totalGrossWeight.toFixed(3)),
    totalCartons,
    totalBobbins
  };
};

/**
 * Fetch all Sayan Sales Remittances with filters
 */
export const fetchSayanSalesRemittances = async (filters: {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  docType?: string;
  personCode?: string;
  storeId?: string;
  limit?: number;
}): Promise<{ success: boolean; remittances: SayanSalesRemittanceResult[]; summary?: SayanSalesRemittanceSummary; message?: string }> => {
  try {
    const res = await apiCall<{
      success: boolean;
      remittances: SayanSalesRemittanceResult[];
      summary?: SayanSalesRemittanceSummary;
      message?: string;
    }>('/sayan/sales-remittances', 'POST', filters);

    if (res && res.success) {
      return {
        success: true,
        remittances: res.remittances || [],
        summary: res.summary
      };
    }
    return {
      success: false,
      remittances: [],
      message: res?.message || 'خطا در دریافت حواله‌های فروش سایان'
    };
  } catch (err: any) {
    console.error('fetchSayanSalesRemittances error:', err);
    return {
      success: false,
      remittances: [],
      message: err.message || 'خطای شبکه در ارتباط با سرور'
    };
  }
};

/**
 * Search persons in Sayan ERP (GNR_TBL_001)
 */
export const searchSayanPersons = async (query: string): Promise<SayanPersonResult[]> => {
  if (!query || query.trim().length === 0) return [];
  try {
    const res = await apiCall<{ persons: SayanPersonResult[] }>(
      `/sayan/search-persons?q=${encodeURIComponent(query.trim())}`
    );
    if (res && Array.isArray(res.persons)) {
      return res.persons;
    }
    return [];
  } catch (err) {
    console.warn('searchSayanPersons error:', err);
    return [];
  }
};

/**
 * Fast Smart Lookup for matching Sayan Sales Remittances (returns best match + candidate list in 1 call)
 */
export const lookupSayanSalesRemittancesFast = async (params: {
  personCode?: string;
  tafsiliCode?: string;
  recipientName?: string;
  permitDate?: string;
  permitNumber?: number | string;
  remittanceNumber?: string;
  docType?: string;
  limit?: number;
  itemNames?: string[];
  targetWeight?: number;
  targetCartons?: number;
}): Promise<{ success: boolean; remittance: SayanSalesRemittanceResult | null; remittances: SayanSalesRemittanceResult[] }> => {
  try {
    const res = await apiCall<{
      success: boolean;
      remittance?: SayanSalesRemittanceResult;
      remittances?: SayanSalesRemittanceResult[];
      error?: string;
    }>('/sayan/sales-remittance/lookup', 'POST', params);

    if (res && res.success && (res.remittance || (res.remittances && res.remittances.length > 0))) {
      const list = Array.isArray(res.remittances) && res.remittances.length > 0
        ? res.remittances
        : (res.remittance ? [res.remittance] : []);
      return {
        success: true,
        remittance: res.remittance || list[0] || null,
        remittances: list
      };
    }
    return { success: false, remittance: null, remittances: [] };
  } catch (err) {
    console.warn('lookupSayanSalesRemittancesFast error:', err);
    return { success: false, remittance: null, remittances: [] };
  }
};

/**
 * Lookup matching Sayan Sales Remittance (STR_TBL_010 / STR_TBL_011)
 */
export const lookupSayanSalesRemittance = async (params: {
  personCode?: string;
  tafsiliCode?: string;
  recipientName?: string;
  permitDate?: string;
  permitNumber?: number | string;
  docType?: string;
}): Promise<SayanSalesRemittanceResult | null> => {
  const res = await lookupSayanSalesRemittancesFast(params);
  return res.remittance;
};

/**
 * Sync Exit Permit with Sayan Sales Remittance on the server
 */
export const syncExitPermitWithSayan = async (
  permitId: string,
  options?: {
    approverWarehouse?: string;
    advanceToSecurity?: boolean;
    customItems?: ExitPermitItem[];
    remittanceData?: SayanSalesRemittanceResult | null;
    remittanceDocs?: SayanSalesRemittanceResult[];
    attachmentDataUrl?: string;
  }
): Promise<{ success: boolean; permit?: ExitPermit; error?: string }> => {
  try {
    const res = await apiCall<{ success: boolean; permit?: ExitPermit; error?: string }>(
      `/sayan/exit-permits/${permitId}/sync-remittance`,
      'POST',
      options || {}
    );
    return res;
  } catch (err: any) {
    console.error('syncExitPermitWithSayan error:', err);
    return { success: false, error: err.message || 'Server error' };
  }
};

/**
 * Capture an element and return a base64 JPEG data URL
 */
export const captureElementToDataUrl = async (elementId: string): Promise<string> => {
  const el = document.getElementById(elementId);
  if (!el) {
    throw new Error(`Element #${elementId} not found`);
  }
  const canvas = await html2canvas(el, {
    scale: 1.2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });
  return canvas.toDataURL('image/jpeg', 0.75);
};

/**
 * Render SayanSalesRemittanceDoc in a temporary offscreen DOM container attached to document.body
 * and capture it to a base64 image Data URL. Safe to call even after modals are unmounted!
 */
export const renderAndCaptureRemittanceOffscreen = async (docData: SayanRemittanceData): Promise<string | null> => {
  if (typeof document === 'undefined') return null;

  const container = document.createElement('div');
  const tempId = `offscreen-sayan-rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '-9999px';
  container.style.width = '820px';
  container.style.zIndex = '-1000';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    root.render(React.createElement(SayanSalesRemittanceDoc, { id: tempId, data: docData, showStamps: true }));
    // Wait for React render + layout paint
    await new Promise(resolve => setTimeout(resolve, 180));
    const el = document.getElementById(tempId) || (container.firstElementChild as HTMLElement);
    if (!el) return null;
    const canvas = await html2canvas(el, {
      scale: 1.2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    return canvas.toDataURL('image/jpeg', 0.78);
  } catch (err) {
    console.warn('renderAndCaptureRemittanceOffscreen warning:', err);
    return null;
  } finally {
    try {
      root.unmount();
    } catch {}
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
};

/**
 * Background Auto-Detection, Rendering & Attachment of Sayan Sales Remittance.
 * Runs completely in the background after the warehouse user confirms counts/weights,
 * never blocking the modal or UI. If remittance wasn't detected yet, automatically
 * queries Sayan (with smart retries), renders the official remittance document offscreen,
 * and attaches it to the permit.
 */
export const backgroundAutoDetectAndAttachRemittance = (options: {
  permit: ExitPermit;
  finalizedItems: ExitPermitItem[];
  initialRemittance?: SayanSalesRemittanceResult | null;
  initialRemittances?: SayanSalesRemittanceResult[];
  initialAttachmentDataUrl?: string;
  companyName?: string;
  approverWarehouse?: string;
}): void => {
  const { permit, finalizedItems, initialRemittance, initialRemittances, initialAttachmentDataUrl, companyName, approverWarehouse } = options;

  setTimeout(async () => {
    try {
      let matchedRemittance: SayanSalesRemittanceResult | null = initialRemittance || null;
      let matchedDocs: SayanSalesRemittanceResult[] =
        Array.isArray(initialRemittances) && initialRemittances.length > 0
          ? initialRemittances
          : (matchedRemittance ? [matchedRemittance] : []);

      const personCode = permit.sayanPersonCode
        ? String(permit.sayanPersonCode).trim()
        : (permit.destinations?.[0]?.sayanPersonCode ? String(permit.destinations[0].sayanPersonCode).trim() : '');
      const tafsiliCode = permit.sayanTafsiliCode
        ? String(permit.sayanTafsiliCode).trim()
        : (permit.destinations?.[0]?.sayanTafsiliCode ? String(permit.destinations[0].sayanTafsiliCode).trim() : '');
      const recipientName = permit.recipientName || permit.destinations?.[0]?.recipientName || '';

      const totalConfirmedWeight = (finalizedItems || []).reduce((acc, it) => acc + (Number(it.deliveredWeight) || Number(it.weight) || 0), 0) || Number(permit.weight || 0);
      const totalConfirmedCartons = (finalizedItems || []).reduce((acc, it) => acc + (Number(it.deliveredCartonCount) || Number(it.cartonCount) || 0), 0) || Number(permit.cartonCount || 0);
      const itemNames = (finalizedItems || []).map(it => it.goodsName).filter(Boolean);

      const buildDocData = (rem: SayanSalesRemittanceResult | null): SayanRemittanceData => {
        const useItems = finalizedItems && finalizedItems.length > 0
          ? finalizedItems
          : (rem?.items && rem.items.length > 0 ? rem.items : []);
        return {
          companyTitle: companyName || permit.company || 'شرکت لپان بافت',
          remittanceNumber: rem?.remittanceNumber || permit.sayanRemittanceNumber || permit.permitNumber || '---',
          subCode: rem?.subCode || permit.sayanSubCode || '---',
          archiveCode: rem?.archiveCode || permit.sayanArchiveCode || '---',
          shamsiDate: rem?.shamsiDate || permit.date || '---',
          recipientName: rem?.personFullName || recipientName || '---',
          recipientCode: rem?.personCode || personCode,
          tafsiliCode: tafsiliCode,
          recipientAddress: rem?.personAddress || permit.destinationAddress || permit.destinations?.[0]?.address,
          recipientPhone: rem?.personPhone || permit.driverPhone || permit.destinations?.[0]?.phone,
          items: useItems.map((it: any, idx: number) => {
            const remItem = rem?.items?.[idx];
            return {
              rowNo: idx + 1,
              goodsName: it.goodsName || remItem?.goodsName || '---',
              netQty: Number(it.deliveredWeight || it.netQty || it.weight || 0),
              grossQty: Number(it.grossWeight || it.grossQty || it.deliveredWeight || it.netQty || 0),
              cartonCount: Number(it.deliveredCartonCount || it.cartonCount || 0),
              bobbinCount: Number(it.bobbinCount || remItem?.bobbinCount || 0),
              grade: it.grade || remItem?.grade || 'AA',
              twistDirection: it.twistDirection || remItem?.twistDirection || 'Z',
              description: it.description || remItem?.description || ''
            };
          }),
          notes: permit.description || '',
          creatorName: permit.requester || 'مسئول فروش',
          warehouseKeeperName: approverWarehouse || permit.approverWarehouse || 'سرپرست انبار',
          managerName: permit.approverFactory || 'مدیریت کارخانه',
          securityGuardName: permit.approverSecurity || 'انتظامات'
        };
      };

      const applySyncedPermitToClient = (syncedPermit: ExitPermit) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('EXIT_PERMIT_OPTIMISTIC_APPLY', {
            detail: {
              permitId: syncedPermit.id,
              targetStatus: syncedPermit.status,
              updates: syncedPermit,
              permit: syncedPermit
            }
          }));
        }
        setTimeout(() => {
          try {
            const cached = getLocalData<ExitPermit[]>(LS_KEYS.EXIT_PERMITS, []);
            if (Array.isArray(cached) && cached.length > 0) {
              const updatedList = cached.map(p => {
                if (p.id !== syncedPermit.id) return p;
                const merged = { ...p, ...syncedPermit };
                return {
                  ...merged,
                  attachments: Array.isArray(merged.attachments)
                    ? merged.attachments.map((a: any) => typeof a === 'object' && a?.data?.length > 1024 ? { ...a, data: '' } : a)
                    : merged.attachments
                };
              });
              localStorage.setItem(LS_KEYS.EXIT_PERMITS, JSON.stringify(updatedList));
            }
          } catch {}
        }, 120);
      };

      // Case A: User explicitly selected a Sayan remittance -> render offscreen & attach to permit
      if (matchedRemittance) {
        const docData = buildDocData(matchedRemittance);
        const dataUrl = initialAttachmentDataUrl || await renderAndCaptureRemittanceOffscreen(docData);
        const syncRes = await syncExitPermitWithSayan(permit.id, {
          approverWarehouse,
          advanceToSecurity: false,
          customItems: finalizedItems,
          remittanceData: matchedRemittance,
          remittanceDocs: matchedDocs,
          attachmentDataUrl: dataUrl || undefined
        });
        if (syncRes?.success && syncRes.permit) {
          applySyncedPermitToClient(syncRes.permit);
        }
        return;
      }

      // Case B: User did NOT select any Sayan remittance (entered manual numbers or skipped selection).
      // Do NOT auto-detect or auto-attach any Sayan remittance! Simply sync the confirmed items.
      const syncRes = await syncExitPermitWithSayan(permit.id, {
        approverWarehouse,
        advanceToSecurity: false,
        customItems: finalizedItems,
        remittanceData: null,
        remittanceDocs: []
      });
      if (syncRes?.success && syncRes.permit) {
        applySyncedPermitToClient(syncRes.permit);
      }
    } catch (err) {
      console.warn('backgroundAutoDetectAndAttachRemittance warning:', err);
    }
  }, 50);
};

