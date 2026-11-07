/**
 * Enterprise Trade Clearance Expense Reconciliation & Data Recovery Utility
 * 
 * Provides bulletproof extraction, multi-source merging, history snapshot recovery,
 * and stage-total reconciliation for Clearance Expenses (هزینه‌های ترخیص).
 */

import { TradeRecord, AgentPayment, TradeStage } from '../types';
import { deformatNumberString, generateUUID } from '../constants';

/**
 * Normalizes an arbitrary payment object to a clean AgentPayment
 */
export const normalizePaymentObject = (p: any, fallbackIndex: number = 0): AgentPayment | null => {
    if (!p) return null;
    const rawAmt = p.amount !== undefined ? p.amount : (p.cost !== undefined ? p.cost : (p.price !== undefined ? p.price : 0));
    const amt = typeof rawAmt === 'number' ? rawAmt : deformatNumberString(String(rawAmt));
    if (isNaN(amt) || amt <= 0) {
        // If amount is 0, only accept if there's an agentName or description
        if (!p.agentName && !p.name && !p.description) return null;
    }

    const name = (p.agentName || p.name || p.title || p.description || 'هزینه ترخیص').trim();
    const pId = p.id || p._id || `pmt-${fallbackIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    return {
        id: String(pId),
        agentName: name,
        amount: Math.round(amt),
        bank: String(p.bank || p.bankName || '').trim(),
        date: String(p.date || p.paymentDate || '').trim(),
        part: String(p.part || p.stage || p.phase || '').trim(),
        description: String(p.description || p.desc || p.notes || '').trim()
    };
};

/**
 * Finds the recorded cost of clearance fees in the record's stages.
 * Inspects all possible Persian and English stage keys.
 */
export const getStageRecordedClearanceCost = (record: TradeRecord | null | undefined): number => {
    if (!record || !record.stages) return 0;

    // 1. Direct standard key
    if (record.stages[TradeStage.AGENT_FEES]?.costRial) {
        return Number(record.stages[TradeStage.AGENT_FEES].costRial) || 0;
    }

    // 2. Alternative key spellings & variations
    const stageKeys = Object.keys(record.stages);
    for (const key of stageKeys) {
        const lowerKey = key.toLowerCase().replace(/[\u200c\s_]/g, '');
        if (
            lowerKey.includes('agentfees') ||
            lowerKey.includes('clearance') ||
            lowerKey.includes('هزینهترخیص') ||
            lowerKey.includes('هزینههایترخیص') ||
            lowerKey.includes('حقالعمل') ||
            key === 'agent_fees' ||
            key === 'AGENT_FEES' ||
            key === 'هزینه های ترخیص' ||
            key === 'هزینه‌های ترخیص'
        ) {
            const cost = Number(record.stages[key]?.costRial) || 0;
            if (cost > 0) return cost;
        }
    }

    return 0;
};

/**
 * Performs a comprehensive scan across all potential containers of clearance expenses:
 * - Current record primary and secondary fields
 * - Stage variations and nested structures
 * - History snapshots in proformaHistory
 * - Transferred source records in allRecords
 * - Linked records sharing fileNumber or proformaNumber
 * 
 * Reconciles any missing balance between stage costRial and itemized rows.
 */
export const extractAllClearancePayments = (
    record: TradeRecord | null | undefined,
    allRecords: TradeRecord[] = []
): {
    payments: AgentPayment[];
    stageRecordedCost: number;
    hasReconciledBalance: boolean;
    reconciledBalanceAmount: number;
    recoveredCountFromHistory: number;
} => {
    if (!record) {
        return {
            payments: [],
            stageRecordedCost: 0,
            hasReconciledBalance: false,
            reconciledBalanceAmount: 0,
            recoveredCountFromHistory: 0
        };
    }

    const resultPayments: AgentPayment[] = [];
    let recoveredCountFromHistory = 0;

    // Step 1: Extract PRIMARY payments (must preserve all of them without loss)
    if (record.agentData && Array.isArray(record.agentData.payments)) {
        record.agentData.payments.forEach((p, idx) => {
            const norm = normalizePaymentObject(p, idx);
            if (norm) resultPayments.push(norm);
        });
    }

    // Secondary collections helper
    const mergeSecondaryList = (list: any[], isHistory: boolean = false) => {
        if (!Array.isArray(list) || list.length === 0) return;
        list.forEach((raw, idx) => {
            const candidate = normalizePaymentObject(raw, idx);
            if (!candidate) return;

            // Check if already represented in resultPayments
            const alreadyExists = resultPayments.some(existing => {
                // If both have reliable IDs (non-fallback)
                if (existing.id && candidate.id && existing.id === candidate.id) return true;
                // Or if exact match across content
                const sameAmt = existing.amount === candidate.amount;
                const sameName = existing.agentName === candidate.agentName;
                const sameDate = (!existing.date && !candidate.date) || existing.date === candidate.date;
                const samePart = (!existing.part && !candidate.part) || existing.part === candidate.part;
                return sameAmt && sameName && sameDate && samePart;
            });

            if (!alreadyExists) {
                resultPayments.push(candidate);
                if (isHistory) recoveredCountFromHistory++;
            }
        });
    };

    const anyRec = record as any;

    // Step 2: Check alternative root collections
    if (Array.isArray(record.agentData)) mergeSecondaryList(record.agentData);
    if (Array.isArray(anyRec.agentPayments)) mergeSecondaryList(anyRec.agentPayments);
    if (Array.isArray(anyRec.agentFees)) mergeSecondaryList(anyRec.agentFees);
    if (Array.isArray(anyRec.clearanceAgentPayments)) mergeSecondaryList(anyRec.clearanceAgentPayments);
    if (Array.isArray(anyRec.clearanceExpenses)) mergeSecondaryList(anyRec.clearanceExpenses);
    if (Array.isArray(anyRec.agentExpenses)) mergeSecondaryList(anyRec.agentExpenses);
    if (Array.isArray(anyRec.agentCosts)) mergeSecondaryList(anyRec.agentCosts);
    if (Array.isArray(anyRec.customsClearanceExpenses)) mergeSecondaryList(anyRec.customsClearanceExpenses);
    if (Array.isArray(anyRec.customsExpenses)) mergeSecondaryList(anyRec.customsExpenses);
    if (record.agentData) {
        if (Array.isArray((record.agentData as any).costs)) mergeSecondaryList((record.agentData as any).costs);
        if (Array.isArray((record.agentData as any).items)) mergeSecondaryList((record.agentData as any).items);
        if (Array.isArray((record.agentData as any).fees)) mergeSecondaryList((record.agentData as any).fees);
        if (Array.isArray((record.agentData as any).transactions)) mergeSecondaryList((record.agentData as any).transactions);
        if (Array.isArray((record.agentData as any).expenses)) mergeSecondaryList((record.agentData as any).expenses);
    }

    // Step 3: Check stages for clearance fee rows
    if (record.stages) {
        Object.entries(record.stages).forEach(([key, stageObj]: [string, any]) => {
            if (!stageObj) return;
            const lowerKey = key.toLowerCase().replace(/[\u200c\s_]/g, '');
            if (
                key === TradeStage.AGENT_FEES ||
                key === 'agent_fees' ||
                key === 'AGENT_FEES' ||
                key === 'هزینه های ترخیص' ||
                key === 'هزینه‌های ترخیص' ||
                lowerKey.includes('agent') ||
                lowerKey.includes('clearance') ||
                lowerKey.includes('ترخیص') ||
                lowerKey.includes('حقالعمل')
            ) {
                if (Array.isArray(stageObj.payments)) mergeSecondaryList(stageObj.payments);
                if (Array.isArray(stageObj.agentPayments)) mergeSecondaryList(stageObj.agentPayments);
                if (Array.isArray(stageObj.agentFees)) mergeSecondaryList(stageObj.agentFees);
                if (Array.isArray(stageObj.costs)) mergeSecondaryList(stageObj.costs);
                if (Array.isArray(stageObj.items)) mergeSecondaryList(stageObj.items);
                if (Array.isArray(stageObj.fees)) mergeSecondaryList(stageObj.fees);
                if (Array.isArray(stageObj.transactions)) mergeSecondaryList(stageObj.transactions);
                if (Array.isArray(stageObj.details)) mergeSecondaryList(stageObj.details);
                if (Array.isArray(stageObj.expenses)) mergeSecondaryList(stageObj.expenses);
                if (Array.isArray(stageObj.breakdown)) mergeSecondaryList(stageObj.breakdown);
                if (stageObj.data && Array.isArray(stageObj.data.payments)) mergeSecondaryList(stageObj.data.payments);
            }
        });
    }

    // Step 4: Check proformaHistory snapshots (critical for transferred/updated proformas)
    if (Array.isArray(record.proformaHistory)) {
        record.proformaHistory.forEach(hist => {
            if (hist && hist.recordSnapshot) {
                const snap = hist.recordSnapshot as any;
                if (snap.agentData && Array.isArray(snap.agentData.payments)) {
                    mergeSecondaryList(snap.agentData.payments, true);
                }
                if (Array.isArray(snap.agentData)) mergeSecondaryList(snap.agentData, true);
                if (Array.isArray(snap.agentPayments)) mergeSecondaryList(snap.agentPayments, true);
                if (Array.isArray(snap.clearanceAgentPayments)) mergeSecondaryList(snap.clearanceAgentPayments, true);
                if (snap.stages) {
                    Object.entries(snap.stages).forEach(([k, s]: [string, any]) => {
                        if (!s) return;
                        if (
                            k === TradeStage.AGENT_FEES ||
                            k === 'agent_fees' ||
                            k.includes('ترخیص') ||
                            k.includes('agent')
                        ) {
                            if (Array.isArray(s.payments)) mergeSecondaryList(s.payments, true);
                            if (Array.isArray(s.agentPayments)) mergeSecondaryList(s.agentPayments, true);
                            if (Array.isArray(s.costs)) mergeSecondaryList(s.costs, true);
                        }
                    });
                }
            }
        });
    }

    // Step 5: Check transferredFrom source record in allRecords or proformaHistory
    if (record.transferredFrom) {
        const tf = record.transferredFrom;
        let sourceRec = Array.isArray(allRecords) ? allRecords.find(r => 
            (tf.recordId && r.id === tf.recordId) ||
            (tf.fileNumber && r.fileNumber === tf.fileNumber && r.id !== record.id)
        ) : undefined;

        if (!sourceRec && Array.isArray(record.proformaHistory)) {
            const histSnap = record.proformaHistory.find(h => h.recordSnapshot && (h.recordSnapshot.id === tf.recordId || h.recordSnapshot.fileNumber === tf.fileNumber));
            if (histSnap?.recordSnapshot) {
                sourceRec = histSnap.recordSnapshot;
            }
        }

        if (sourceRec) {
            if (sourceRec.agentData && Array.isArray(sourceRec.agentData.payments)) {
                mergeSecondaryList(sourceRec.agentData.payments, true);
            }
            if (Array.isArray((sourceRec as any).agentPayments)) {
                mergeSecondaryList((sourceRec as any).agentPayments, true);
            }
            if (sourceRec.stages?.[TradeStage.AGENT_FEES] && Array.isArray((sourceRec.stages[TradeStage.AGENT_FEES] as any).payments)) {
                mergeSecondaryList((sourceRec.stages[TradeStage.AGENT_FEES] as any).payments, true);
            }
        }
    }

    // Step 6: Stage Cost Reconciliation
    // Compare total of extracted payments with the recorded stage cost in محاسبه نهایی
    const stageRecordedCost = getStageRecordedClearanceCost(record);
    const currentSum = resultPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    let hasReconciledBalance = false;
    let reconciledBalanceAmount = 0;

    if (stageRecordedCost > currentSum) {
        const diff = stageRecordedCost - currentSum;
        if (diff > 0) {
            // Check if there's already a row with this exact difference or balance
            const alreadyHasBalanceRow = resultPayments.some(p => 
                p.id.startsWith('reconciled-clearance-balance-') ||
                (p.amount === diff && p.agentName.includes('قبلی'))
            );

            if (!alreadyHasBalanceRow) {
                hasReconciledBalance = true;
                reconciledBalanceAmount = diff;
                resultPayments.push({
                    id: `reconciled-clearance-balance-${record.id}`,
                    agentName: 'هزینه‌های قبلی و اولیه ترخیص (ثبت‌شده در پرونده)',
                    amount: diff,
                    bank: '',
                    date: record.startDate || '',
                    part: 'تسویه قبلی',
                    description: 'مابه‌التفاوت هزینه‌های قبلی ثبت‌شده در پرونده و محاسبه نهایی (قابل ویرایش، تفکیک و بروزرسانی)'
                });
            }
        }
    }

    return {
        payments: resultPayments,
        stageRecordedCost,
        hasReconciledBalance,
        reconciledBalanceAmount,
        recoveredCountFromHistory
    };
};

/**
 * Prepares an updated TradeRecord ensuring all clearance payments are
 * synchronized across all storage paths (agentData, stages, agentPayments)
 * to guarantee no future data degradation.
 */
export const prepareRecordWithClearancePayments = (
    currentRecord: TradeRecord,
    updatedPayments: AgentPayment[],
    updatedByFullName: string = ''
): TradeRecord => {
    const totalAmount = updatedPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const updatedAgentData = {
        ...(currentRecord.agentData || {}),
        payments: updatedPayments
    };

    const updatedStages = { ...(currentRecord.stages || {}) };
    
    // Primary stage
    const currentStageData = updatedStages[TradeStage.AGENT_FEES] || {
        stage: TradeStage.AGENT_FEES,
        isCompleted: false,
        description: '',
        costRial: 0,
        costCurrency: 0,
        currencyType: 'EUR',
        attachments: [],
        updatedAt: 0,
        updatedBy: ''
    };

    updatedStages[TradeStage.AGENT_FEES] = {
        ...currentStageData,
        costRial: totalAmount,
        isCompleted: updatedPayments.length > 0,
        updatedAt: Date.now(),
        updatedBy: updatedByFullName || currentStageData.updatedBy || '',
        payments: updatedPayments
    } as any;

    // Also update any existing alternative stage keys
    if (updatedStages['agent_fees']) {
        updatedStages['agent_fees'] = {
            ...updatedStages['agent_fees'],
            costRial: totalAmount,
            isCompleted: updatedPayments.length > 0,
            payments: updatedPayments
        };
    }
    if (updatedStages['هزینه های ترخیص']) {
        updatedStages['هزینه های ترخیص'] = {
            ...updatedStages['هزینه های ترخیص'],
            costRial: totalAmount,
            isCompleted: updatedPayments.length > 0,
            payments: updatedPayments
        };
    }

    return {
        ...currentRecord,
        agentData: updatedAgentData,
        agentPayments: updatedPayments,
        stages: updatedStages
    } as TradeRecord;
};
