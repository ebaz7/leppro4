import React, { useState } from 'react';
import { User } from '../../types';
import {
  ErpCompanySummary,
  ErpCutoverConfig,
  ErpSubViewId,
  IndustrialErpState
} from './types';
import { ChartOfAccountsTreeView } from './accounting/ChartOfAccountsTreeView';
import { VoucherEditorAndArchiveView } from './accounting/VoucherEditorAndArchiveView';
import { FinancialReportsAndYearEndView } from './accounting/FinancialReportsAndYearEndView';

interface FinancialAccountingModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser: User;
  showToast: (type: 'success' | 'error', text: string) => void;
  cutoffDateInput: string;
  setCutoffDateInput: React.Dispatch<React.SetStateAction<string>>;
  importingTrialBalance: boolean;
  handleImportSayanTrialBalance: () => Promise<void>;
  handleToggleCutoverStage: (stageKey: keyof ErpCutoverConfig) => Promise<void>;
  openSubViewTab?: (id: ErpSubViewId) => void;
  canAccessSubView?: (id: ErpSubViewId) => boolean;
}

const FINANCE_QUICK_TABS: { id: ErpSubViewId; label: string }[] = [
  { id: 'fin_chart', label: 'کدینگ درختی حساب‌ها' },
  { id: 'fin_tafsili', label: 'درخت تفصیل و زیرتفصیل' },
  { id: 'fin_layers', label: 'لایه‌ها و نمای حساب' },
  { id: 'fin_voucher_new', label: 'سند دوبل و اتوماتیک' },
  { id: 'fin_voucher_list', label: 'بایگانی اسناد (تفکیکی)' },
  { id: 'fin_supporting_docs', label: 'اسناد مثبته' },
  { id: 'fin_ledger_review', label: 'مرور و کارت حساب' },
  { id: 'fin_trial_balance', label: 'تراز و دفاتر' },
  { id: 'fin_financial_statements', label: 'صورت‌های مالی' },
  { id: 'fin_year_end', label: 'پایان سال و تسهیم' },
  { id: 'fin_settings', label: 'دوره‌ها و تنظیمات' }
];

export const FinancialAccountingModuleView: React.FC<FinancialAccountingModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  persistErpState,
  currentUser,
  showToast,
  cutoffDateInput,
  setCutoffDateInput,
  importingTrialBalance,
  handleImportSayanTrialBalance,
  handleToggleCutoverStage,
  openSubViewTab,
  canAccessSubView
}) => {
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);

  const visibleFinanceTabs = canAccessSubView
    ? FINANCE_QUICK_TABS.filter(tab => canAccessSubView(tab.id))
    : FINANCE_QUICK_TABS;

  const handleStartEditVoucher = (voucherId: string) => {
    setEditingVoucherId(voucherId);
    if (openSubViewTab) {
      openSubViewTab('fin_voucher_new');
    }
  };

  const isCodingView =
    activeSubView === 'fin_chart' ||
    activeSubView === 'fin_tafsili' ||
    activeSubView === 'fin_layers';

  const isVoucherView =
    activeSubView === 'fin_voucher_new' ||
    activeSubView === 'fin_voucher_list' ||
    activeSubView === 'fin_supporting_docs';

  const isReportsView =
    activeSubView === 'fin_ledger_review' ||
    activeSubView === 'fin_trial_balance' ||
    activeSubView === 'fin_financial_statements' ||
    activeSubView === 'fin_year_end' ||
    activeSubView === 'fin_settings';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar">
      {/* Compact Horizontal Finance Navigation Strip (Desktop + Mobile Web + Android touch-friendly) */}
      {openSubViewTab && visibleFinanceTabs.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {visibleFinanceTabs.map(tab => {
            const active = activeSubView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => openSubViewTab(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {isCodingView && (
        <ChartOfAccountsTreeView
          activeSubView={activeSubView}
          selectedCompany={selectedCompany}
          erpState={erpState}
          persistErpState={persistErpState}
          showToast={showToast}
        />
      )}

      {isVoucherView && (
        <VoucherEditorAndArchiveView
          activeSubView={activeSubView}
          selectedCompany={selectedCompany}
          erpState={erpState}
          persistErpState={persistErpState}
          currentUser={currentUser}
          showToast={showToast}
          editingVoucherId={editingVoucherId}
          onStartEditVoucher={handleStartEditVoucher}
          onClearEditingVoucher={() => setEditingVoucherId(null)}
          openSubViewTab={openSubViewTab}
        />
      )}

      {isReportsView && (
        <FinancialReportsAndYearEndView
          activeSubView={activeSubView}
          selectedCompany={selectedCompany}
          erpState={erpState}
          persistErpState={persistErpState}
          currentUser={currentUser}
          showToast={showToast}
          cutoffDateInput={cutoffDateInput}
          setCutoffDateInput={setCutoffDateInput}
          importingTrialBalance={importingTrialBalance}
          handleImportSayanTrialBalance={handleImportSayanTrialBalance}
          handleToggleCutoverStage={handleToggleCutoverStage}
        />
      )}
    </div>
  );
};
