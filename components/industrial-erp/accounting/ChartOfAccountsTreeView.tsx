import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Download,
  Edit3,
  FolderPlus,
  FolderTree,
  Layers,
  ListPlus,
  Plus,
  Search,
  Sparkles,
  Trash2,
  AlertTriangle,
  Check,
  X,
  Users
} from 'lucide-react';
import {
  ErpAccount,
  ErpAccountCategory,
  ErpAccountLayerConfig,
  ErpCompanySummary,
  ErpParty,
  ErpSubViewId,
  IndustrialErpState
} from '../types';
import { matchesSearchQuery } from '../erpCodeUtils';
import {
  ACCOUNT_CATEGORY_META,
  AccountTreeNode,
  DEFAULT_ACCOUNTING_LAYERS,
  PARTY_TYPE_META,
  STANDARD_IRANIAN_INDUSTRIAL_COA,
  TafsilTreeNode,
  buildAccountTree,
  buildTafsilTree,
  exportRowsToCsv,
  getDescendantAccountIds,
  getDescendantTafsilIds,
  getEffectiveAccountingSettings,
  getLevelDisplayTitle,
  getTafsilFullPath,
  inferAccountCategory,
  levelFromDepth,
  suggestNextChildCode,
  suggestNextTafsilCode
} from './accountingUtils';

interface ChartOfAccountsTreeViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany: ErpCompanySummary;
  erpState: IndustrialErpState;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  showToast: (type: 'success' | 'error', text: string) => void;
}

interface AccountFormState {
  editingId: string | null;
  code: string;
  title: string;
  parentId: string;
  layerDepth: number;
  layerTitle: string;
  category: ErpAccountCategory;
  nature: ErpAccount['nature'];
  acceptsVoucher: boolean;
  tafsilRequired: boolean;
  isActive: boolean;
  description: string;
  cascadeCodeToVouchers: boolean;
}

interface PartyFormState {
  editingId: string | null;
  code: string;
  name: string;
  type: ErpParty['type'];
  parentId: string;
  isGroup: boolean;
  isActive: boolean;
  nationalId: string;
  phone: string;
  city: string;
  creditLimitRials: number;
  description: string;
}

const EMPTY_ACCOUNT_FORM: AccountFormState = {
  editingId: null,
  code: '',
  title: '',
  parentId: '',
  layerDepth: 1,
  layerTitle: '',
  category: 'ASSET',
  nature: 'DEBIT',
  acceptsVoucher: true,
  tafsilRequired: false,
  isActive: true,
  description: '',
  cascadeCodeToVouchers: true
};

const EMPTY_PARTY_FORM: PartyFormState = {
  editingId: null,
  code: '',
  name: '',
  type: 'CUSTOMER',
  parentId: '',
  isGroup: false,
  isActive: true,
  nationalId: '',
  phone: '',
  city: '',
  creditLimitRials: 0,
  description: ''
};

export const ChartOfAccountsTreeView: React.FC<ChartOfAccountsTreeViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  persistErpState,
  showToast
}) => {
  const settings = useMemo(() => getEffectiveAccountingSettings(erpState), [erpState]);
  const layers = settings.layers;

  // --- Chart of Accounts state ---
  const [coaSearch, setCoaSearch] = useState('');
  const [coaCategoryFilter, setCoaCategoryFilter] = useState<'ALL' | ErpAccountCategory>('ALL');
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const a of erpState.chartOfAccounts || []) {
      if (!a.parentCode || a.level === 'GROUP' || a.level === 'KOL') init.add(a.id);
    }
    return init;
  });
  const [accountForm, setAccountForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<string | null>(null);
  const [savingCoa, setSavingCoa] = useState(false);

  // --- Tafsil Tree state ---
  const [tafsilSearch, setTafsilSearch] = useState('');
  const [tafsilTypeFilter, setTafsilTypeFilter] = useState<'ALL' | ErpParty['type']>('ALL');
  const [expandedTafsilIds, setExpandedTafsilIds] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const p of erpState.parties || []) {
      if (!p.parentId && !p.parentCode) init.add(p.id);
    }
    return init;
  });
  const [partyForm, setPartyForm] = useState<PartyFormState>(EMPTY_PARTY_FORM);
  const [confirmDeletePartyId, setConfirmDeletePartyId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkParentId, setBulkParentId] = useState('');
  const [bulkType, setBulkType] = useState<ErpParty['type']>('CUSTOMER');
  const [bulkLinesText, setBulkLinesText] = useState('');
  const [savingParty, setSavingParty] = useState(false);

  // --- Layers & Views state ---
  const [draftLayers, setDraftLayers] = useState<ErpAccountLayerConfig[]>(layers);
  const [selectedAccountView, setSelectedAccountView] = useState<'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'INDUSTRIAL' | 'DISCIPLINARY'>('BALANCE_SHEET');

  const accounts = useMemo(() => erpState.chartOfAccounts || [], [erpState.chartOfAccounts]);
  const parties = useMemo(() => erpState.parties || [], [erpState.parties]);

  const accountTree = useMemo(() => buildAccountTree(accounts), [accounts]);
  const tafsilTree = useMemo(() => buildTafsilTree(parties), [parties]);

  // Voucher reference count per account code
  const voucherRefCountByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of erpState.vouchers || []) {
      for (const l of v.lines || []) {
        const c = String(l.accountCode || '').trim();
        if (c) map.set(c, (map.get(c) || 0) + 1);
      }
    }
    return map;
  }, [erpState.vouchers]);

  // Filtered Account Tree (keeps matching nodes & their ancestors)
  const filteredAccountTree = useMemo(() => {
    const q = coaSearch.trim();
    const cat = coaCategoryFilter;
    if (!q && cat === 'ALL') return accountTree;

    const filterNodes = (nodes: AccountTreeNode[]): AccountTreeNode[] => {
      const out: AccountTreeNode[] = [];
      for (const n of nodes) {
        const filteredChildren = filterNodes(n.children);
        const nodeCat = inferAccountCategory(n.account);
        const catMatch = cat === 'ALL' || nodeCat === cat;
        const searchMatch =
          !q ||
          matchesSearchQuery(q, [
            n.account.code,
            n.account.title,
            n.account.description,
            n.account.layerTitle
          ]);
        if ((catMatch && searchMatch) || filteredChildren.length > 0) {
          out.push({ ...n, children: filteredChildren });
        }
      }
      return out;
    };
    return filterNodes(accountTree);
  }, [accountTree, coaSearch, coaCategoryFilter]);

  // Filtered Tafsil Tree
  const filteredTafsilTree = useMemo(() => {
    const q = tafsilSearch.trim();
    const typ = tafsilTypeFilter;
    if (!q && typ === 'ALL') return tafsilTree;

    const filterNodes = (nodes: TafsilTreeNode[]): TafsilTreeNode[] => {
      const out: TafsilTreeNode[] = [];
      for (const n of nodes) {
        const filteredChildren = filterNodes(n.children);
        const typeMatch = typ === 'ALL' || n.party.type === typ;
        const searchMatch =
          !q ||
          matchesSearchQuery(q, [
            n.party.code,
            n.party.name,
            n.party.city,
            n.party.phone,
            n.party.nationalId,
            n.party.description
          ]);
        if ((typeMatch && searchMatch) || filteredChildren.length > 0) {
          out.push({ ...n, children: filteredChildren });
        }
      }
      return out;
    };
    return filterNodes(tafsilTree);
  }, [tafsilTree, tafsilSearch, tafsilTypeFilter]);

  // Helper to mark COA customized in cutoverConfig so backend never restores deleted defaults
  const buildCustomizedCutoverConfig = (extraSettings?: Partial<typeof settings>) => ({
    ...(erpState.cutoverConfig || {
      stage1FactoryWarehouseActive: true,
      stage2TehranPricingInvoiceActive: true,
      stage3PaymentOrdersAutoVoucherActive: false,
      lastSayanBarcodeSyncAt: null,
      lastSayanBarcodeSyncCount: 0,
      lastTrialBalanceCutoffDate: '',
      lastTrialBalanceImportAt: null,
      defaultPaymentBankAccountCode: '110101',
      defaultReceivableAccountCode: '110201',
      defaultPayableAccountCode: '210101'
    }),
    chartOfAccountsCustomized: true,
    accountingSettings: {
      ...settings,
      ...(extraSettings || {}),
      chartOfAccountsCustomized: true
    }
  });

  // --- Account CRUD Handlers ---
  const startCreateRootAccount = () => {
    const suggestedCode = suggestNextChildCode(null, accounts, layers);
    setAccountForm({
      ...EMPTY_ACCOUNT_FORM,
      code: suggestedCode,
      layerDepth: 1,
      acceptsVoucher: false
    });
    setConfirmDeleteAccountId(null);
  };

  const startCreateChildAccount = (parentNode: AccountTreeNode) => {
    const nextDepth = parentNode.depth + 1;
    const cat = inferAccountCategory(parentNode.account);
    const suggestedCode = suggestNextChildCode(
      { ...parentNode.account, layerDepth: parentNode.depth },
      accounts,
      layers
    );
    setExpandedAccountIds(prev => {
      const next = new Set(prev);
      next.add(parentNode.account.id);
      return next;
    });
    setAccountForm({
      editingId: null,
      code: suggestedCode,
      title: '',
      parentId: parentNode.account.id,
      layerDepth: nextDepth,
      layerTitle: '',
      category: cat,
      nature: parentNode.account.nature || ACCOUNT_CATEGORY_META[cat].defaultNature,
      acceptsVoucher: nextDepth >= 3,
      tafsilRequired: nextDepth === 3,
      isActive: true,
      description: '',
      cascadeCodeToVouchers: true
    });
    setConfirmDeleteAccountId(null);
  };

  const startEditAccount = (node: AccountTreeNode) => {
    const acc = node.account;
    const parentObj =
      (acc.parentId ? accounts.find(a => a.id === acc.parentId) : undefined) ||
      (acc.parentCode ? accounts.find(a => a.code === acc.parentCode) : undefined);
    setAccountForm({
      editingId: acc.id,
      code: acc.code,
      title: acc.title,
      parentId: parentObj?.id || '',
      layerDepth: node.depth,
      layerTitle: acc.layerTitle || '',
      category: inferAccountCategory(acc),
      nature: acc.nature || 'DEBIT',
      acceptsVoucher: acc.acceptsVoucher !== false,
      tafsilRequired: Boolean(acc.tafsilRequired),
      isActive: acc.isActive !== false,
      description: acc.description || '',
      cascadeCodeToVouchers: true
    });
    setConfirmDeleteAccountId(null);
  };

  const handleSaveAccount = async () => {
    const trimmedCode = accountForm.code.trim();
    const trimmedTitle = accountForm.title.trim();
    if (!trimmedCode || !trimmedTitle) {
      showToast('error', 'کد حساب و عنوان سرفصل الزامی است.');
      return;
    }

    const duplicate = accounts.find(
      a => a.code.trim() === trimmedCode && a.id !== accountForm.editingId
    );
    if (duplicate) {
      showToast('error', `کد حساب «${trimmedCode}» قبلاً برای «${duplicate.title}» ثبت شده است.`);
      return;
    }

    const parentAcc = accountForm.parentId
      ? accounts.find(a => a.id === accountForm.parentId)
      : undefined;

    if (accountForm.editingId && parentAcc) {
      const descendants = getDescendantAccountIds(accountForm.editingId, accounts);
      if (descendants.has(parentAcc.id)) {
        showToast('error', 'نمی‌توان یک حساب را زیرمجموعه خودش یا فرزندانش قرار داد.');
        return;
      }
    }

    const computedDepth = parentAcc
      ? Math.max(2, (parentAcc.layerDepth || 1) + 1)
      : Math.max(1, accountForm.layerDepth || 1);
    const computedLevel = levelFromDepth(computedDepth);

    setSavingCoa(true);
    try {
      let nextAccounts = [...accounts];
      let nextVouchers = erpState.vouchers || [];

      if (accountForm.editingId) {
        const existing = accounts.find(a => a.id === accountForm.editingId);
        if (!existing) return;
        const oldCode = existing.code;
        const codeChanged = oldCode !== trimmedCode;
        const titleChanged = existing.title !== trimmedTitle;

        nextAccounts = accounts.map(a => {
          if (a.id === existing.id) {
            return {
              ...a,
              code: trimmedCode,
              title: trimmedTitle,
              parentId: parentAcc ? parentAcc.id : null,
              parentCode: parentAcc ? parentAcc.code : undefined,
              level: computedLevel,
              layerDepth: computedDepth,
              layerTitle: accountForm.layerTitle.trim() || undefined,
              category: accountForm.category,
              nature: accountForm.nature,
              acceptsVoucher: accountForm.acceptsVoucher,
              tafsilRequired: accountForm.tafsilRequired,
              isActive: accountForm.isActive,
              description: accountForm.description.trim() || undefined
            };
          }
          // Cascade parentCode to direct children when parent code changes
          if (codeChanged && (a.parentId === existing.id || a.parentCode === oldCode)) {
            return { ...a, parentId: existing.id, parentCode: trimmedCode };
          }
          return a;
        });

        if (accountForm.cascadeCodeToVouchers && (codeChanged || titleChanged)) {
          nextVouchers = nextVouchers.map(v => {
            let touched = false;
            const updatedLines = (v.lines || []).map(l => {
              if (l.accountId === existing.id || l.accountCode === oldCode) {
                touched = true;
                return {
                  ...l,
                  accountId: existing.id,
                  accountCode: trimmedCode,
                  accountTitle: trimmedTitle
                };
              }
              return l;
            });
            return touched ? { ...v, lines: updatedLines } : v;
          });
        }

        await persistErpState(
          {
            ...erpState,
            chartOfAccounts: nextAccounts,
            vouchers: nextVouchers,
            cutoverConfig: buildCustomizedCutoverConfig()
          },
          `سرفصل حساب «${trimmedCode} — ${trimmedTitle}» ویرایش و ذخیره شد.`
        );
      } else {
        const created: ErpAccount = {
          id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          code: trimmedCode,
          title: trimmedTitle,
          parentId: parentAcc ? parentAcc.id : null,
          parentCode: parentAcc ? parentAcc.code : undefined,
          level: computedLevel,
          layerDepth: computedDepth,
          layerTitle: accountForm.layerTitle.trim() || undefined,
          category: accountForm.category,
          nature: accountForm.nature,
          acceptsVoucher: accountForm.acceptsVoucher,
          tafsilRequired: accountForm.tafsilRequired,
          isActive: accountForm.isActive,
          description: accountForm.description.trim() || undefined
        };
        nextAccounts = [...accounts, created];

        if (parentAcc) {
          setExpandedAccountIds(prev => {
            const next = new Set(prev);
            next.add(parentAcc.id);
            return next;
          });
        }

        await persistErpState(
          {
            ...erpState,
            chartOfAccounts: nextAccounts,
            cutoverConfig: buildCustomizedCutoverConfig()
          },
          `سرفصل «${created.code} — ${created.title}» به درختواره کدینگ اضافه شد.`
        );

        // Prepare quick next sibling creation under same parent for rapid entry
        const nextSuggested = suggestNextChildCode(
          parentAcc ? { ...parentAcc, layerDepth: computedDepth - 1 } : null,
          nextAccounts,
          layers
        );
        setAccountForm(prev => ({
          ...prev,
          editingId: null,
          code: nextSuggested,
          title: '',
          description: ''
        }));
      }
    } finally {
      setSavingCoa(false);
    }
  };

  const handleDeleteAccountBranch = async (accountId: string) => {
    const toRemove = getDescendantAccountIds(accountId, accounts);
    const target = accounts.find(a => a.id === accountId);
    if (!target || toRemove.size === 0) return;

    setSavingCoa(true);
    try {
      const nextAccounts = accounts.filter(a => !toRemove.has(a.id));
      await persistErpState(
        {
          ...erpState,
          chartOfAccounts: nextAccounts,
          cutoverConfig: buildCustomizedCutoverConfig()
        },
        toRemove.size > 1
          ? `سرفصل «${target.title}» به همراه ${toRemove.size - 1} زیرشاخه حذف شد.`
          : `سرفصل «${target.code} — ${target.title}» حذف شد.`
      );
      setConfirmDeleteAccountId(null);
      if (accountForm.editingId && toRemove.has(accountForm.editingId)) {
        setAccountForm(EMPTY_ACCOUNT_FORM);
      }
    } finally {
      setSavingCoa(false);
    }
  };

  const handleSeedStandardIranianCoa = async () => {
    const existingCodes = new Set(accounts.map(a => a.code.trim()));
    const missing = STANDARD_IRANIAN_INDUSTRIAL_COA.filter(a => !existingCodes.has(a.code.trim()));
    if (missing.length === 0) {
      showToast('success', 'تمام کدهای استاندارد صنعتی ایران هم‌اکنون در درختواره موجود هستند.');
      return;
    }
    setSavingCoa(true);
    try {
      const nextAccounts = [...accounts, ...missing];
      await persistErpState(
        {
          ...erpState,
          chartOfAccounts: nextAccounts,
          cutoverConfig: buildCustomizedCutoverConfig()
        },
        `${missing.length} سرفصل استاندارد حسابداری صنعتی ایران اضافه شد.`
      );
    } finally {
      setSavingCoa(false);
    }
  };

  // --- Tafsil CRUD Handlers ---
  const startCreateRootParty = () => {
    setBulkMode(false);
    setPartyForm({
      ...EMPTY_PARTY_FORM,
      code: suggestNextTafsilCode(null, parties),
      type: 'GROUP',
      isGroup: true
    });
    setConfirmDeletePartyId(null);
  };

  const startCreateChildParty = (parentNode: TafsilTreeNode) => {
    setBulkMode(false);
    const parent = parentNode.party;
    setExpandedTafsilIds(prev => {
      const next = new Set(prev);
      next.add(parent.id);
      return next;
    });
    setPartyForm({
      editingId: null,
      code: suggestNextTafsilCode(parent, parties),
      name: '',
      type: parent.type === 'GROUP' ? 'CUSTOMER' : parent.type,
      parentId: parent.id,
      isGroup: false,
      isActive: true,
      nationalId: '',
      phone: '',
      city: parent.city || '',
      creditLimitRials: 0,
      description: ''
    });
    setConfirmDeletePartyId(null);
  };

  const startEditParty = (node: TafsilTreeNode) => {
    setBulkMode(false);
    const p = node.party;
    const parentObj =
      (p.parentId ? parties.find(x => x.id === p.parentId) : undefined) ||
      (p.parentCode ? parties.find(x => x.code === p.parentCode) : undefined);
    setPartyForm({
      editingId: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      parentId: parentObj?.id || '',
      isGroup: Boolean(p.isGroup),
      isActive: p.isActive !== false,
      nationalId: p.nationalId || '',
      phone: p.phone || '',
      city: p.city || '',
      creditLimitRials: Number(p.creditLimitRials) || 0,
      description: p.description || ''
    });
    setConfirmDeletePartyId(null);
  };

  const handleSaveParty = async () => {
    const trimmedName = partyForm.name.trim();
    const trimmedCode = (partyForm.code || '').trim() || suggestNextTafsilCode(
      partyForm.parentId ? parties.find(p => p.id === partyForm.parentId) || null : null,
      parties
    );
    if (!trimmedName) {
      showToast('error', 'نام تفصیل / زیرتفصیل الزامی است.');
      return;
    }

    const dup = parties.find(p => p.code.trim() === trimmedCode && p.id !== partyForm.editingId);
    if (dup) {
      showToast('error', `کد تفصیل «${trimmedCode}» قبلاً برای «${dup.name}» استفاده شده است.`);
      return;
    }

    const parentObj = partyForm.parentId ? parties.find(p => p.id === partyForm.parentId) : undefined;
    if (partyForm.editingId && parentObj) {
      const descendants = getDescendantTafsilIds(partyForm.editingId, parties);
      if (descendants.has(parentObj.id)) {
        showToast('error', 'نمی‌توان یک تفصیل را زیرمجموعه خودش یا زیرتفصیل‌هایش قرار داد.');
        return;
      }
    }

    const depth = parentObj ? (parentObj.levelDepth || 1) + 1 : 1;

    setSavingParty(true);
    try {
      if (partyForm.editingId) {
        const existing = parties.find(p => p.id === partyForm.editingId);
        if (!existing) return;
        const oldCode = existing.code;
        const nextParties = parties.map(p => {
          if (p.id === existing.id) {
            return {
              ...p,
              code: trimmedCode,
              name: trimmedName,
              type: partyForm.type,
              parentId: parentObj ? parentObj.id : null,
              parentCode: parentObj ? parentObj.code : undefined,
              levelDepth: depth,
              isGroup: partyForm.isGroup,
              isActive: partyForm.isActive,
              nationalId: partyForm.nationalId.trim(),
              phone: partyForm.phone.trim(),
              city: partyForm.city.trim(),
              creditLimitRials: Number(partyForm.creditLimitRials) || 0,
              description: partyForm.description.trim() || undefined
            };
          }
          if (oldCode !== trimmedCode && (p.parentId === existing.id || p.parentCode === oldCode)) {
            return { ...p, parentId: existing.id, parentCode: trimmedCode };
          }
          return p;
        });

        await persistErpState(
          { ...erpState, parties: nextParties },
          `تفصیل «${trimmedCode} — ${trimmedName}» به‌روزرسانی شد.`
        );
      } else {
        const created: ErpParty = {
          id: `pty_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          code: trimmedCode,
          name: trimmedName,
          type: partyForm.type,
          parentId: parentObj ? parentObj.id : null,
          parentCode: parentObj ? parentObj.code : undefined,
          levelDepth: depth,
          isGroup: partyForm.isGroup,
          isActive: partyForm.isActive,
          nationalId: partyForm.nationalId.trim(),
          phone: partyForm.phone.trim(),
          city: partyForm.city.trim(),
          creditLimitRials: Number(partyForm.creditLimitRials) || 0,
          description: partyForm.description.trim() || undefined
        };
        const nextParties = [...parties, created];
        if (parentObj) {
          setExpandedTafsilIds(prev => {
            const next = new Set(prev);
            next.add(parentObj.id);
            return next;
          });
        }
        await persistErpState(
          { ...erpState, parties: nextParties },
          `تفصیل «${created.code} — ${created.name}» ثبت شد.`
        );
        setPartyForm(prev => ({
          ...prev,
          editingId: null,
          code: suggestNextTafsilCode(parentObj || null, nextParties),
          name: '',
          nationalId: '',
          phone: '',
          description: ''
        }));
      }
    } finally {
      setSavingParty(false);
    }
  };

  const handleBulkAddSubTafsils = async () => {
    const rawLines = bulkLinesText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) {
      showToast('error', 'حداقل یک خط شامل نام زیرتفصیل وارد کنید.');
      return;
    }

    const parentObj = bulkParentId ? parties.find(p => p.id === bulkParentId) || null : null;
    const depth = parentObj ? (parentObj.levelDepth || 1) + 1 : 1;

    setSavingParty(true);
    try {
      const runningList = [...parties];
      const added: ErpParty[] = [];
      for (const raw of rawLines) {
        const parts = raw.split(/[|\t،,]/).map(s => s.trim()).filter(Boolean);
        let code = '';
        let name = '';
        if (parts.length >= 2 && /^[0-9A-Za-z._-]+$/.test(parts[0])) {
          code = parts[0];
          name = parts.slice(1).join(' ');
        } else {
          name = raw;
          code = suggestNextTafsilCode(parentObj, runningList);
        }
        if (runningList.some(p => p.code === code)) {
          code = suggestNextTafsilCode(parentObj, runningList);
        }
        const created: ErpParty = {
          id: `pty_${Date.now()}_${added.length}_${Math.random().toString(36).slice(2, 5)}`,
          code,
          name,
          type: bulkType,
          parentId: parentObj ? parentObj.id : null,
          parentCode: parentObj ? parentObj.code : undefined,
          levelDepth: depth,
          isGroup: false,
          isActive: true,
          nationalId: '',
          phone: '',
          city: parentObj?.city || '',
          creditLimitRials: 0
        };
        runningList.push(created);
        added.push(created);
      }

      if (parentObj) {
        setExpandedTafsilIds(prev => {
          const next = new Set(prev);
          next.add(parentObj.id);
          return next;
        });
      }

      await persistErpState(
        { ...erpState, parties: runningList },
        `${added.length} زیرتفصیل جدید به‌صورت گروهی اضافه شد.`
      );
      setBulkLinesText('');
    } finally {
      setSavingParty(false);
    }
  };

  const handleDeletePartyBranch = async (partyId: string) => {
    const toRemove = getDescendantTafsilIds(partyId, parties);
    const target = parties.find(p => p.id === partyId);
    if (!target || toRemove.size === 0) return;

    setSavingParty(true);
    try {
      const nextParties = parties.filter(p => !toRemove.has(p.id));
      await persistErpState(
        { ...erpState, parties: nextParties },
        toRemove.size > 1
          ? `تفصیل «${target.name}» و ${toRemove.size - 1} زیرتفصیل آن حذف شدند.`
          : `تفصیل «${target.code} — ${target.name}» حذف شد.`
      );
      setConfirmDeletePartyId(null);
      if (partyForm.editingId && toRemove.has(partyForm.editingId)) {
        setPartyForm(EMPTY_PARTY_FORM);
      }
    } finally {
      setSavingParty(false);
    }
  };

  // --- Layers Save Handler ---
  const handleSaveLayers = async () => {
    const cleaned = draftLayers
      .map((l, idx) => ({
        ...l,
        depth: idx + 1,
        title: l.title.trim() || `سطح ${idx + 1}`,
        codeLength: Math.max(1, Math.min(24, Number(l.codeLength) || (idx + 1) * 2))
      }));
    await persistErpState(
      {
        ...erpState,
        cutoverConfig: buildCustomizedCutoverConfig({ layers: cleaned })
      },
      'ساختار لایه‌های کدینگ حسابداری با موفقیت ذخیره شد.'
    );
  };

  // --- Recursive Tree Row Renderers ---
  const renderAccountNode = (node: AccountTreeNode): React.ReactNode => {
    const acc = node.account;
    const hasChildren = node.children.length > 0;
    const isExpanded = Boolean(coaSearch.trim()) || expandedAccountIds.has(acc.id);
    const isEditing = accountForm.editingId === acc.id;
    const isConfirmingDelete = confirmDeleteAccountId === acc.id;
    const descIds = isConfirmingDelete ? getDescendantAccountIds(acc.id, accounts) : null;
    const refCount = voucherRefCountByCode.get(acc.code) || 0;
    const indentPx = Math.min(node.depth - 1, 8) * 18;
    const levelLabel = getLevelDisplayTitle(acc, node.depth, layers);

    return (
      <div key={acc.id} className="select-none">
        <div
          className={`group flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 py-2 px-2.5 border-b border-slate-100 dark:border-slate-800/80 transition-colors ${
            isEditing
              ? 'bg-indigo-50/90 dark:bg-indigo-950/50'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
          } ${acc.isActive === false ? 'opacity-60' : ''}`}
          style={{ paddingRight: `${10 + indentPx}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (!hasChildren) return;
                setExpandedAccountIds(prev => {
                  const next = new Set(prev);
                  if (next.has(acc.id)) next.delete(acc.id);
                  else next.add(acc.id);
                  return next;
                });
              }}
              aria-label="باز و بسته کردن زیرشاخه"
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                hasChildren
                  ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer'
                  : 'text-slate-300 dark:text-slate-700 cursor-default'
              }`}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={15} /> : <ChevronLeft size={15} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
              )}
            </button>

            <span className="font-mono tabular-nums font-bold text-xs text-indigo-700 dark:text-indigo-300 shrink-0 min-w-[54px]">
              {acc.code}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs truncate ${
                    node.depth <= 2
                      ? 'font-black text-slate-900 dark:text-white'
                      : 'font-semibold text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {acc.title}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  ({levelLabel}
                  {hasChildren ? ` • ${node.children.length} زیرشاخه` : ''})
                </span>
              </div>
              {acc.description && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {acc.description}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 mr-auto">
            <span className="hidden md:inline-block text-[10px] font-semibold text-slate-500 dark:text-slate-400 ml-1 whitespace-nowrap">
              {acc.nature === 'DEBIT' ? 'ماهیت بدهکار' : acc.nature === 'CREDIT' ? 'ماهیت بستانکار' : 'دوسویه'}
            </span>
            <button
              type="button"
              onClick={() => startCreateChildAccount(node)}
              title="افزودن زیرشاخه / زیرتفصیل"
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <FolderPlus size={13} />
              <span>زیرشاخه</span>
            </button>
            <button
              type="button"
              onClick={() => startEditAccount(node)}
              title="ویرایش سرفصل"
              className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Edit3 size={13} />
              <span className="hidden sm:inline">ویرایش</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteAccountId(isConfirmingDelete ? null : acc.id)}
              title="حذف سرفصل"
              className="min-h-[34px] px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">حذف</span>
            </button>
          </div>
        </div>

        {isConfirmingDelete && (
          <div
            className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ paddingRight: `${16 + indentPx}px` }}
          >
            <div className="flex items-start gap-2 text-rose-800 dark:text-rose-200">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">تایید حذف سرفصل «{acc.code} — {acc.title}»: </span>
                {descIds && descIds.size > 1 && (
                  <span>این حساب دارای {descIds.size - 1} زیرشاخه است که همگی حذف خواهند شد. </span>
                )}
                {refCount > 0 && (
                  <span className="font-bold underline">
                    هشدار: این کد در {refCount} آرتیکل سند ثبت شده است (اطلاعات اسناد قبلی حفظ می‌شود).
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={savingCoa}
                onClick={() => handleDeleteAccountBranch(acc.id)}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs cursor-pointer"
              >
                حذف قطعی
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteAccountId(null)}
                className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div>{node.children.map(child => renderAccountNode(child))}</div>
        )}
      </div>
    );
  };

  const renderTafsilNode = (node: TafsilTreeNode): React.ReactNode => {
    const p = node.party;
    const hasChildren = node.children.length > 0;
    const isExpanded = Boolean(tafsilSearch.trim()) || expandedTafsilIds.has(p.id);
    const isEditing = partyForm.editingId === p.id;
    const isConfirmingDelete = confirmDeletePartyId === p.id;
    const descIds = isConfirmingDelete ? getDescendantTafsilIds(p.id, parties) : null;
    const indentPx = Math.min(node.depth - 1, 8) * 18;

    return (
      <div key={p.id} className="select-none">
        <div
          className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 py-2 px-2.5 border-b border-slate-100 dark:border-slate-800/80 transition-colors ${
            isEditing
              ? 'bg-indigo-50/90 dark:bg-indigo-950/50'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
          } ${p.isActive === false ? 'opacity-60' : ''}`}
          style={{ paddingRight: `${10 + indentPx}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (!hasChildren) return;
                setExpandedTafsilIds(prev => {
                  const next = new Set(prev);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  return next;
                });
              }}
              aria-label="باز و بسته کردن زیرتفصیل"
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                hasChildren
                  ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer'
                  : 'text-slate-300 dark:text-slate-700 cursor-default'
              }`}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={15} /> : <ChevronLeft size={15} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
              )}
            </button>

            <span className="font-mono tabular-nums font-bold text-xs text-teal-700 dark:text-teal-300 shrink-0 min-w-[56px]">
              {p.code}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs truncate ${p.isGroup || hasChildren ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-200'}`}>
                  {p.name}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {PARTY_TYPE_META[p.type]?.label || p.type} • سطح {node.depth}
                  {hasChildren ? ` (${node.children.length} زیرتفصیل)` : ''}
                </span>
              </div>
              {(p.city || p.phone || p.nationalId) && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {[p.city, p.phone && `تلفن: ${p.phone}`, p.nationalId && `شناسه: ${p.nationalId}`]
                    .filter(Boolean)
                    .join(' • ')}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 mr-auto">
            <button
              type="button"
              onClick={() => startCreateChildParty(node)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <FolderPlus size={13} />
              <span>زیرتفصیل</span>
            </button>
            <button
              type="button"
              onClick={() => startEditParty(node)}
              className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Edit3 size={13} />
              <span className="hidden sm:inline">ویرایش</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeletePartyId(isConfirmingDelete ? null : p.id)}
              className="min-h-[34px] px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">حذف</span>
            </button>
          </div>
        </div>

        {isConfirmingDelete && (
          <div
            className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{ paddingRight: `${16 + indentPx}px` }}
          >
            <div className="text-rose-800 dark:text-rose-200 font-semibold">
              آیا از حذف «{p.code} — {p.name}»
              {descIds && descIds.size > 1 ? ` به همراه ${descIds.size - 1} زیرتفصیل` : ''} اطمینان دارید؟
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={savingParty}
                onClick={() => handleDeletePartyBranch(p.id)}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs cursor-pointer"
              >
                حذف قطعی
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeletePartyId(null)}
                className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div>{node.children.map(child => renderTafsilNode(child))}</div>
        )}
      </div>
    );
  };

  // =========================================================
  // VIEW 1: fin_chart (Unlimited Tree Chart of Accounts)
  // =========================================================
  if (activeSubView === 'fin_chart') {
    const parentAcc = accountForm.parentId ? accounts.find(a => a.id === accountForm.parentId) : null;

    return (
      <div className="space-y-4">
        {/* Header Bar */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FolderTree size={18} className="text-indigo-600 shrink-0" />
              <span>درختواره کدینگ سرفصل حساب‌ها — «{selectedCompany.name}»</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ساختار درختی با عمق نامحدود (گروه ← کل ← معین ← تفصیل ← زیرتفصیل‌های متعدد) با امکان ویرایش و حذف کامل تمام کدها.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startCreateRootAccount}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus size={15} />
              <span>سرفصل ریشه جدید</span>
            </button>
            <button
              type="button"
              disabled={savingCoa}
              onClick={handleSeedStandardIranianCoa}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Sparkles size={14} />
              <span>افزودن کدینگ استاندارد صنعتی ایران</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  `کدینگ_حسابداری_${selectedCompany.name}`,
                  ['کد حساب', 'عنوان سرفصل', 'کد والد', 'سطح', 'گروه ماهیت', 'ماهیت', 'سندپذیر', 'وضعیت'],
                  accounts.map(a => [
                    a.code,
                    a.title,
                    a.parentCode || '-',
                    getLevelDisplayTitle(a, a.layerDepth || 1, layers),
                    ACCOUNT_CATEGORY_META[inferAccountCategory(a)].label,
                    a.nature,
                    a.acceptsVoucher !== false ? 'بله' : 'خیر',
                    a.isActive !== false ? 'فعال' : 'غیرفعال'
                  ])
                )
              }
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download size={14} />
              <span>خروجی CSV</span>
            </button>
          </div>
        </div>

        {/* Main 12-Col Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Tree Panel (7 cols) */}
          <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/70 dark:bg-slate-900">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={coaSearch}
                    onChange={e => setCoaSearch(e.target.value)}
                    placeholder="جستجوی کد یا عنوان حساب (در تمام سطوح درختی)..."
                    className="w-full min-h-[40px] pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpandedAccountIds(new Set(accounts.map(a => a.id)))}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                  >
                    باز کردن همه
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedAccountIds(new Set())}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                  >
                    بستن همه
                  </button>
                </div>
              </div>

              {/* Category Filter Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
                {(
                  [
                    { id: 'ALL', label: `همه (${accounts.length})` },
                    { id: 'ASSET', label: 'دارایی‌ها' },
                    { id: 'LIABILITY', label: 'بدهی‌ها' },
                    { id: 'EQUITY', label: 'سرمایه' },
                    { id: 'REVENUE', label: 'درآمد و فروش' },
                    { id: 'COGS', label: 'بهای تمام‌شده صنعتی' },
                    { id: 'EXPENSE', label: 'هزینه‌ها' },
                    { id: 'DISCIPLINARY', label: 'انتظامی' }
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCoaCategoryFilter(tab.id)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      coaCategoryFilter === tab.id
                        ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[620px] overflow-y-auto custom-scrollbar">
              {filteredAccountTree.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  هیچ سرفصل حسابی مطابق فیلتر فعلی یافت نشد.
                </div>
              ) : (
                filteredAccountTree.map(root => renderAccountNode(root))
              )}
            </div>
          </div>

          {/* Create / Edit Inspector Form (5 cols) */}
          <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {accountForm.editingId
                    ? 'ویرایش کامل سرفصل حساب'
                    : parentAcc
                    ? `افزودن زیرشاخه جدید زیر «${parentAcc.code} — ${parentAcc.title}»`
                    : 'معرفی سرفصل حساب جدید'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  سطح انتخابی: {getLevelDisplayTitle({ id: '', code: '', title: '', level: levelFromDepth(accountForm.layerDepth), nature: 'DEBIT', layerTitle: accountForm.layerTitle }, accountForm.layerDepth, layers)} (عمق {accountForm.layerDepth})
                </p>
              </div>
              {accountForm.editingId && (
                <button
                  type="button"
                  onClick={() => setAccountForm(EMPTY_ACCOUNT_FORM)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  <X size={13} />
                  <span>لغو ویرایش</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  شاخه والد در درختواره (خالی = سرفصل ریشه)
                </label>
                <select
                  value={accountForm.parentId}
                  onChange={e => {
                    const pid = e.target.value;
                    const pObj = accounts.find(a => a.id === pid) || null;
                    const nextDepth = pObj ? (pObj.layerDepth || 1) + 1 : 1;
                    setAccountForm(prev => ({
                      ...prev,
                      parentId: pid,
                      layerDepth: nextDepth,
                      category: pObj ? inferAccountCategory(pObj) : prev.category,
                      nature: pObj ? pObj.nature : prev.nature,
                      code: prev.editingId ? prev.code : suggestNextChildCode(pObj, accounts, layers)
                    }));
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="">— سرفصل ریشه (سطح ۱ / گروه) —</option>
                  {[...accounts]
                    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
                    .filter(a => a.id !== accountForm.editingId)
                    .map(a => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.title} ({getLevelDisplayTitle(a, a.layerDepth || 1, layers)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  کد حساب (یکتا) *
                </label>
                <input
                  type="text"
                  value={accountForm.code}
                  onChange={e => setAccountForm(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="مثلاً 11010101"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان سطح (اختیاری)
                </label>
                <input
                  type="text"
                  value={accountForm.layerTitle}
                  onChange={e => setAccountForm(prev => ({ ...prev, layerTitle: e.target.value }))}
                  placeholder={getLevelDisplayTitle({ id: '', code: '', title: '', level: levelFromDepth(accountForm.layerDepth), nature: 'DEBIT' }, accountForm.layerDepth, layers)}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان سرفصل حساب *
                </label>
                <input
                  type="text"
                  value={accountForm.title}
                  onChange={e => setAccountForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="مثلاً بانک ملت شعبه مرکزی - حساب ریالی خط ۱"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  گروه صورت مالی
                </label>
                <select
                  value={accountForm.category}
                  onChange={e => {
                    const cat = e.target.value as ErpAccountCategory;
                    setAccountForm(prev => ({
                      ...prev,
                      category: cat,
                      nature: ACCOUNT_CATEGORY_META[cat].defaultNature
                    }));
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  {(Object.keys(ACCOUNT_CATEGORY_META) as ErpAccountCategory[]).map(k => (
                    <option key={k} value={k}>
                      {ACCOUNT_CATEGORY_META[k].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ماهیت استاندارد حساب
                </label>
                <select
                  value={accountForm.nature}
                  onChange={e => setAccountForm(prev => ({ ...prev, nature: e.target.value as ErpAccount['nature'] }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="DEBIT">بدهکار (Debit)</option>
                  <option value="CREDIT">بستانکار (Credit)</option>
                  <option value="BOTH">دوسویه (Both)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  توضیحات / دستورالعمل ثبت
                </label>
                <input
                  type="text"
                  value={accountForm.description}
                  onChange={e => setAccountForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="توضیح کاربردی برای حسابداران..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.acceptsVoucher}
                    onChange={e => setAccountForm(prev => ({ ...prev, acceptsVoucher: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-200">مجاز در سند</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.tafsilRequired}
                    onChange={e => setAccountForm(prev => ({ ...prev, tafsilRequired: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-200">تفصیل اجباری</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.isActive}
                    onChange={e => setAccountForm(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-200">حساب فعال</span>
                </label>
              </div>

              {accountForm.editingId && (
                <label className="sm:col-span-2 flex items-center gap-2 p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountForm.cascadeCodeToVouchers}
                    onChange={e => setAccountForm(prev => ({ ...prev, cascadeCodeToVouchers: e.target.checked }))}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="font-bold text-indigo-800 dark:text-indigo-200">
                    در صورت تغییر کد یا عنوان، آرتیکل‌های اسناد ثبت‌شده نیز خودکار به‌روزرسانی شوند
                  </span>
                </label>
              )}
            </div>

            <button
              type="button"
              disabled={savingCoa}
              onClick={handleSaveAccount}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check size={16} />
              <span>{accountForm.editingId ? 'ذخیره تغییرات سرفصل' : 'ثبت سرفصل در درختواره کدینگ'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // VIEW 2: fin_tafsili (Unlimited Nested Tafsil / Sub-Tafsil Tree)
  // =========================================================
  if (activeSubView === 'fin_tafsili') {
    const parentParty = partyForm.parentId ? parties.find(p => p.id === partyForm.parentId) : null;

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Users size={18} className="text-teal-600 shrink-0" />
              <span>درختواره تفصیل و زیرتفصیل‌های نامحدود — «{selectedCompany.name}»</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              امکان تعریف تفصیل‌های شناور و زیرتفصیل‌های تو در تو در تعداد نامحدود (اشخاص، مراکز هزینه، خطوط تولید، بانک‌ها، پروژه‌ها) به صورت تکی یا گروهی.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startCreateRootParty}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus size={15} />
              <span>سرفصل تفصیل ریشه</span>
            </button>
            <button
              type="button"
              onClick={() => setBulkMode(v => !v)}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                bulkMode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200'
              }`}
            >
              <ListPlus size={15} />
              <span>افزودن گروهی زیرتفصیل‌ها</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  `درختواره_تفصیلی_${selectedCompany.name}`,
                  ['کد تفصیل', 'نام تفصیل', 'مسیر کامل درختی', 'نوع', 'شهر', 'تلفن', 'شناسه ملی'],
                  parties.map(p => [
                    p.code,
                    p.name,
                    getTafsilFullPath(p, parties),
                    PARTY_TYPE_META[p.type]?.label || p.type,
                    p.city || '-',
                    p.phone || '-',
                    p.nationalId || '-'
                  ])
                )
              }
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download size={14} />
              <span>خروجی CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Tafsil Tree (7 cols) */}
          <div className="xl:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/70 dark:bg-slate-900">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={tafsilSearch}
                    onChange={e => setTafsilSearch(e.target.value)}
                    placeholder="جستجوی کد، نام تفصیل، شهر یا شناسه..."
                    className="w-full min-h-[40px] pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpandedTafsilIds(new Set(parties.map(p => p.id)))}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                  >
                    باز کردن همه
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedTafsilIds(new Set())}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                  >
                    بستن همه
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => setTafsilTypeFilter('ALL')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                    tafsilTypeFilter === 'ALL'
                      ? 'bg-slate-900 dark:bg-teal-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  همه ({parties.length})
                </button>
                {(Object.keys(PARTY_TYPE_META) as ErpParty['type'][]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTafsilTypeFilter(t)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                      tafsilTypeFilter === t
                        ? 'bg-slate-900 dark:bg-teal-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {PARTY_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredTafsilTree.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  هیچ تفصیلی ثبت یا یافت نشد. از فرم سمت چپ یا «افزودن گروهی» استفاده کنید.
                </div>
              ) : (
                filteredTafsilTree.map(root => renderTafsilNode(root))
              )}
            </div>
          </div>

          {/* Right/Left Form (5 cols) */}
          <div className="xl:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
            {bulkMode ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                      افزودن گروهی زیرتفصیل‌ها (تعداد زیاد در یک مرحله)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      هر خط یک زیرتفصیل جدید می‌سازد. می‌توانید فقط «نام» بنویسید یا «کد | نام» وارد کنید.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkMode(false)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    فرم تکی
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      تفصیل والد (همه خطوط زیر این شاخه ساخته می‌شوند)
                    </label>
                    <select
                      value={bulkParentId}
                      onChange={e => setBulkParentId(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      <option value="">— سرفصل ریشه (سطح ۱) —</option>
                      {parties.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {getTafsilFullPath(p, parties)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      نوع زیرتفصیل‌ها
                    </label>
                    <select
                      value={bulkType}
                      onChange={e => setBulkType(e.target.value as ErpParty['type'])}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      {(Object.keys(PARTY_TYPE_META) as ErpParty['type'][]).map(t => (
                        <option key={t} value={t}>
                          {PARTY_TYPE_META[t].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      فهرست زیرتفصیل‌ها (هر مورد در یک خط)
                    </label>
                    <textarea
                      rows={8}
                      value={bulkLinesText}
                      onChange={e => setBulkLinesText(e.target.value)}
                      placeholder={`نمونه:\nدستگاه تکسچرینگ شماره ۱\nدستگاه تکسچرینگ شماره ۲\n20105 | خط رنگرزی پارت ویژه`}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs leading-6"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={savingParty}
                  onClick={handleBulkAddSubTafsils}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer"
                >
                  ثبت یکجای تمام زیرتفصیل‌ها در درختواره
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-white">
                      {partyForm.editingId
                        ? 'ویرایش تفصیل / زیرتفصیل'
                        : parentParty
                        ? `افزودن زیرتفصیل زیر «${parentParty.code} — ${parentParty.name}»`
                        : 'معرفی تفصیل / طرف‌حساب جدید'}
                    </h3>
                  </div>
                  {partyForm.editingId && (
                    <button
                      type="button"
                      onClick={() => setPartyForm(EMPTY_PARTY_FORM)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                    >
                      <X size={13} />
                      <span>لغو</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      تفصیل والد (برای ساخت زیرتفصیل تو در تو)
                    </label>
                    <select
                      value={partyForm.parentId}
                      onChange={e => {
                        const pid = e.target.value;
                        const pObj = parties.find(x => x.id === pid) || null;
                        setPartyForm(prev => ({
                          ...prev,
                          parentId: pid,
                          code: prev.editingId ? prev.code : suggestNextTafsilCode(pObj, parties)
                        }));
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      <option value="">— تفصیل ریشه (سطح ۱) —</option>
                      {parties
                        .filter(p => p.id !== partyForm.editingId)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {getTafsilFullPath(p, parties)}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      کد تفصیل (یکتا)
                    </label>
                    <input
                      type="text"
                      value={partyForm.code}
                      onChange={e => setPartyForm(prev => ({ ...prev, code: e.target.value }))}
                      placeholder="خودکار یا دستی"
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      نوع تفصیل
                    </label>
                    <select
                      value={partyForm.type}
                      onChange={e => setPartyForm(prev => ({ ...prev, type: e.target.value as ErpParty['type'] }))}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                    >
                      {(Object.keys(PARTY_TYPE_META) as ErpParty['type'][]).map(t => (
                        <option key={t} value={t}>
                          {PARTY_TYPE_META[t].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      عنوان / نام تفصیل *
                    </label>
                    <input
                      type="text"
                      value={partyForm.name}
                      onChange={e => setPartyForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="مثلاً شرکت نساجی سپهر / خط تولید POY شماره ۲"
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">شناسه / کد ملی</label>
                    <input
                      type="text"
                      value={partyForm.nationalId}
                      onChange={e => setPartyForm(prev => ({ ...prev, nationalId: e.target.value }))}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">شماره تماس</label>
                    <input
                      type="text"
                      value={partyForm.phone}
                      onChange={e => setPartyForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">شهر / موقعیت</label>
                    <input
                      type="text"
                      value={partyForm.city}
                      onChange={e => setPartyForm(prev => ({ ...prev, city: e.target.value }))}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">سقف اعتبار (ریال)</label>
                    <input
                      type="number"
                      value={partyForm.creditLimitRials}
                      onChange={e => setPartyForm(prev => ({ ...prev, creditLimitRials: Number(e.target.value) || 0 }))}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums"
                    />
                  </div>

                  <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={partyForm.isGroup}
                        onChange={e => setPartyForm(prev => ({ ...prev, isGroup: e.target.checked }))}
                        className="w-4 h-4 accent-teal-600"
                      />
                      <span className="font-bold text-slate-700 dark:text-slate-200">سرفصل گروهی (پوشه)</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={partyForm.isActive}
                        onChange={e => setPartyForm(prev => ({ ...prev, isActive: e.target.checked }))}
                        className="w-4 h-4 accent-emerald-600"
                      />
                      <span className="font-bold text-slate-700 dark:text-slate-200">فعال</span>
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={savingParty}
                  onClick={handleSaveParty}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check size={16} />
                  <span>{partyForm.editingId ? 'ذخیره تغییرات تفصیل' : 'ثبت در درختواره تفصیل‌ها'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // VIEW 3: fin_layers (Coding Layers & Account View Templates)
  // =========================================================
  const viewAccounts = useMemo(() => {
    return accounts
      .filter(a => {
        const cat = inferAccountCategory(a);
        if (selectedAccountView === 'BALANCE_SHEET') {
          return cat === 'ASSET' || cat === 'LIABILITY' || cat === 'EQUITY';
        }
        if (selectedAccountView === 'INCOME_STATEMENT') {
          return cat === 'REVENUE' || cat === 'COGS' || cat === 'EXPENSE';
        }
        if (selectedAccountView === 'INDUSTRIAL') {
          return cat === 'COGS' || a.code.startsWith('1103');
        }
        return cat === 'DISCIPLINARY';
      })
      .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  }, [accounts, selectedAccountView]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Layers size={18} className="text-indigo-600" />
              <span>مدیریت لایه‌های کدینگ حساب‌ها (الگوی ساختار درختی)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              می‌توانید تعداد لایه‌ها (گروه، کل، معین، تفصیل سطح ۱، ۲، ۳ و بیشتر) و طول کد پیشنهادی هر سطح را تنظیم کنید.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setDraftLayers(prev => [
                  ...prev,
                  {
                    depth: prev.length + 1,
                    title: `زیرتفصیل سطح ${Math.max(1, prev.length - 2)}`,
                    codeLength: (prev[prev.length - 1]?.codeLength || 8) + 2,
                    isTafsilLayer: true,
                    description: 'سطح تفصیل تکمیلی'
                  }
                ])
              }
              className="min-h-[40px] px-3 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>افزودن لایه عمیق‌تر</span>
            </button>
            <button
              type="button"
              onClick={() => setDraftLayers(DEFAULT_ACCOUNTING_LAYERS)}
              className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              بازنشانی استاندارد
            </button>
            <button
              type="button"
              onClick={handleSaveLayers}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer"
            >
              ذخیره ساختار لایه‌ها
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="py-2.5 px-2 w-16">سطح</th>
                <th className="py-2.5 px-2">عنوان لایه</th>
                <th className="py-2.5 px-2 w-32">طول کد (رقم)</th>
                <th className="py-2.5 px-2 w-32">لایه تفصیل</th>
                <th className="py-2.5 px-2">توضیحات</th>
                <th className="py-2.5 px-2 w-20 text-center">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {draftLayers.map((layer, idx) => (
                <tr key={idx}>
                  <td className="py-2 px-2 font-mono font-black text-indigo-600">سطح {idx + 1}</td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={layer.title}
                      onChange={e =>
                        setDraftLayers(prev =>
                          prev.map((l, i) => (i === idx ? { ...l, title: e.target.value } : l))
                        )
                      }
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={layer.codeLength}
                      onChange={e =>
                        setDraftLayers(prev =>
                          prev.map((l, i) => (i === idx ? { ...l, codeLength: Number(e.target.value) || 2 } : l))
                        )
                      }
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono tabular-nums font-bold text-center"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(layer.isTafsilLayer)}
                        onChange={e =>
                          setDraftLayers(prev =>
                            prev.map((l, i) => (i === idx ? { ...l, isTafsilLayer: e.target.checked } : l))
                          )
                        }
                        className="w-4 h-4 accent-indigo-600"
                      />
                      <span>لایه تفصیل</span>
                    </label>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={layer.description || ''}
                      onChange={e =>
                        setDraftLayers(prev =>
                          prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l))
                        )
                      }
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    {idx >= 3 && (
                      <button
                        type="button"
                        onClick={() => setDraftLayers(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account View Templates */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-black text-sm text-slate-900 dark:text-white">
            نمای حساب‌ها (الگوهای دسته‌بندی استاندارد حسابداری)
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'BALANCE_SHEET', label: 'نمای ترازنامه‌ای (دائم)' },
                { id: 'INCOME_STATEMENT', label: 'نمای سود و زیانی (موقت)' },
                { id: 'INDUSTRIAL', label: 'نمای بهای تمام‌شده و تولید' },
                { id: 'DISCIPLINARY', label: 'نمای انتظامی و کنترلی' }
              ] as const
            ).map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedAccountView(v.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                  selectedAccountView === v.id
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
          {viewAccounts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">حسابی در این نما یافت نشد.</div>
          ) : (
            viewAccounts.map(a => (
              <div key={a.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono tabular-nums font-bold text-indigo-600 dark:text-indigo-300 shrink-0">
                    {a.code}
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{a.title}</span>
                </div>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {getLevelDisplayTitle(a, a.layerDepth || 1, layers)} • {ACCOUNT_CATEGORY_META[inferAccountCategory(a)].label}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
