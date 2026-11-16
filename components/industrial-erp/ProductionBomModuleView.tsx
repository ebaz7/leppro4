import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Factory,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Scale,
  QrCode,
  Printer,
  RefreshCw,
  Search,
  Eye,
  FileText,
  Clock,
  Layers,
  Sparkles,
  ArrowRight,
  Filter,
  Check,
  X,
  AlertCircle,
  Calculator,
  Copy,
  Sliders,
  Package,
  Boxes,
  Lock,
  Unlock,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  ChevronLeft,
  Power,
  Palette,
  Settings2,
  Home,
  Barcode,
  Truck
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  ErpSubViewId,
  IndustrialErpState,
  ErpCompanySummary,
  ErpProductionLine,
  ErpCommodityGroup,
  ErpItem,
  ErpCartonLabel,
  ErpProductionVoucher,
  ErpBom,
  ErpBomComponent,
  ErpBomConsumptionBasis,
  ErpProductionConsumedLine,
  ErpWarehouseDocument,
  ErpWarehouseDocItemLine,
  ErpBarcodeType,
  ErpLabelTemplateConfig,
  DEFAULT_LABEL_TEMPLATE_CONFIG,
  getTodayJalali,
  getExactTimeNow
} from './types';
import { CartonLabelCard } from './BarcodeRenderer';
import {
  buildCartonReferenceCode,
  deriveLineReferencePrefix,
  getNextPlainSequentialNumber,
  matchesSearchQuery,
  getBomFinishedItemIds,
  getBomsForItem,
  resolveItemTareSpec
} from './erpCodeUtils';
import {
  ensureProductionFloorWarehouse,
  PRODUCTION_FLOOR_WAREHOUSE_ID,
  PRODUCTION_FLOOR_WAREHOUSE_NAME,
  computeItemLiveWaccMap,
  evaluateBomCostAndConsumption,
  resolveComponentDefinedItem
} from './warehouseLogic';
import { User } from '../../types';

interface ProductionBomModuleViewProps {
  activeSubView: ErpSubViewId;
  selectedCompany?: ErpCompanySummary;
  erpState: IndustrialErpState;
  setErpState?: React.Dispatch<React.SetStateAction<IndustrialErpState | null>>;
  persistErpState: (nextState: IndustrialErpState, toastText?: string) => Promise<void>;
  currentUser?: User;
  showToast?: (type: 'success' | 'error', text: string) => void;
  openSubViewTab?: (subId: ErpSubViewId) => void;
}

export const ProductionBomModuleView: React.FC<ProductionBomModuleViewProps> = ({
  activeSubView,
  selectedCompany,
  erpState,
  setErpState,
  persistErpState,
  currentUser,
  showToast,
  openSubViewTab
}) => {
  // Production lines (Clean/Raw from ERP state)
  const lines: ErpProductionLine[] = useMemo(() => {
    return erpState.productionLines || [];
  }, [erpState.productionLines]);

  const activeLines: ErpProductionLine[] = useMemo(() => {
    return lines.filter(l => l.isActive !== false);
  }, [lines]);

  // Commodity groups (Clean/Raw from ERP state)
  const groups: ErpCommodityGroup[] = useMemo(() => {
    return erpState.commodityGroups || [];
  }, [erpState.commodityGroups]);

  // All yarn / production items & active-only yarn items for weighing
  const yarnItems: ErpItem[] = useMemo(() => {
    return erpState.items.filter(i => i.category === 'FINISHED_YARN' || i.category === 'RAW_MATERIAL');
  }, [erpState.items]);

  const activeYarnItems: ErpItem[] = useMemo(() => {
    return yarnItems.filter(i => i.isActive !== false);
  }, [yarnItems]);

  // Live Weighted Average Cost (WACC) & Production Warehouse Stock per Item
  const itemWaccMap = useMemo(() => {
    return computeItemLiveWaccMap({
      warehouses: erpState.warehouses || [],
      items: erpState.items || [],
      productionVouchers: erpState.productionVouchers || [],
      cartonLabels: erpState.cartonLabels || [],
      warehouseDocuments: erpState.warehouseDocuments || []
    });
  }, [
    erpState.warehouses,
    erpState.items,
    erpState.productionVouchers,
    erpState.cartonLabels,
    erpState.warehouseDocuments
  ]);

  // Label Template & Scale Config (Persisted in ERP state per company)
  const labelTemplate: ErpLabelTemplateConfig = useMemo(() => {
    const saved = erpState.labelTemplateConfig;
    if (!saved) return DEFAULT_LABEL_TEMPLATE_CONFIG;
    return {
      ...DEFAULT_LABEL_TEMPLATE_CONFIG,
      ...saved,
      fields: {
        ...DEFAULT_LABEL_TEMPLATE_CONFIG.fields,
        ...(saved.fields || {})
      }
    };
  }, [erpState.labelTemplateConfig]);

  const lockTareWeightsGlobally = Boolean(erpState.scaleConfig?.lockTareWeightsGlobally);
  const lockConesCountGlobally = Boolean(erpState.scaleConfig?.lockConesCountGlobally);

  // -------------------------------------------------------------
  // TAB 1: PRODUCTION LINES STATE
  // -------------------------------------------------------------
  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [lineForm, setLineForm] = useState<Partial<ErpProductionLine>>({
    code: '',
    name: '',
    referencePrefix: '',
    machineType: '',
    supervisorName: currentUser?.fullName || '',
    isActive: true,
    notes: ''
  });

  const handleSaveLine = async () => {
    if (!lineForm.name || !lineForm.code) {
      showToast?.('error', 'لطفاً کد و عنوان خط تولید را وارد نمایید');
      return;
    }
    const cleanCustomPrefix = (lineForm.referencePrefix || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    const newLine: ErpProductionLine = {
      id: lineForm.id || `pl_${Date.now()}`,
      code: lineForm.code,
      name: lineForm.name,
      ...(cleanCustomPrefix ? { referencePrefix: cleanCustomPrefix } : {}),
      machineType: lineForm.machineType || '',
      supervisorName: lineForm.supervisorName || '',
      isActive: lineForm.isActive !== false,
      notes: lineForm.notes || ''
    };
    const currentLines = erpState.productionLines && erpState.productionLines.length > 0 ? erpState.productionLines : lines;
    const exists = currentLines.some(l => l.id === newLine.id);
    const updatedLines = exists ? currentLines.map(l => l.id === newLine.id ? newLine : l) : [...currentLines, newLine];

    await persistErpState({ ...erpState, productionLines: updatedLines }, 'خط تولید با موفقیت ذخیره شد');
    setShowAddLineModal(false);
    setLineForm({ code: '', name: '', referencePrefix: '', machineType: '', supervisorName: currentUser?.fullName || '', isActive: true, notes: '' });
  };

  const handleDeleteLine = async (id: string) => {
    if (!confirm('آیا از حذف این خط تولید اطمینان دارید؟')) return;
    const currentLines = erpState.productionLines && erpState.productionLines.length > 0 ? erpState.productionLines : lines;
    const updated = currentLines.filter(l => l.id !== id);
    await persistErpState({ ...erpState, productionLines: updated }, 'خط تولید حذف شد');
  };

  // -------------------------------------------------------------
  // TAB 2: HIERARCHICAL COMMODITY TREE & ITEMS STATE
  // -------------------------------------------------------------
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [itemSearch, setItemSearch] = useState<string>('');
  const [itemStatusFilter, setItemStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [itemGradeFilter, setItemGradeFilter] = useState<'ALL' | 'NONE' | 'A' | 'B' | 'C'>('ALL');
  const [includeChildGroupsItems, setIncludeChildGroupsItems] = useState<boolean>(true);
  const [showInlineSubgroupBox, setShowInlineSubgroupBox] = useState<boolean>(false);
  const [inlineSubgroupName, setInlineSubgroupName] = useState<string>('');
  const [inlineSubgroupCode, setInlineSubgroupCode] = useState<string>('');

  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState<Partial<ErpCommodityGroup>>({
    code: '',
    name: '',
    parentId: null,
    isActive: true,
    description: ''
  });

  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [itemForm, setItemForm] = useState<Partial<ErpItem>>({
    code: '',
    name: '',
    category: 'FINISHED_YARN',
    groupId: '',
    unit: 'کیلوگرم',
    yarnCount: '150/48',
    grade: '',
    colorName: 'سفید خام',
    stockQty: 0,
    unitCost: 1250000,
    salesPrice: 1450000,
    isActive: true
  });

  // Tree hierarchy helpers
  const getGroupPath = (groupId: string | null | undefined): ErpCommodityGroup[] => {
    if (!groupId) return [];
    const path: ErpCommodityGroup[] = [];
    const visited = new Set<string>();
    let currId: string | null | undefined = groupId;
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const found = groups.find(g => g.id === currId);
      if (!found) break;
      path.unshift(found);
      currId = found.parentId || null;
    }
    return path;
  };

  const getDescendantGroupIds = (rootId: string): string[] => {
    const result: string[] = [rootId];
    const queue: string[] = [rootId];
    const visited = new Set<string>([rootId]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = groups.filter(g => (g.parentId || null) === current);
      for (const ch of children) {
        if (!visited.has(ch.id)) {
          visited.add(ch.id);
          result.push(ch.id);
          queue.push(ch.id);
        }
      }
    }
    return result;
  };

  const getGroupHierarchyLabel = (g: ErpCommodityGroup): string => {
    const path = getGroupPath(g.id);
    return path.map(p => p.name).join(' / ');
  };

  const orderedGroupsWithDepth = useMemo(() => {
    const result: Array<{ group: ErpCommodityGroup; depth: number }> = [];
    const visited = new Set<string>();
    const visit = (parentId: string | null, depth: number) => {
      const children = groups.filter(g => (g.parentId || null) === parentId);
      for (const ch of children) {
        if (visited.has(ch.id)) continue;
        visited.add(ch.id);
        result.push({ group: ch, depth });
        visit(ch.id, depth + 1);
      }
    };
    visit(null, 0);
    // Include any orphan groups safely
    for (const g of groups) {
      if (!visited.has(g.id)) result.push({ group: g, depth: 0 });
    }
    return result;
  }, [groups]);

  const renderGradeBadge = (g?: string) => {
    const gradeVal = (g || '').trim().toUpperCase();
    if (!gradeVal) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">بدون درجه</span>;
    }
    if (gradeVal === 'A') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">درجه A</span>;
    }
    if (gradeVal === 'B') {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">درجه B</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">درجه C</span>;
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroupIds(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const childGroupsAtSelected = useMemo(() => {
    return groups.filter(g => (g.parentId || null) === selectedGroupId);
  }, [groups, selectedGroupId]);

  const filteredItemsInTree = useMemo(() => {
    let list = erpState.items || [];
    if (selectedGroupId) {
      if (includeChildGroupsItems) {
        const allowedIds = new Set(getDescendantGroupIds(selectedGroupId));
        list = list.filter(i => i.groupId && allowedIds.has(i.groupId));
      } else {
        list = list.filter(i => i.groupId === selectedGroupId);
      }
    }
    if (itemStatusFilter === 'ACTIVE') {
      list = list.filter(i => i.isActive !== false);
    } else if (itemStatusFilter === 'INACTIVE') {
      list = list.filter(i => i.isActive === false);
    }
    if (itemGradeFilter === 'NONE') {
      list = list.filter(i => !(i.grade || '').trim());
    } else if (itemGradeFilter !== 'ALL') {
      list = list.filter(i => (i.grade || '').trim().toUpperCase() === itemGradeFilter);
    }
    if (itemSearch.trim()) {
      list = list.filter(i =>
        matchesSearchQuery(itemSearch, [i.code, i.name, i.yarnCount, i.colorName, i.groupName, i.grade])
      );
    }
    return list;
  }, [erpState.items, selectedGroupId, includeChildGroupsItems, itemStatusFilter, itemGradeFilter, itemSearch, groups]);

  const openCreateGroupAt = (parentId: string | null) => {
    const parentGroup = parentId ? groups.find(g => g.id === parentId) : null;
    const siblingCount = groups.filter(g => (g.parentId || null) === parentId).length + 1;
    const suggestedCode = parentGroup
      ? `${parentGroup.code}-${String(siblingCount).padStart(2, '0')}`
      : `GRP-${String(siblingCount).padStart(2, '0')}`;
    setGroupForm({
      code: suggestedCode,
      name: '',
      parentId: parentId || null,
      isActive: true,
      description: ''
    });
    setShowAddGroupModal(true);
  };

  const openCreateItemAt = (groupId: string | null) => {
    const seq = (erpState.items?.length || 0) + 1;
    setItemForm({
      code: `YN-${String(3000 + seq)}`,
      name: '',
      category: 'FINISHED_YARN',
      groupId: groupId || '',
      unit: 'کیلوگرم',
      yarnCount: '150/48',
      grade: '',
      colorName: 'سفید خام',
      stockQty: 0,
      unitCost: 1250000,
      salesPrice: 1450000,
      isActive: true
    });
    setShowAddItemModal(true);
    setShowInlineSubgroupBox(false);
    setInlineSubgroupName('');
    setInlineSubgroupCode('');
  };

  const handleQuickCreateSubgroupInItemModal = async () => {
    const cleanName = inlineSubgroupName.trim();
    if (!cleanName) {
      showToast?.('error', 'لطفاً نام زیرگروه را وارد نمایید');
      return;
    }
    const parentId = itemForm.groupId || selectedGroupId || null;
    const parentGroup = parentId ? groups.find(g => g.id === parentId) : null;
    const siblingCount = groups.filter(g => (g.parentId || null) === parentId).length + 1;
    const code =
      inlineSubgroupCode.trim() ||
      (parentGroup ? `${parentGroup.code}-${String(siblingCount).padStart(2, '0')}` : `GRP-${String(siblingCount).padStart(2, '0')}`);
    const newGroup: ErpCommodityGroup = {
      id: `grp_${Date.now()}`,
      code,
      name: cleanName,
      parentId,
      isActive: true,
      description: ''
    };
    const updatedGroups = [...groups, newGroup];
    if (parentId) {
      setExpandedGroupIds(prev => ({ ...prev, [parentId]: true }));
    }
    setSelectedGroupId(newGroup.id);
    setItemForm(prev => ({ ...prev, groupId: newGroup.id }));
    setShowInlineSubgroupBox(false);
    setInlineSubgroupName('');
    setInlineSubgroupCode('');
    await persistErpState(
      { ...erpState, commodityGroups: updatedGroups },
      `زیرگروه «${cleanName}» ایجاد و انتخاب شد؛ اکنون مشخصات کالا را ثبت کنید`
    );
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name?.trim() || !groupForm.code?.trim()) {
      showToast?.('error', 'لطفاً کد و نام گروه را وارد نمایید');
      return;
    }
    // Prevent circular parent assignment
    if (groupForm.id && groupForm.parentId) {
      const descendants = getDescendantGroupIds(groupForm.id);
      if (descendants.includes(groupForm.parentId)) {
        showToast?.('error', 'امکان انتخاب زیرگروه یا خود گروه به عنوان گروه والد وجود ندارد');
        return;
      }
    }
    const newGroup: ErpCommodityGroup = {
      id: groupForm.id || `grp_${Date.now()}`,
      code: groupForm.code.trim(),
      name: groupForm.name.trim(),
      parentId: groupForm.parentId || null,
      isActive: groupForm.isActive !== false,
      description: groupForm.description || ''
    };
    const currentGroups = erpState.commodityGroups && erpState.commodityGroups.length > 0 ? erpState.commodityGroups : groups;
    const exists = currentGroups.some(g => g.id === newGroup.id);
    const updatedGroups = exists ? currentGroups.map(g => g.id === newGroup.id ? newGroup : g) : [...currentGroups, newGroup];
    if (newGroup.parentId) {
      setExpandedGroupIds(prev => ({ ...prev, [newGroup.parentId!]: true }));
    }
    await persistErpState({ ...erpState, commodityGroups: updatedGroups }, 'گروه / زیرگروه کالایی با موفقیت ذخیره شد');
    setShowAddGroupModal(false);
    setGroupForm({ code: '', name: '', parentId: null, isActive: true, description: '' });
  };

  const handleDeleteGroup = async (groupId: string) => {
    const hasChildren = groups.some(g => (g.parentId || null) === groupId);
    const hasItems = erpState.items.some(i => i.groupId === groupId);
    if (hasChildren) {
      showToast?.('error', 'این گروه دارای زیرگروه است. ابتدا زیرگروه‌ها را حذف یا منتقل کنید.');
      return;
    }
    if (hasItems) {
      showToast?.('error', 'در این گروه کالا تعریف شده است. ابتدا کالاها را منتقل یا حذف کنید.');
      return;
    }
    if (!confirm('آیا از حذف این گروه کالایی اطمینان دارید؟')) return;
    const updatedGroups = groups.filter(g => g.id !== groupId);
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    await persistErpState({ ...erpState, commodityGroups: updatedGroups }, 'گروه کالایی حذف شد');
  };

  const handleSaveItem = async () => {
    if (!itemForm.name?.trim() || !itemForm.code?.trim()) {
      showToast?.('error', 'لطفاً کد و نام کالا را وارد نمایید');
      return;
    }
    const selGroup = groups.find(g => g.id === itemForm.groupId);
    const existingItem = itemForm.id ? erpState.items.find(i => i.id === itemForm.id) : undefined;
    const newItem: ErpItem = {
      id: itemForm.id || `itm_${Date.now()}`,
      code: itemForm.code.trim(),
      name: itemForm.name.trim(),
      category: itemForm.category || 'FINISHED_YARN',
      groupId: itemForm.groupId || '',
      groupName: selGroup?.name || '',
      unit: itemForm.unit || 'کیلوگرم',
      warehouseId: itemForm.warehouseId || erpState.warehouses?.[0]?.id || 'wh_finished',
      stockQty: Number(itemForm.stockQty || 0),
      unitCost: Number(itemForm.unitCost || 0),
      salesPrice: Number(itemForm.salesPrice || 0),
      yarnCount: itemForm.yarnCount || '',
      grade: (itemForm.grade || '') as ErpItem['grade'],
      colorName: itemForm.colorName || '',
      defaultConesPerCarton: existingItem?.defaultConesPerCarton ?? itemForm.defaultConesPerCarton ?? 6,
      cartonWeightGrams: existingItem?.cartonWeightGrams ?? itemForm.cartonWeightGrams ?? 1450,
      coneWeightGrams: existingItem?.coneWeightGrams ?? itemForm.coneWeightGrams ?? 110,
      isActive: itemForm.isActive !== false,
      isTareLocked: existingItem?.isTareLocked ?? Boolean(itemForm.isTareLocked)
    };
    const exists = erpState.items.some(i => i.id === newItem.id);
    const updatedItems = exists ? erpState.items.map(i => i.id === newItem.id ? newItem : i) : [...erpState.items, newItem];
    await persistErpState({ ...erpState, items: updatedItems }, 'کالای تولیدی با موفقیت ذخیره شد');
    setShowAddItemModal(false);
    setItemForm({
      code: '',
      name: '',
      category: 'FINISHED_YARN',
      groupId: '',
      unit: 'کیلوگرم',
      yarnCount: '150/48',
      grade: '',
      colorName: 'سفید خام',
      stockQty: 0,
      unitCost: 1250000,
      salesPrice: 1450000,
      isActive: true
    });
  };

  const handleToggleItemActive = async (item: ErpItem) => {
    const nextActive = item.isActive === false;
    const updatedItems = erpState.items.map(i => i.id === item.id ? { ...i, isActive: nextActive } : i);
    await persistErpState(
      { ...erpState, items: updatedItems },
      nextActive ? `کالای «${item.name}» فعال شد` : `کالای «${item.name}» غیرفعال شد و از لیست توزین خارج گردید`
    );
  };

  const handleDeleteItem = async (item: ErpItem) => {
    if (!confirm(`آیا از حذف کالای «${item.name}» اطمینان دارید؟`)) return;
    const updatedItems = erpState.items.filter(i => i.id !== item.id);
    await persistErpState({ ...erpState, items: updatedItems }, 'کالا با موفقیت حذف شد');
  };

  // -------------------------------------------------------------
  // TAB 3: WEIGHBRIDGE & SEQUENTIAL CARTON WEIGHING & LABEL PRINT
  // -------------------------------------------------------------
  // Step 1: Line Selection
  const [selectedLineId, setSelectedLineId] = useState<string>(activeLines[0]?.id || lines[0]?.id || '');
  // Step 2: Commodity Selection (Active items only)
  const [selectedItemId, setSelectedItemId] = useState<string>(activeYarnItems[0]?.id || '');
  // Step 3: Cones Count
  const [conesCount, setConesCount] = useState<number>(6);
  // Step 4: Tare weights (editable unless locked)
  const [cartonTareGrams, setCartonTareGrams] = useState<number>(1450);
  const [coneTareGrams, setConeTareGrams] = useState<number>(110);
  const [lotNumber, setLotNumber] = useState<string>('L405-88');
  const [shiftName, setShiftName] = useState<string>('شیفت صبح A');
  const [grade, setGrade] = useState<'A' | 'B' | 'C'>('A');

  // Step 5: Gross weight from scale
  const [grossWeightKg, setGrossWeightKg] = useState<number>(25.61);
  const [isScaleReadingLive, setIsScaleReadingLive] = useState<boolean>(false);

  // Label Designer Modal State
  const [showLabelDesignerModal, setShowLabelDesignerModal] = useState<boolean>(false);
  const [designerDraft, setDesignerDraft] = useState<ErpLabelTemplateConfig>(labelTemplate);

  // Keep selected line & selected active item synced if state updates
  useEffect(() => {
    const candidateLines = activeLines.length > 0 ? activeLines : lines;
    if (candidateLines.length === 0) {
      if (selectedLineId) setSelectedLineId('');
    } else if (!candidateLines.some(l => l.id === selectedLineId)) {
      setSelectedLineId(candidateLines[0].id);
    }
  }, [activeLines, lines, selectedLineId]);

  useEffect(() => {
    if (activeYarnItems.length === 0) {
      if (selectedItemId) setSelectedItemId('');
    } else if (!activeYarnItems.some(i => i.id === selectedItemId)) {
      setSelectedItemId(activeYarnItems[0].id);
    }
  }, [activeYarnItems, selectedItemId]);

  const selectedItemObj = useMemo(() => {
    return activeYarnItems.find(i => i.id === selectedItemId) || null;
  }, [activeYarnItems, selectedItemId]);

  const [selectedBomId, setSelectedBomId] = useState<string>('');

  const selectedItemTareSpec = useMemo(() => {
    return resolveItemTareSpec(selectedItemObj, erpState.boms || [], selectedBomId);
  }, [selectedItemObj, erpState.boms, selectedBomId]);

  // Keep selectedBomId synced with matching BOMs of the selected item
  useEffect(() => {
    const matching = selectedItemTareSpec.matchingBoms;
    if (matching.length === 0) {
      if (selectedBomId) setSelectedBomId('');
    } else if (!matching.some(b => b.id === selectedBomId)) {
      setSelectedBomId(selectedItemTareSpec.bom?.id || matching[0].id);
    }
  }, [selectedItemTareSpec.matchingBoms, selectedItemTareSpec.bom, selectedBomId]);

  // Tare weights are locked if the assigned BOM (or legacy item) is locked OR global scale lock is active
  const isTareLocked = Boolean(selectedItemTareSpec.isTareLocked || lockTareWeightsGlobally);
  const isConesLocked = Boolean(selectedItemTareSpec.isTareLocked && lockConesCountGlobally) || lockConesCountGlobally;

  // Auto-populate tare & cones from active BOM (with legacy item fallback) when item/BOM changes
  useEffect(() => {
    const itm = erpState.items.find(i => i.id === selectedItemId);
    if (itm) {
      setConesCount(selectedItemTareSpec.defaultConesPerCarton);
      setCartonTareGrams(selectedItemTareSpec.cartonWeightGrams);
      setConeTareGrams(selectedItemTareSpec.coneWeightGrams);
      if (itm.grade === 'A' || itm.grade === 'B' || itm.grade === 'C') {
        setGrade(itm.grade);
      }
    }
  }, [
    selectedItemId,
    selectedItemTareSpec.defaultConesPerCarton,
    selectedItemTareSpec.cartonWeightGrams,
    selectedItemTareSpec.coneWeightGrams,
    erpState.items,
    isTareLocked
  ]);

  const handleToggleGlobalTareLock = async () => {
    const nextLocked = !lockTareWeightsGlobally;
    await persistErpState(
      {
        ...erpState,
        scaleConfig: {
          ...(erpState.scaleConfig || { lockTareWeightsGlobally: false }),
          lockTareWeightsGlobally: nextLocked
        }
      },
      nextLocked
        ? 'وزن کارتن خالی و وزن دوک روی باسکول برای همه کالاها قفل شد'
        : 'قفل سراسری وزن کارتن و دوک روی باسکول برداشته شد'
    );
  };

  const handleQuickChangeBarcodeType = async (nextType: ErpBarcodeType) => {
    const updatedTemplate: ErpLabelTemplateConfig = {
      ...labelTemplate,
      barcodeType: nextType
    };
    const labelName = nextType === 'LINEAR_1D' ? 'بارکد خطی (قدیمی کارخانه)' : nextType === 'QR_2D' ? 'بارکد دوبعدی QR' : 'ترکیبی (خطی + QR)';
    await persistErpState(
      { ...erpState, labelTemplateConfig: updatedTemplate },
      `نوع بارکد لیبل به «${labelName}» تغییر یافت`
    );
  };

  const handleOpenLabelDesigner = () => {
    setDesignerDraft({
      ...labelTemplate,
      fields: { ...labelTemplate.fields }
    });
    setShowLabelDesignerModal(true);
  };

  const handleSaveLabelTemplate = async () => {
    await persistErpState(
      { ...erpState, labelTemplateConfig: designerDraft },
      'قالب و تنظیمات اختصاصی چاپ لیبل با موفقیت ذخیره شد'
    );
    setShowLabelDesignerModal(false);
  };

  // Net weight auto-calculation:
  // Tare (Kg) = (CartonTare + Cones * ConeTare) / 1000
  // Net (Kg) = Gross - Tare
  const calculatedTareKg = useMemo(() => {
    const grams = cartonTareGrams + conesCount * coneTareGrams;
    return Number((grams / 1000).toFixed(3));
  }, [cartonTareGrams, conesCount, coneTareGrams]);

  const calculatedNetKg = useMemo(() => {
    const net = grossWeightKg - calculatedTareKg;
    return Number(Math.max(0, net).toFixed(3));
  }, [grossWeightKg, calculatedTareKg]);

  // Current Weighing Batch (سلسله کارتن‌های وزن شده در این نوبت)
  const [currentBatchCartons, setCurrentBatchCartons] = useState<ErpCartonLabel[]>([]);
  const [singlePrintCarton, setSinglePrintCarton] = useState<ErpCartonLabel | null>(null);
  const [qrCodeDataUrls, setQrCodeDataUrls] = useState<Record<string, string>>({});
  const [isBatchPrinting, setIsBatchPrinting] = useState<boolean>(false);

  // Generate QR Code data url helper
  const generateCartonQr = async (carton: ErpCartonLabel): Promise<string> => {
    try {
      const payload = `DLKAM-ERP|REF:${carton.referenceCode}|ITEM:${carton.productCode}|LOT:${carton.lotNumber}|NET:${carton.netWeightKg}KG|GROSS:${carton.grossWeightKg}KG|CONES:${carton.conesCount}|DATE:${carton.createdDateJalali}|TIME:${carton.createdTimeExact || '14:00'}`;
      const url = await QRCode.toDataURL(payload, { width: 140, margin: 1 });
      return url;
    } catch {
      return '';
    }
  };

  // Live scale simulated read button
  const handleReadFromScale = () => {
    setIsScaleReadingLive(true);
    setTimeout(() => {
      const base = 25.5;
      const variation = (Math.floor(Math.random() * 40) - 20) / 100;
      setGrossWeightKg(Number((base + variation).toFixed(2)));
      setIsScaleReadingLive(false);
      showToast?.('success', 'وزن ناخالص از ترازو/باسکول با موفقیت خوانده شد');
    }, 300);
  };

  // Add carton to current batch (توزین متوالی)
  const handleAddCartonToBatch = async () => {
    const currentLine = lines.find(l => l.id === selectedLineId);
    const currentItem = erpState.items.find(i => i.id === selectedItemId);
    if (!currentItem) {
      showToast?.('error', 'لطفاً کالای فعال را انتخاب نمایید');
      return;
    }
    if (currentItem.isActive === false) {
      showToast?.('error', 'این کالا غیرفعال است و مجاز به ثبت توزین نمی‌باشد');
      return;
    }

    // Enforce locked tare weights & cones count from active BOM definition (with legacy fallback)
    const tareSpec = resolveItemTareSpec(currentItem, erpState.boms || [], selectedBomId);
    const lockedByBomOrGlobal = Boolean(tareSpec.isTareLocked || lockTareWeightsGlobally);
    const effectiveCartonGrams = lockedByBomOrGlobal ? tareSpec.cartonWeightGrams : cartonTareGrams;
    const effectiveConeGrams = lockedByBomOrGlobal ? tareSpec.coneWeightGrams : coneTareGrams;
    const effectiveConesCount = lockConesCountGlobally ? tareSpec.defaultConesPerCarton : conesCount;
    const effectiveTareKg = Number(((effectiveCartonGrams + effectiveConesCount * effectiveConeGrams) / 1000).toFixed(3));
    const effectiveNetKg = Number(Math.max(0, grossWeightKg - effectiveTareKg).toFixed(3));

    if (grossWeightKg <= effectiveTareKg) {
      showToast?.('error', 'وزن ناخالص باید از مجموع وزن ظرف و دوک‌ها بیشتر باشد');
      return;
    }

    const nextCounter = (erpState.nextSerialCounter || 1000) + currentBatchCartons.length + 1;
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const cleanDateParts = dateToday.replace(/\//g, '').slice(2); // e.g. 050820
    const serialNumber = `SN-${cleanDateParts}-${String(nextCounter).padStart(5, '0')}`;
    const referenceCode = buildCartonReferenceCode(currentLine, nextCounter, effectiveNetKg);
    const qrPayload = `DLKAM-ERP|REF:${referenceCode}|ITEM:${currentItem.code}|LOT:${lotNumber}|NET:${effectiveNetKg}KG|CONES:${effectiveConesCount}|TIME:${exactTime}`;

    // Evaluate active BOM COGM (Cost of Goods Manufactured) using live Weighted Average Cost (WACC)
    const activeBom = tareSpec.bom;
    const cartonCostEval = activeBom
      ? evaluateBomCostAndConsumption({
          bom: activeBom,
          items: erpState.items || [],
          waccMap: itemWaccMap,
          batchNetWeightKg: effectiveNetKg,
          batchCartonsCount: 1,
          batchConesCount: effectiveConesCount,
          fallbackItemUnitCost: Number(currentItem.unitCost || 0)
        })
      : null;
    const effectiveUnitCostPerKg =
      cartonCostEval && cartonCostEval.cogmPerKgRials > 0
        ? cartonCostEval.cogmPerKgRials
        : Number(currentItem.unitCost || 0);
    const effectiveTotalCostRials =
      cartonCostEval && cartonCostEval.batchTotalCogmRials > 0
        ? cartonCostEval.batchTotalCogmRials
        : Math.round(effectiveUnitCostPerKg * effectiveNetKg);

    const newCarton: ErpCartonLabel = {
      id: `carton_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      serialNumber,
      referenceCode,
      qrPayload,
      productId: currentItem.id,
      productCode: currentItem.code,
      productName: currentItem.name,
      yarnCount: currentItem.yarnCount || '150/48',
      colorName: currentItem.colorName || 'سفید خام',
      lotNumber,
      machineCode: currentLine?.name || 'TMT-01',
      shift: shiftName,
      grade,
      grossWeightKg,
      conesCount: effectiveConesCount,
      coneWeightGrams: effectiveConeGrams,
      cartonWeightGrams: effectiveCartonGrams,
      totalTareKg: effectiveTareKg,
      netWeightKg: effectiveNetKg,
      unitCostPerKg: effectiveUnitCostPerKg,
      totalCostRials: effectiveTotalCostRials,
      warehouseId: PRODUCTION_FLOOR_WAREHOUSE_ID,
      status: 'IN_STOCK',
      isSalesLocked: false,
      createdAt: Date.now(),
      createdDateJalali: dateToday,
      createdTimeExact: exactTime,
      createdBy: currentUser?.fullName || 'اپراتور خط تولید',
      productionLineId: selectedLineId,
      productionLineName: currentLine?.name || '',
      barcodeType: labelTemplate.barcodeType,
      history: [
        {
          id: `hist_${Date.now()}`,
          stage: 'PRODUCTION_WEIGHING',
          title: `توزین باسکول خط و ورود خودکار به ${PRODUCTION_FLOOR_WAREHOUSE_NAME}`,
          dateJalali: dateToday,
          timeExact: exactTime,
          actor: currentUser?.fullName || 'اپراتور خط',
          details: `توزین در ${currentLine?.name || 'خط'} | ناخالص: ${grossWeightKg} Kg | خالص: ${effectiveNetKg} Kg | دوک: ${effectiveConesCount} | فی تمام‌شده: ${effectiveUnitCostPerKg.toLocaleString()} ریال | انبار: ${PRODUCTION_FLOOR_WAREHOUSE_NAME}`
        }
      ]
    };

    // Pre-generate QR
    const qrUrl = await generateCartonQr(newCarton);
    setQrCodeDataUrls(prev => ({ ...prev, [newCarton.id]: qrUrl }));
    setCurrentBatchCartons(prev => [newCarton, ...prev]);

    // Prepare next gross weight with slight variation so operator can quickly weigh next
    const nextGross = Number((25.5 + (Math.floor(Math.random() * 30) - 15) / 100).toFixed(2));
    setGrossWeightKg(nextGross);
    showToast?.('success', `کارتن با کد ارجاع ${referenceCode} در بچ جاری ثبت شد`);
  };

  // Batch summary totals
  const batchTotalCartons = currentBatchCartons.length;
  const batchTotalNetWeight = useMemo(() => {
    return Number(currentBatchCartons.reduce((sum, c) => sum + c.netWeightKg, 0).toFixed(3));
  }, [currentBatchCartons]);
  const batchTotalGrossWeight = useMemo(() => {
    return Number(currentBatchCartons.reduce((sum, c) => sum + c.grossWeightKg, 0).toFixed(3));
  }, [currentBatchCartons]);
  const batchTotalCones = useMemo(() => {
    return currentBatchCartons.reduce((sum, c) => sum + (c.conesCount || 0), 0);
  }, [currentBatchCartons]);

  // Live BOM consumption & COGM preview for the current weighing station / batch
  const activeWeighingBom = selectedItemTareSpec.bom;
  const liveBatchOrSingleEval = useMemo(() => {
    if (!activeWeighingBom) return null;
    const targetNetKg = currentBatchCartons.length > 0 ? batchTotalNetWeight : calculatedNetKg;
    const targetCartons = currentBatchCartons.length > 0 ? batchTotalCartons : 1;
    const targetCones = currentBatchCartons.length > 0 ? batchTotalCones : conesCount;
    return evaluateBomCostAndConsumption({
      bom: activeWeighingBom,
      items: erpState.items || [],
      waccMap: itemWaccMap,
      batchNetWeightKg: targetNetKg,
      batchCartonsCount: targetCartons,
      batchConesCount: targetCones
    });
  }, [
    activeWeighingBom,
    erpState.items,
    itemWaccMap,
    currentBatchCartons.length,
    batchTotalNetWeight,
    batchTotalCartons,
    batchTotalCones,
    calculatedNetKg,
    conesCount
  ]);

  // Finalize Batch & Generate Production Voucher with automatic placement in Production Floor Warehouse
  // AND automatic deduction of consumed BOM materials from Production Floor Warehouse (ISSUE_PRODUCTION)
  const handleFinalizeBatchAndIssueVoucher = async () => {
    if (currentBatchCartons.length === 0) {
      showToast?.('error', 'هیچ کارتنی برای ثبت نهایی در این نوبت وزن‌کشی نشده است');
      return;
    }

    const currentLine = lines.find(l => l.id === selectedLineId);
    const currentItem = erpState.items.find(i => i.id === selectedItemId);
    const dateToday = getTodayJalali();
    const exactTime = getExactTimeNow();
    const existingVouchers = erpState.productionVouchers || [];
    const voucherNo = getNextPlainSequentialNumber(existingVouchers.map(v => v.voucherNo), 1);
    const archiveCode = getNextPlainSequentialNumber(existingVouchers.map(v => v.archiveCode), 1001);

    const { warehouses: nextWarehouses, productionWarehouse } = ensureProductionFloorWarehouse(
      erpState.warehouses || [],
      currentUser?.fullName || 'سرپرست تولید'
    );

    const totalConesInBatch = currentBatchCartons.reduce((sum, c) => sum + (c.conesCount || 0), 0);
    const activeBom = selectedItemTareSpec.bom;
    const batchEval = activeBom
      ? evaluateBomCostAndConsumption({
          bom: activeBom,
          items: erpState.items || [],
          waccMap: itemWaccMap,
          batchNetWeightKg: batchTotalNetWeight,
          batchCartonsCount: currentBatchCartons.length,
          batchConesCount: totalConesInBatch,
          fallbackItemUnitCost: Number(currentItem?.unitCost || 0)
        })
      : null;

    const finalUnitCostPerKg =
      batchEval && batchEval.cogmPerKgRials > 0
        ? batchEval.cogmPerKgRials
        : Number(currentItem?.unitCost || 0);
    const finalTotalProductionCost =
      batchEval && batchEval.batchTotalCogmRials > 0
        ? batchEval.batchTotalCogmRials
        : Math.round(finalUnitCostPerKg * batchTotalNetWeight);

    // Stamp cartons with voucher, archive code, calculated COGM, and automatic entry into Production Floor Warehouse
    const finalizedCartons = currentBatchCartons.map(c => ({
      ...c,
      warehouseId: productionWarehouse.id,
      status: 'IN_STOCK' as const,
      isSalesLocked: false,
      productionVoucherNo: voucherNo,
      productionArchiveCode: archiveCode,
      unitCostPerKg: finalUnitCostPerKg,
      totalCostRials: Math.round(c.netWeightKg * finalUnitCostPerKg)
    }));

    // Build automatic ISSUE_PRODUCTION warehouse document to deduct consumed BOM materials from Production Floor Warehouse
    const consumedLines: ErpProductionConsumedLine[] = (batchEval?.components || [])
      .filter(l => l.batchConsumedQty > 0)
      .map(l => ({
        itemId: l.itemId,
        itemCode: l.itemCode,
        itemName: l.itemName,
        unit: l.unit,
        consumptionBasis: l.consumptionBasis,
        consumedQty: l.batchConsumedQty,
        waccUnitCostRials: l.waccUnitCostRials,
        totalCostRials: l.batchTotalCostRials
      }));

    const existingDocs = erpState.warehouseDocuments || [];
    let consumptionDoc: ErpWarehouseDocument | null = null;
    if (consumedLines.length > 0) {
      const nextDocNo = getNextPlainSequentialNumber(existingDocs.map(d => d.docNo), 1);
      const nextDocArchive = getNextPlainSequentialNumber(existingDocs.map(d => d.archiveCode), 5001);
      const docItems: ErpWarehouseDocItemLine[] = consumedLines.map((cl, idx) => ({
        id: `docline_${Date.now()}_${idx}`,
        itemId: cl.itemId,
        itemCode: cl.itemCode,
        itemName: cl.itemName,
        grade: 'A',
        cartonsCount: cl.consumptionBasis === 'PER_CARTON' ? Math.round(cl.consumedQty) : 0,
        grossWeightKg: cl.consumedQty,
        netWeightKg: cl.consumedQty,
        unitCostRials: cl.waccUnitCostRials,
        totalCostRials: cl.totalCostRials,
        notes: `کسر خودکار مصرف تولید سند ${voucherNo} (${currentItem?.name || ''}) طبق فرمول ${activeBom?.code || ''}`
      }));

      consumptionDoc = {
        id: `whdoc_prd_consume_${Date.now()}`,
        docNo: nextDocNo,
        archiveCode: nextDocArchive,
        docType: 'ISSUE_PRODUCTION',
        dateJalali: dateToday,
        timeExact: exactTime,
        createdAtMs: Date.now(),
        sourceWarehouseId: productionWarehouse.id,
        sourceWarehouseName: productionWarehouse.name,
        partyName: `${currentLine?.name || 'خط تولید'} — تولید ${currentItem?.name || ''} (سند تولید ${voucherNo})`,
        productionVoucherId: `prdv_${Date.now()}`,
        cartonIds: [],
        cartonsCount: 0,
        totalGrossWeightKg: Number(consumedLines.reduce((s, x) => s + x.consumedQty, 0).toFixed(3)),
        totalNetWeightKg: Number(consumedLines.reduce((s, x) => s + x.consumedQty, 0).toFixed(3)),
        totalCostRials: consumedLines.reduce((s, x) => s + x.totalCostRials, 0),
        status: 'COMPLETED',
        createdBy: currentUser?.fullName || 'سیستم اتوماتیک تولید (BOM)',
        notes: `حواله مصرف خودکار خط تولید بابت تولید ${batchTotalNetWeight} کیلوگرم (${finalizedCartons.length} کارتن / ${totalConesInBatch} دوک) محصول «${currentItem?.name || ''}» بر اساس فرمول ساخت ${activeBom?.code || ''} (${activeBom?.title || ''}) به نرخ میانگین موزون انبار`,
        docItems
      };
    }

    // Update item stocks & Weighted Average Cost of finished product in erpState.items
    const consumedByItemId = new Map<string, number>();
    for (const cl of consumedLines) {
      if (cl.itemId) {
        consumedByItemId.set(cl.itemId, (consumedByItemId.get(cl.itemId) || 0) + cl.consumedQty);
      }
    }

    const updatedItems = (erpState.items || []).map(itm => {
      let nextStock = Number(itm.stockQty || 0);
      let nextUnitCost = Number(itm.unitCost || 0);

      // If this item is the finished product being produced: update its stock and WACC unitCost
      if (itm.id === selectedItemId) {
        const oldStock = Math.max(0, nextStock);
        const oldCost = Math.max(0, nextUnitCost);
        const addedKg = batchTotalNetWeight;
        if (addedKg > 0 && finalUnitCostPerKg > 0) {
          nextUnitCost = Math.round(
            (oldStock * oldCost + addedKg * finalUnitCostPerKg) / (oldStock + addedKg)
          );
        }
        nextStock = Number((nextStock + addedKg).toFixed(3));
      }

      // If this item was consumed as a BOM component: deduct from its stockQty
      const consumedQty = consumedByItemId.get(itm.id);
      if (consumedQty && consumedQty > 0) {
        nextStock = Number((nextStock - consumedQty).toFixed(3));
      }

      if (nextStock !== itm.stockQty || nextUnitCost !== itm.unitCost) {
        return {
          ...itm,
          stockQty: nextStock,
          unitCost: nextUnitCost
        };
      }
      return itm;
    });

    const newVoucher: ErpProductionVoucher = {
      id: `prdv_${Date.now()}`,
      voucherNo,
      archiveCode,
      dateJalali: dateToday,
      timeExact: exactTime,
      lineId: selectedLineId,
      lineName: currentLine?.name || '',
      itemId: selectedItemId,
      itemCode: currentItem?.code || '',
      itemName: currentItem?.name || '',
      cartonsCount: finalizedCartons.length,
      totalGrossWeightKg: batchTotalGrossWeight,
      totalTareKg: Number((batchTotalGrossWeight - batchTotalNetWeight).toFixed(3)),
      totalNetWeightKg: batchTotalNetWeight,
      operatorName: currentUser?.fullName || 'اپراتور خط تولید',
      cartonIds: finalizedCartons.map(c => c.id),
      status: 'IN_PRODUCTION_WAREHOUSE',
      productionWarehouseId: productionWarehouse.id,
      bomId: activeBom?.id,
      bomCode: activeBom?.code,
      bomTitle: activeBom?.title,
      consumptionDocId: consumptionDoc?.id,
      consumptionDocNo: consumptionDoc?.docNo,
      consumedMaterials: consumedLines,
      rawMaterialsCostRials: batchEval?.batchRawMaterialsCostRials ?? 0,
      directLaborCostRials: batchEval?.batchDirectLaborCostRials ?? 0,
      factoryOverheadCostRials: batchEval?.batchFactoryOverheadCostRials ?? 0,
      unitCostPerKgRials: finalUnitCostPerKg,
      totalProductionCostRials: finalTotalProductionCost,
      notes: `تولید نوبت ${shiftName} در ${currentLine?.name} — ورود خودکار به ${productionWarehouse.name}${
        consumptionDoc
          ? ` | کسر خودکار مواد مصرفی طی حواله مصرف شماره ${consumptionDoc.docNo} | بهای تمام‌شده هر کیلو: ${finalUnitCostPerKg.toLocaleString()} ریال`
          : ''
      }`
    };

    const nextState: IndustrialErpState = {
      ...erpState,
      warehouses: nextWarehouses,
      items: updatedItems,
      cartonLabels: [...finalizedCartons, ...erpState.cartonLabels],
      productionVouchers: [newVoucher, ...(erpState.productionVouchers || [])],
      warehouseDocuments: consumptionDoc ? [consumptionDoc, ...existingDocs] : existingDocs,
      nextSerialCounter: (erpState.nextSerialCounter || 1000) + finalizedCartons.length
    };

    await persistErpState(
      nextState,
      consumptionDoc
        ? `سند تولید ${voucherNo} ثبت شد؛ مواد مصرفی طبق فرمول (${activeBom?.code}) از «${productionWarehouse.name}» کسر و بهای تمام‌شده (${finalUnitCostPerKg.toLocaleString()} ریال/کیلو) محاسبه گردید.`
        : `سند تولید ${voucherNo} (${finalizedCartons.length} کارتن) ثبت و موجودی وارد «${productionWarehouse.name}» شد.`
    );
    setCurrentBatchCartons([]);
  };

  // -------------------------------------------------------------
  // TAB 4: PRODUCTION ARCHIVE
  // -------------------------------------------------------------
  const [selectedVoucherForView, setSelectedVoucherForView] = useState<ErpProductionVoucher | null>(null);
  const [archiveSearch, setArchiveSearch] = useState<string>('');
  const [archiveGradeFilter, setArchiveGradeFilter] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');

  const vouchersList = useMemo(() => {
    return erpState.productionVouchers || [];
  }, [erpState.productionVouchers]);

  const getVoucherCartons = (v: ErpProductionVoucher): ErpCartonLabel[] => {
    const idSet = new Set(v.cartonIds || []);
    return (erpState.cartonLabels || []).filter(
      c => idSet.has(c.id) || c.productionVoucherNo === v.voucherNo
    );
  };

  const filteredVouchers = useMemo(() => {
    return vouchersList.filter(v => {
      const linkedCartons = getVoucherCartons(v);
      const itemObj = erpState.items.find(i => i.id === v.itemId || i.code === v.itemCode);
      if (archiveGradeFilter !== 'ALL') {
        const hasGrade = linkedCartons.length > 0
          ? linkedCartons.some(c => (c.grade || itemObj?.grade || '') === archiveGradeFilter)
          : (itemObj?.grade || '') === archiveGradeFilter;
        if (!hasGrade) return false;
      }
      if (!archiveSearch.trim()) return true;
      const statusText =
        v.status === 'DELIVERED_TO_WAREHOUSE'
          ? 'رسید شده در انبار مقصد'
          : v.status === 'PENDING_RECEIPT'
          ? 'تحویل صادر شده (در انتظار رسید انبار)'
          : 'موجود در انبار تولید (آماده تحویل به انبار)';
      const cartonFields: unknown[] = [];
      for (const c of linkedCartons) {
        cartonFields.push(
          c.referenceCode,
          c.serialNumber,
          c.lotNumber,
          c.machineCode,
          c.productCode,
          c.productName,
          c.yarnCount,
          c.colorName,
          c.grade,
          c.shift,
          c.netWeightKg,
          c.grossWeightKg,
          c.qrPayload,
          c.createdBy,
          c.productionArchiveCode
        );
      }
      return matchesSearchQuery(archiveSearch, [
        v.voucherNo,
        v.archiveCode,
        v.lineName,
        v.itemName,
        v.itemCode,
        v.operatorName,
        v.deliveredWarehouseName,
        v.deliveredDocNo,
        v.dateJalali,
        v.timeExact,
        v.notes,
        v.cartonsCount,
        v.totalNetWeightKg,
        v.totalGrossWeightKg,
        statusText,
        ...cartonFields
      ]);
    });
  }, [vouchersList, erpState.cartonLabels, erpState.items, archiveSearch, archiveGradeFilter]);

  // -------------------------------------------------------------
  // TAB 5: COMPREHENSIVE BOM MANAGEMENT & COST ENGINE
  // -------------------------------------------------------------
  const finishedYarns = useMemo(() => erpState.items.filter(i => i.category === 'FINISHED_YARN'), [erpState.items]);
  const bomAssignableItems = useMemo(() => {
    const list = erpState.items.filter(i => i.category === 'FINISHED_YARN' || i.category === 'RAW_MATERIAL');
    return [...list].sort((a, b) => {
      if (a.category === b.category) return (a.code || '').localeCompare(b.code || '');
      return a.category === 'FINISHED_YARN' ? -1 : 1;
    });
  }, [erpState.items]);
  const allBoms = useMemo(() => erpState.boms || [], [erpState.boms]);

  const [bomSearch, setBomSearch] = useState<string>('');
  const [bomProductFilter, setBomProductFilter] = useState<string>('ALL');
  const [bomModalItemSearch, setBomModalItemSearch] = useState<string>('');
  const [showAddEditBomModal, setShowAddEditBomModal] = useState<boolean>(false);
  const [editingBom, setEditingBom] = useState<Partial<ErpBom> | null>(null);
  const [showSimulationModal, setShowSimulationModal] = useState<boolean>(false);
  const [simulationBom, setSimulationBom] = useState<ErpBom | null>(null);
  const [simulationBatchQtyKg, setSimulationBatchQtyKg] = useState<number>(5000);

  const getBomAssignedItemsList = (bom: Partial<ErpBom>): ErpItem[] => {
    const ids = getBomFinishedItemIds(bom);
    return ids
      .map(id => erpState.items.find(i => i.id === id))
      .filter((x): x is ErpItem => Boolean(x));
  };

  // Filtered BOMs list
  const filteredBoms = useMemo(() => {
    return allBoms.filter(b => {
      const assignedIds = getBomFinishedItemIds(b);
      const assignedItems = assignedIds
        .map(id => erpState.items.find(i => i.id === id))
        .filter((x): x is ErpItem => Boolean(x));
      const matchSearch =
        !bomSearch.trim() ||
        matchesSearchQuery(bomSearch, [
          b.code,
          b.title,
          b.finishedItemName,
          b.finishedItemCode,
          ...(b.finishedItemNames || []),
          ...(b.finishedItemCodes || []),
          ...assignedItems.flatMap(i => [i.code, i.name, i.yarnCount, i.colorName])
        ]);
      const matchProduct =
        bomProductFilter === 'ALL' || assignedIds.includes(bomProductFilter);
      return matchSearch && matchProduct;
    });
  }, [allBoms, erpState.items, bomSearch, bomProductFilter]);

  // All defined items that can be used as BOM components (prioritizing RAW_MATERIAL and PACKAGING first)
  const bomComponentCandidateItems = useMemo(() => {
    const list = [...(erpState.items || [])];
    const orderRank = (cat?: string) => {
      if (cat === 'RAW_MATERIAL') return 1;
      if (cat === 'PACKAGING') return 2;
      if (cat === 'WASTE') return 3;
      return 4;
    };
    return list.sort((a, b) => {
      const rA = orderRank(a.category);
      const rB = orderRank(b.category);
      if (rA !== rB) return rA - rB;
      return (a.code || '').localeCompare(b.code || '');
    });
  }, [erpState.items]);

  const handleOpenAddBom = () => {
    const preselectedIds = bomProductFilter !== 'ALL' ? [bomProductFilter] : [];
    const primaryProduct = preselectedIds.length > 0 ? erpState.items.find(i => i.id === preselectedIds[0]) : undefined;

    // Try to pre-populate default components from actual defined items in the system if available
    const rawCandidate = bomComponentCandidateItems.find(i => i.category === 'RAW_MATERIAL');
    const packCandidate = bomComponentCandidateItems.find(i => i.category === 'PACKAGING');

    const defaultComponents: ErpBomComponent[] = [];
    if (rawCandidate) {
      const wacc = itemWaccMap.get(rawCandidate.id)?.waccUnitCostRials ?? Number(rawCandidate.unitCost || 0);
      defaultComponents.push({
        id: `cmp_${Date.now()}_1`,
        itemId: rawCandidate.id,
        itemCode: rawCandidate.code,
        itemName: rawCandidate.name,
        category: 'RAW_MATERIAL',
        consumptionBasis: 'PERCENT_OF_NET',
        consumptionPercent: 98.5,
        qtyPerKgOutput: 0.985,
        unit: rawCandidate.unit || 'کیلوگرم',
        unitCostRials: wacc,
        wastePercent: 2.5,
        totalCostRials: Math.round(0.985 * 1.025 * wacc)
      });
    }
    if (packCandidate) {
      const wacc = itemWaccMap.get(packCandidate.id)?.waccUnitCostRials ?? Number(packCandidate.unitCost || 0);
      defaultComponents.push({
        id: `cmp_${Date.now()}_2`,
        itemId: packCandidate.id,
        itemCode: packCandidate.code,
        itemName: packCandidate.name,
        category: 'PACKAGING',
        consumptionBasis: 'PER_CARTON',
        qtyPerKgOutput: 1,
        unit: packCandidate.unit || 'عدد',
        unitCostRials: wacc,
        wastePercent: 0,
        totalCostRials: Math.round((1 / 23.5) * wacc)
      });
    }

    const newBom: Partial<ErpBom> = {
      code: `BOM-${String(allBoms.length + 1).padStart(3, '0')}`,
      title: primaryProduct ? `فرمول استاندارد تولید ${primaryProduct.name}` : 'فرمول ساخت نخ تکسچره',
      finishedItemId: primaryProduct?.id || '',
      finishedItemCode: primaryProduct?.code || '',
      finishedItemName: primaryProduct?.name || '',
      finishedItemIds: preselectedIds,
      finishedItemCodes: primaryProduct ? [primaryProduct.code] : [],
      finishedItemNames: primaryProduct ? [primaryProduct.name] : [],
      defaultConesPerCarton: primaryProduct?.defaultConesPerCarton ?? 6,
      cartonWeightGrams: primaryProduct?.cartonWeightGrams ?? 1450,
      coneWeightGrams: primaryProduct?.coneWeightGrams ?? 110,
      isTareLocked: Boolean(primaryProduct?.isTareLocked),
      version: 'V1.0',
      wastePercent: 2.5,
      directLaborPerKg: 155000,
      factoryOverheadPerKg: 185000,
      status: 'ACTIVE',
      components: defaultComponents
    };
    setBomModalItemSearch('');
    setEditingBom(newBom);
    setShowAddEditBomModal(true);
  };

  const handleOpenEditBom = (bom: ErpBom) => {
    const assignedIds = getBomFinishedItemIds(bom);
    const primaryItem = assignedIds.length > 0 ? erpState.items.find(i => i.id === assignedIds[0]) : undefined;
    const cloned: Partial<ErpBom> = JSON.parse(JSON.stringify(bom));
    cloned.finishedItemIds = assignedIds;
    cloned.defaultConesPerCarton = bom.defaultConesPerCarton ?? primaryItem?.defaultConesPerCarton ?? 6;
    cloned.cartonWeightGrams = bom.cartonWeightGrams ?? primaryItem?.cartonWeightGrams ?? 1450;
    cloned.coneWeightGrams = bom.coneWeightGrams ?? primaryItem?.coneWeightGrams ?? 110;
    cloned.isTareLocked = bom.isTareLocked !== undefined ? Boolean(bom.isTareLocked) : Boolean(primaryItem?.isTareLocked);
    // Resolve any component that wasn't yet linked by itemId to a defined item & refresh live WACC if unitCostRials is 0
    cloned.components = (cloned.components || []).map(comp => {
      const matched = resolveComponentDefinedItem(comp, erpState.items || []);
      const waccInfo = matched ? itemWaccMap.get(matched.id) : undefined;
      const effectiveCost =
        waccInfo && waccInfo.waccUnitCostRials > 0
          ? waccInfo.waccUnitCostRials
          : Number(comp.unitCostRials || matched?.unitCost || 0);
      return {
        ...comp,
        itemId: matched?.id || comp.itemId,
        itemCode: matched?.code || comp.itemCode,
        itemName: matched?.name || comp.itemName,
        unit: matched?.unit || comp.unit || 'کیلوگرم',
        consumptionBasis: comp.consumptionBasis || 'PER_KG_NET',
        consumptionPercent:
          comp.consumptionBasis === 'PERCENT_OF_NET'
            ? comp.consumptionPercent ?? Number(((comp.qtyPerKgOutput || 0) * 100).toFixed(2))
            : comp.consumptionPercent,
        unitCostRials: effectiveCost
      };
    });
    setBomModalItemSearch('');
    setEditingBom(cloned);
    setShowAddEditBomModal(true);
  };

  const handleDuplicateBom = async (sourceBom: ErpBom) => {
    const assignedIds = getBomFinishedItemIds(sourceBom);
    const newBom: ErpBom = {
      ...sourceBom,
      id: `bom_${Date.now()}`,
      code: `${sourceBom.code || 'BOM'}-V2`,
      title: `${sourceBom.title || sourceBom.finishedItemName} (نسخه کپی)`,
      finishedItemIds: assignedIds,
      version: 'V2.0',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const nextBoms = [...allBoms, newBom];
    await persistErpState({ ...erpState, boms: nextBoms }, 'نسخه جدید فرمول ساخت با موفقیت ایجاد گردید');
  };

  const handleToggleBomTareLock = async (bom: ErpBom) => {
    const nextLock = !bom.isTareLocked;
    const nextBoms = allBoms.map(b =>
      b.id === bom.id
        ? {
            ...b,
            isTareLocked: nextLock,
            defaultConesPerCarton: b.defaultConesPerCarton ?? 6,
            cartonWeightGrams: b.cartonWeightGrams ?? 1450,
            coneWeightGrams: b.coneWeightGrams ?? 110,
            updatedAt: Date.now()
          }
        : b
    );
    await persistErpState(
      { ...erpState, boms: nextBoms },
      nextLock
        ? `وزن دوک و کارتن فرمول «${bom.title || bom.code}» قفل شد`
        : `قفل وزن دوک و کارتن فرمول «${bom.title || bom.code}» باز شد`
    );
  };

  const handleDeleteBom = async (bomId: string) => {
    if (!confirm('آیا از حذف این فرمول ساخت اطمینان دارید؟')) return;
    const nextBoms = allBoms.filter(b => b.id !== bomId);
    await persistErpState({ ...erpState, boms: nextBoms }, 'فرمول ساخت با موفقیت حذف گردید');
  };

  const handleAddComponentToEditingBom = () => {
    if (!editingBom) return;
    const firstDefined = bomComponentCandidateItems[0];
    const wacc = firstDefined ? itemWaccMap.get(firstDefined.id)?.waccUnitCostRials ?? Number(firstDefined.unitCost || 0) : 0;
    const defaultCategory: ErpBomComponent['category'] =
      firstDefined?.category === 'PACKAGING'
        ? 'PACKAGING'
        : 'RAW_MATERIAL';
    const defaultBasis: ErpBomConsumptionBasis =
      firstDefined?.category === 'PACKAGING' ? 'PER_CARTON' : 'PER_KG_NET';

    const newComp: ErpBomComponent = {
      id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      itemId: firstDefined?.id || '',
      itemCode: firstDefined?.code || '',
      itemName: firstDefined?.name || '',
      category: defaultCategory,
      consumptionBasis: defaultBasis,
      consumptionPercent: undefined,
      qtyPerKgOutput: 1,
      unit: firstDefined?.unit || 'کیلوگرم',
      unitCostRials: wacc,
      wastePercent: 0,
      totalCostRials: wacc
    };
    setEditingBom({
      ...editingBom,
      components: [...(editingBom.components || []), newComp]
    });
  };

  const handleSelectDefinedItemForComponent = (idx: number, selectedItemIdForComp: string) => {
    if (!editingBom || !editingBom.components) return;
    const matched = (erpState.items || []).find(i => i.id === selectedItemIdForComp);
    if (!matched) {
      handleUpdateComponentInEditingBom(idx, { itemId: '', itemCode: '' });
      return;
    }
    const waccInfo = itemWaccMap.get(matched.id);
    const liveWacc = waccInfo ? waccInfo.waccUnitCostRials : Number(matched.unitCost || 0);
    const mappedCat: ErpBomComponent['category'] =
      matched.category === 'PACKAGING'
        ? 'PACKAGING'
        : matched.category === 'RAW_MATERIAL'
        ? 'RAW_MATERIAL'
        : 'AUXILIARY';
    const currentComp = editingBom.components[idx];
    const suggestedBasis: ErpBomConsumptionBasis =
      currentComp?.consumptionBasis ||
      (matched.category === 'PACKAGING'
        ? matched.name.includes('دوک')
          ? 'PER_CONE'
          : 'PER_CARTON'
        : 'PER_KG_NET');

    handleUpdateComponentInEditingBom(idx, {
      itemId: matched.id,
      itemCode: matched.code,
      itemName: matched.name,
      unit: matched.unit || 'کیلوگرم',
      category: mappedCat,
      consumptionBasis: suggestedBasis,
      unitCostRials: liveWacc
    });
  };

  const handleSyncEditingBomWithWarehouseWacc = () => {
    if (!editingBom || !editingBom.components) return;
    const nextComps = editingBom.components.map(comp => {
      const matched = resolveComponentDefinedItem(comp, erpState.items || []);
      if (!matched) return comp;
      const waccInfo = itemWaccMap.get(matched.id);
      const liveWacc = waccInfo ? waccInfo.waccUnitCostRials : Number(matched.unitCost || 0);
      return {
        ...comp,
        itemId: matched.id,
        itemCode: matched.code,
        itemName: matched.name,
        unit: matched.unit || comp.unit,
        unitCostRials: liveWacc
      };
    });
    setEditingBom({ ...editingBom, components: nextComps });
    showToast?.('success', 'نرخ تمامی اجزای فرمول از میانگین موزون لحظه‌ای انبار (WACC) بروزرسانی شد');
  };

  const handleUpdateComponentInEditingBom = (idx: number, updates: Partial<ErpBomComponent>) => {
    if (!editingBom || !editingBom.components) return;
    const nextComps = [...editingBom.components];
    const target = { ...nextComps[idx], ...updates };
    const basis: ErpBomConsumptionBasis = target.consumptionBasis || 'PER_KG_NET';
    if (basis === 'PERCENT_OF_NET') {
      const pct = Number(target.consumptionPercent ?? (target.qtyPerKgOutput || 0) * 100);
      target.consumptionPercent = pct;
      target.qtyPerKgOutput = Number((pct / 100).toFixed(6));
    }
    const wasteFactor = 1 + Math.max(0, Number(target.wastePercent || 0)) / 100;
    const conesPerCarton = Math.max(1, Number(editingBom.defaultConesPerCarton ?? 6));
    const stdCartonNetKg = 23.5;
    let effectiveQtyPerKg = Number(target.qtyPerKgOutput || 0) * wasteFactor;
    if (basis === 'PERCENT_OF_NET') {
      effectiveQtyPerKg = (Number(target.consumptionPercent || 0) / 100) * wasteFactor;
    } else if (basis === 'PER_CARTON') {
      effectiveQtyPerKg = (Number(target.qtyPerKgOutput || 0) * wasteFactor) / stdCartonNetKg;
    } else if (basis === 'PER_CONE') {
      effectiveQtyPerKg = (Number(target.qtyPerKgOutput || 0) * conesPerCarton * wasteFactor) / stdCartonNetKg;
    }
    const unitCost = Number(target.unitCostRials || 0);
    target.totalCostRials = Math.round(effectiveQtyPerKg * unitCost);
    nextComps[idx] = target;
    setEditingBom({ ...editingBom, components: nextComps });
  };

  const handleRemoveComponentFromEditingBom = (idx: number) => {
    if (!editingBom || !editingBom.components) return;
    const nextComps = editingBom.components.filter((_, i) => i !== idx);
    setEditingBom({ ...editingBom, components: nextComps });
  };

  const handleSaveBom = async () => {
    if (!editingBom?.title?.trim() || !editingBom?.code?.trim()) {
      showToast?.('error', 'لطفاً کد و عنوان فرمول ساخت (BOM) را وارد نمایید');
      return;
    }
    const comps = (editingBom.components || []).filter(c => (c.itemName || '').trim() || c.itemId);
    if (comps.length === 0) {
      showToast?.('error', 'لطفاً حداقل یک کالای مصرفی از کالاهای تعریف‌شده سیستم به فرمول اضافه نمایید');
      return;
    }
    const evalResult = evaluateBomCostAndConsumption({
      bom: editingBom,
      items: erpState.items || [],
      waccMap: itemWaccMap,
      batchNetWeightKg: 23.5,
      batchCartonsCount: 1,
      batchConesCount: Math.max(1, Number(editingBom.defaultConesPerCarton ?? 6))
    });
    const totalMaterialsCost = evalResult.rawMaterialsCostPerKgRials;
    const labor = evalResult.directLaborPerKgRials;
    const overhead = evalResult.factoryOverheadPerKgRials;
    const totalCostPerKg = evalResult.cogmPerKgRials;

    // Normalize components with their evaluated totalCostRials per 1 kg output
    const normalizedComps: ErpBomComponent[] = comps.map((c, idx) => {
      const lineEval = evalResult.components[idx];
      return {
        ...c,
        itemId: lineEval?.itemId || c.itemId,
        itemCode: lineEval?.itemCode || c.itemCode,
        itemName: lineEval?.itemName || c.itemName,
        unit: lineEval?.unit || c.unit,
        unitCostRials: lineEval?.waccUnitCostRials ?? c.unitCostRials,
        totalCostRials: lineEval?.costPerKgOutputRials ?? c.totalCostRials
      };
    });

    const selectedIds = Array.from(new Set(getBomFinishedItemIds(editingBom)));
    const selectedProducts = selectedIds
      .map(id => erpState.items.find(i => i.id === id))
      .filter((x): x is ErpItem => Boolean(x));
    const primaryProduct = selectedProducts[0];

    const savedBom: ErpBom = {
      id: editingBom.id || `bom_${Date.now()}`,
      code: editingBom.code.trim(),
      title: editingBom.title.trim(),
      finishedItemId: selectedIds[0] || '',
      finishedItemCode: primaryProduct?.code || editingBom.finishedItemCode || '',
      finishedItemName:
        selectedProducts.length > 0
          ? selectedProducts.map(p => p.name).join('، ')
          : editingBom.finishedItemName?.trim() || 'فرمول عمومی تولید',
      finishedItemIds: selectedIds,
      finishedItemCodes: selectedProducts.map(p => p.code),
      finishedItemNames: selectedProducts.map(p => p.name),
      defaultConesPerCarton: Math.max(1, Number(editingBom.defaultConesPerCarton ?? 6)),
      cartonWeightGrams: Math.max(0, Number(editingBom.cartonWeightGrams ?? 1450)),
      coneWeightGrams: Math.max(0, Number(editingBom.coneWeightGrams ?? 110)),
      isTareLocked: Boolean(editingBom.isTareLocked),
      version: editingBom.version || 'V1.0',
      wastePercent: Number(editingBom.wastePercent || 0),
      directLaborPerKg: labor,
      factoryOverheadPerKg: overhead,
      components: normalizedComps,
      totalRawMaterialsCostPerKg: totalMaterialsCost,
      totalCostPerKg: totalCostPerKg,
      status: (editingBom.status as any) || 'ACTIVE',
      updatedAt: Date.now(),
      createdAt: editingBom.createdAt || Date.now(),
      createdBy: currentUser?.fullName || 'مدیر فنی',
      notes: editingBom.notes || ''
    };

    const exists = allBoms.some(b => b.id === savedBom.id);
    const nextBoms = exists
      ? allBoms.map(b => (b.id === savedBom.id ? savedBom : b))
      : [...allBoms, savedBom];

    // Also update the base unitCost of assigned finished products if their unitCost was not yet set or to reflect BOM COGM
    const assignedSet = new Set(selectedIds);
    const nextItems = (erpState.items || []).map(itm => {
      if (assignedSet.has(itm.id) && totalCostPerKg > 0) {
        return { ...itm, unitCost: totalCostPerKg };
      }
      return itm;
    });

    await persistErpState(
      { ...erpState, boms: nextBoms, items: nextItems },
      `فرمول ساخت (${savedBom.code}) با بهای تمام‌شده میانگین موزون ${totalCostPerKg.toLocaleString()} ریال/کیلو ذخیره شد`
    );
    setShowAddEditBomModal(false);
    setEditingBom(null);
  };

  // Offline Thermal & Document Print Helper (hidden iframe - avoids window.open popup blockers & preserves Tailwind + SVG)
  const handlePrintElement = (id: string, isThermalLabel = false) => {
    const el = document.getElementById(id);
    if (!el) return;

    const existingFrame = document.getElementById('erp-hidden-print-frame') as HTMLIFrameElement | null;
    if (existingFrame) existingFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'erp-hidden-print-frame';
    iframe.className = 'fixed -top-[9999px] -left-[9999px] w-0 h-0 opacity-0 pointer-events-none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const headStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(node => node.outerHTML)
      .join('\n');

    const pageRule = isThermalLabel
      ? `@page { size: ${labelTemplate.labelWidthMm || 100}mm ${labelTemplate.labelHeightMm || 70}mm; margin: 2mm; }`
      : `@page { size: auto; margin: 10mm; }`;

    doc.open();
    doc.write(`
      <!doctype html>
      <html dir="rtl" lang="fa">
        <head>
          <meta charset="utf-8" />
          <title>چاپ صنعتی کارخانه</title>
          ${headStyles}
          <style>
            ${pageRule}
            html, body {
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: Tahoma, 'Vazirmatn', sans-serif !important;
              margin: 0 !important;
              padding: ${isThermalLabel ? '0' : '8px'} !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .label-card {
              break-inside: avoid;
              page-break-inside: avoid;
              ${isThermalLabel ? `width: 100%; box-sizing: border-box; margin-bottom: 4mm;` : 'margin-bottom: 12px;'}
            }
            ${isThermalLabel ? `.label-card:not(:last-child) { page-break-after: always; break-after: page; }` : ''}
          </style>
        </head>
        <body>${el.innerHTML}</body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      }
      setTimeout(() => {
        iframe.remove();
      }, 1500);
    }, 300);
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-transparent overflow-hidden">
      {/* --------------------------------------------------------------------------------- */}
      {/* 1. SUBVIEW: PRD_LINES (تعریف خطوط تولید) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_lines' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Factory className="w-5 h-5 text-orange-600" />
                تعریف خطوط تولید و ماشین‌آلات کارخانه
              </h2>
              <p className="text-xs text-slate-500 mt-1">مدیریت خطوط فعال، کدینگ ماشین‌آلات، سرپرست شیفت و مشخصات فنی</p>
            </div>
            <button
              onClick={() => {
                setLineForm({ code: `PL-0${lines.length + 1}`, name: '', machineType: '', supervisorName: currentUser?.fullName || '', isActive: true, notes: '' });
                setShowAddLineModal(true);
              }}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={16} />
              تعریف خط تولید جدید
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 border border-orange-200 dark:border-orange-800 flex items-center justify-center mx-auto">
                <Factory size={28} />
              </div>
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                هیچ خط تولیدی برای این شرکت تعریف نشده است
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                دیتابیس در وضعیت کاملاً خام قرار دارد. جهت شروع عملیات ثبت توزین و رهگیری کارتن‌ها، اولین خط تولید کارخانه را اضافه فرمایید.
              </p>
              <button
                onClick={() => {
                  setLineForm({ code: 'PL-01', name: '', machineType: '', supervisorName: currentUser?.fullName || '', isActive: true, notes: '' });
                  setShowAddLineModal(true);
                }}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus size={15} />
                <span>تعریف اولین خط تولید</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {lines.map(line => (
                <div key={line.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-600 border border-orange-200 dark:border-orange-800">
                          {line.code}
                        </span>
                        <span
                          className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border border-indigo-200 dark:border-indigo-800"
                          title="پیشوند کد ارجاع کارتن‌های این خط"
                        >
                          کد: {deriveLineReferencePrefix(line.name, line.code, line.referencePrefix)}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${line.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {line.isActive ? 'فعال در خط' : 'غیرفعال'}
                      </span>
                    </div>
                    <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 mb-1">{line.name}</h3>
                    <div className="text-xs text-slate-500 space-y-1 mb-3">
                      <div>نوع تکنولوژی: <span className="font-bold text-slate-700 dark:text-slate-300">{line.machineType || '—'}</span></div>
                      <div>سرپرست: <span className="font-bold text-slate-700 dark:text-slate-300">{line.supervisorName || '—'}</span></div>
                      {line.notes && <div className="text-[11px] text-slate-400">{line.notes}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setLineForm(line);
                        setShowAddLineModal(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                      title="ویرایش"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteLine(line.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                      title="حذف"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 2. SUBVIEW: PRD_ITEMS (نمای درختی سلسله‌مراتبی کالاها و گروه‌ها + فعال/غیرفعال + قفل وزن) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_items' && (() => {
        const currentPath = getGroupPath(selectedGroupId);
        const currentSelectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId) || null : null;

        const renderTreeBranch = (parentId: string | null, depth: number): React.ReactNode => {
          const branchGroups = groups.filter(g => (g.parentId || null) === parentId);
          if (branchGroups.length === 0) return null;

          return (
            <div className={depth > 0 ? 'mr-3 pr-2 border-r border-slate-200 dark:border-slate-700 space-y-1 mt-1' : 'space-y-1'}>
              {branchGroups.map(g => {
                const children = groups.filter(ch => (ch.parentId || null) === g.id);
                const hasChildren = children.length > 0;
                const isExpanded = Boolean(expandedGroupIds[g.id]);
                const isSelected = selectedGroupId === g.id;
                const descIds = new Set(getDescendantGroupIds(g.id));
                const totalBranchItems = erpState.items.filter(i => i.groupId && descIds.has(i.groupId)).length;

                return (
                  <div key={g.id}>
                    <div
                      className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 font-black'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-bold'
                      }`}
                    >
                      <div
                        className="flex items-center gap-1.5 flex-1 min-w-0"
                        onClick={() => {
                          setSelectedGroupId(g.id);
                          setExpandedGroupIds(prev => ({ ...prev, [g.id]: true }));
                        }}
                      >
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleGroupExpand(g.id);
                          }}
                          className={`p-0.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 ${hasChildren ? 'opacity-100' : 'opacity-20'}`}
                          title={isExpanded ? 'بستن شاخه' : 'باز کردن زیرگروه‌ها'}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronLeft size={13} />}
                        </button>
                        {isExpanded || isSelected ? (
                          <FolderOpen size={15} className={isSelected ? 'text-orange-600 shrink-0' : 'text-amber-500 shrink-0'} />
                        ) : (
                          <Folder size={15} className="text-amber-500 shrink-0" />
                        )}
                        <span className="truncate">{g.name}</span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">({totalBranchItems})</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            openCreateGroupAt(g.id);
                          }}
                          className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-600"
                          title="افزودن زیرگروه در این شاخه"
                        >
                          <FolderPlus size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setGroupForm(g);
                            setShowAddGroupModal(true);
                          }}
                          className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 text-slate-400 hover:text-blue-600"
                          title="ویرایش گروه"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    </div>
                    {isExpanded && hasChildren && renderTreeBranch(g.id, depth + 1)}
                  </div>
                );
              })}
            </div>
          );
        };

        return (
          <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-orange-600" />
                  تعریف درختی کالاها، زیرگروه‌ها و وضعیت فعال/غیرفعال
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  تعریف سلسله‌مراتبی کالاها بدون اجبار به تعیین درجه (تعیین درجه هنگام تولید و لیبل، و تنظیم وزن دوک و کارتن در فرمول تولید BOM)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCreateGroupAt(selectedGroupId)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-black flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  <FolderPlus size={15} className="text-amber-600" />
                  <span>{selectedGroupId ? 'افزودن زیرگروه همینجا' : 'تعریف گروه اصلی'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openCreateItemAt(selectedGroupId)}
                  className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{selectedGroupId ? 'افزودن کالا در این شاخه' : 'تعریف کالای جدید'}</span>
                </button>
              </div>
            </div>

            {/* Split Tree Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
              {/* Tree Panel */}
              <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col min-h-[320px]">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <FolderOpen size={15} className="text-orange-600" />
                    ساختار درختی گروه‌ها ({groups.length})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const allExpanded: Record<string, boolean> = {};
                        groups.forEach(g => { allExpanded[g.id] = true; });
                        setExpandedGroupIds(allExpanded);
                      }}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    >
                      باز کردن همه
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedGroupIds({})}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    >
                      بستن
                    </button>
                  </div>
                </div>

                {/* Root Node */}
                <div
                  onClick={() => setSelectedGroupId(null)}
                  className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer mb-2 transition-colors ${
                    selectedGroupId === null
                      ? 'bg-orange-600 text-white font-black shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-bold'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Home size={14} />
                    <span>ریشه درخت (همه کالاها و گروه‌ها)</span>
                  </div>
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${selectedGroupId === null ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {erpState.items.length}
                  </span>
                </div>

                {/* Tree Nodes */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5">
                  {groups.length === 0 ? (
                    <div className="text-center py-8 px-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                      <FolderPlus size={24} className="mx-auto text-slate-300" />
                      <p className="text-xs text-slate-400 font-bold">هنوز گروهی تعریف نشده است.</p>
                      <button
                        type="button"
                        onClick={() => openCreateGroupAt(null)}
                        className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-600 text-[11px] font-black hover:bg-orange-100"
                      >
                        + ساخت اولین گروه اصلی
                      </button>
                    </div>
                  ) : (
                    renderTreeBranch(null, 0)
                  )}
                </div>
              </div>

              {/* Right Workspace: Breadcrumb + Direct Children + Items Table */}
              <div className="lg:col-span-8 space-y-4 flex flex-col min-w-0">
                {/* Breadcrumb & Child Sub-Groups Cards */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedGroupId(null)}
                        className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${
                          selectedGroupId === null ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                        }`}
                      >
                        <Home size={12} />
                        <span>ریشه</span>
                      </button>
                      {currentPath.map((node, idx) => (
                        <React.Fragment key={node.id}>
                          <ChevronLeft size={13} className="text-slate-400" />
                          <button
                            type="button"
                            onClick={() => setSelectedGroupId(node.id)}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                              idx === currentPath.length - 1
                                ? 'bg-orange-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {node.name}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>

                    {currentSelectedGroup && (
                      <button
                        type="button"
                        onClick={() => setSelectedGroupId(currentSelectedGroup.parentId || null)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1"
                      >
                        <ArrowRight size={13} />
                        <span>بازگشت یک سطح به بالا</span>
                      </button>
                    )}
                  </div>

                  {/* Direct Subgroups in current branch */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-black text-slate-500">
                        {selectedGroupId ? `زیرگروه‌های «${currentSelectedGroup?.name}» (${childGroupsAtSelected.length})` : `گروه‌های اصلی سطح اول (${childGroupsAtSelected.length})`}
                      </span>
                      <button
                        type="button"
                        onClick={() => openCreateGroupAt(selectedGroupId)}
                        className="text-[11px] font-black text-orange-600 hover:underline flex items-center gap-1"
                      >
                        <Plus size={12} />
                        <span>ایجاد زیرگروه جدید در این مسیر</span>
                      </button>
                    </div>

                    {childGroupsAtSelected.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {childGroupsAtSelected.map(cg => {
                          const childBranchCount = groups.filter(x => (x.parentId || null) === cg.id).length;
                          const descIds = new Set(getDescendantGroupIds(cg.id));
                          const itemCount = erpState.items.filter(i => i.groupId && descIds.has(i.groupId)).length;
                          return (
                            <div
                              key={cg.id}
                              onClick={() => {
                                setSelectedGroupId(cg.id);
                                setExpandedGroupIds(prev => ({ ...prev, [cg.id]: true }));
                              }}
                              className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 hover:border-orange-400 hover:bg-orange-50/40 dark:hover:bg-orange-950/20 cursor-pointer transition-all flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <Folder size={15} className="text-amber-500 shrink-0" />
                                  <span className="font-black text-xs text-slate-800 dark:text-slate-100 truncate">{cg.name}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2 font-bold">
                                  <span className="font-mono text-orange-600">{cg.code}</span>
                                  <span>• {childBranchCount} زیرگروه</span>
                                  <span>• {itemCount} کالا</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => openCreateGroupAt(cg.id)}
                                  className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-black"
                                  title="ایجاد زیرگروه داخل این گروه"
                                >
                                  + زیرگروه
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCreateItemAt(cg.id)}
                                  className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-black"
                                  title="تعریف کالا داخل این گروه"
                                >
                                  + کالا
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGroupForm(cg);
                                    setShowAddGroupModal(true);
                                  }}
                                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  title="ویرایش"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGroup(cg.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                                  title="حذف گروه"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl px-3 py-2 border border-dashed border-slate-200 dark:border-slate-800">
                        زیرگروهی در این سطح وجود ندارد. می‌توانید همینجا زیرگروه بسازید یا مستقیماً کالا تعریف کنید.
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Filter & Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
                      <div className="relative flex-1 max-w-xs">
                        <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="جستجو کد، نام، نمره، رنگ..."
                          value={itemSearch}
                          onChange={e => setItemSearch(e.target.value)}
                          className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                        />
                      </div>

                      <select
                        value={itemStatusFilter}
                        onChange={e => setItemStatusFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                      >
                        <option value="ALL">همه وضعیت‌ها</option>
                        <option value="ACTIVE">فقط کالاهای فعال</option>
                        <option value="INACTIVE">فقط کالاهای غیرفعال</option>
                      </select>

                      <select
                        value={itemGradeFilter}
                        onChange={e => setItemGradeFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                      >
                        <option value="ALL">همه درجه‌ها</option>
                        <option value="NONE">بدون درجه</option>
                        <option value="A">درجه A</option>
                        <option value="B">درجه B</option>
                        <option value="C">درجه C</option>
                      </select>

                      {selectedGroupId && (
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                          <input
                            type="checkbox"
                            checked={includeChildGroupsItems}
                            onChange={e => setIncludeChildGroupsItems(e.target.checked)}
                            className="accent-orange-600 rounded"
                          />
                          <span>نمایش کالاهای زیرمجموعه</span>
                        </label>
                      )}
                    </div>

                    <span className="text-[11px] font-bold text-slate-400">
                      تعداد: <strong className="text-slate-700 dark:text-slate-200 font-mono">{filteredItemsInTree.length}</strong> کالا
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-3">کد کالا</th>
                          <th className="p-3">نام کالا</th>
                          <th className="p-3">مسیر گروه</th>
                          <th className="p-3 text-center">نمره / درجه کالا</th>
                          <th className="p-3 text-center">فرمول تولید (BOM) / کسر ظرف</th>
                          <th className="p-3 text-center">وضعیت</th>
                          <th className="p-3 text-center">عملیات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredItemsInTree.map(item => {
                          const isItemActive = item.isActive !== false;
                          const itemGroup = groups.find(g => g.id === item.groupId);
                          const groupLabel = itemGroup ? getGroupHierarchyLabel(itemGroup) : (item.groupName || 'بدون گروه');
                          const itemTareSpec = resolveItemTareSpec(item, allBoms);

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                isItemActive
                                  ? 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                                  : 'bg-slate-50/80 dark:bg-slate-900/60 opacity-60'
                              }`}
                            >
                              <td className="p-3 font-mono font-bold text-orange-600">{item.code}</td>
                              <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                                <div>{item.name}</div>
                                {item.colorName && <span className="text-[10px] text-slate-400">رنگ: {item.colorName}</span>}
                              </td>
                              <td className="p-3 text-[11px] text-slate-500">{groupLabel}</td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono font-bold">{item.yarnCount || '—'}</span>
                                  {renderGradeBadge(item.grade)}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                {itemTareSpec.bom ? (
                                  <div className="inline-flex flex-col items-center gap-0.5">
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-black">
                                      <span className="font-mono">{itemTareSpec.bom.code}</span>
                                      {itemTareSpec.isTareLocked && <Lock size={10} className="text-amber-600" />}
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {itemTareSpec.defaultConesPerCarton} دوک | {itemTareSpec.cartonWeightGrams}g / {itemTareSpec.coneWeightGrams}g
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openSubViewTab?.('prd_bom')}
                                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-orange-50 text-slate-500 hover:text-orange-600 text-[10px] font-bold transition-colors cursor-pointer"
                                    title="تخصیص فرمول تولید (BOM) جهت تعیین وزن دوک و کارتن"
                                  >
                                    تنظیم در فرمول تولید (BOM)
                                  </button>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggleItemActive(item)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 border transition-colors ${
                                    isItemActive
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                      : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                                  }`}
                                  title={isItemActive ? 'کلیک برای غیرفعال کردن کالا' : 'کلیک برای فعال کردن کالا'}
                                >
                                  <Power size={11} />
                                  <span>{isItemActive ? 'فعال' : 'غیرفعال'}</span>
                                </button>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setItemForm({ ...item, grade: item.grade || '', isActive: item.isActive !== false });
                                      setShowAddItemModal(true);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800"
                                    title="ویرایش کالا"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800"
                                    title="حذف کالا"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredItemsInTree.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                              هیچ کالایی در این شاخه یا فیلتر یافت نشد. از دکمه «افزودن کالا» استفاده فرمایید.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* --------------------------------------------------------------------------------- */}
      {/* 3. SUBVIEW: PRD_LINE_PERF (عملکرد خط تولید و توزین باسکول و چاپ لیبل 1D/2D) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_line_perf' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Header Step Indicator & Scale Station */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left/Middle Column: Digital Weighing Station */}
            <div className="lg:col-span-8 space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-orange-600 text-white shadow-sm">
                      <Scale size={20} />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">
                        میز توزین دیجیتال خط تولید، کسر خودکار وزن دوک و کارتن و چاپ لیبل
                      </h2>
                      <span className="text-xs text-slate-500">پشتیبانی از بارکد خطی قدیم کارخانه (1D Code128) و بارکد دوبعدی QR به صورت کاملاً آفلاین</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleGlobalTareLock}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        lockTareWeightsGlobally
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                      title="قفل سراسری وزن کارتن خالی و وزن هر دوک تا اپراتور نتواند روی باسکول تغییر دهد"
                    >
                      {lockTareWeightsGlobally ? <Lock size={14} /> : <Unlock size={14} />}
                      <span>{lockTareWeightsGlobally ? 'وزن دوک و کارتن قفل است' : 'قفل وزن دوک و کارتن'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenLabelDesigner}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-black flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                    >
                      <Palette size={14} />
                      <span>طراحی خاص لیبل</span>
                    </button>

                    <button
                      onClick={handleReadFromScale}
                      disabled={isScaleReadingLive}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black flex items-center gap-1.5 transition-colors border border-slate-200/80 dark:border-slate-700"
                    >
                      <RefreshCw size={14} className={isScaleReadingLive ? 'animate-spin text-orange-600' : ''} />
                      <span>{isScaleReadingLive ? 'در حال خواندن...' : 'خواندن از باسکول'}</span>
                    </button>
                  </div>
                </div>

                {/* Barcode Mode Quick Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700 text-xs">
                  <div className="flex items-center gap-1.5 font-black text-slate-700 dark:text-slate-200">
                    <Barcode size={16} className="text-orange-600" />
                    <span>نوع بارکد لیبل کارخانه:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: 'LINEAR_1D' as ErpBarcodeType, label: 'خطی 1D (لیبل قدیم کارخانه)' },
                      { id: 'QR_2D' as ErpBarcodeType, label: 'دوبعدی (QR Code)' },
                      { id: 'BOTH' as ErpBarcodeType, label: 'ترکیبی (خطی + QR)' }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleQuickChangeBarcodeType(mode.id)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                          labelTemplate.barcodeType === mode.id
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-orange-400'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 1 & 2: Line & Commodity Selection */}
                {(lines.length === 0 || activeYarnItems.length === 0) && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-amber-600 shrink-0" />
                      <span>
                        {lines.length === 0
                          ? 'هیچ خط تولیدی تعریف نشده است.'
                          : yarnItems.length === 0
                          ? 'هیچ کالایی تعریف نشده است. ابتدا کالا را تعریف فرمایید.'
                          : 'همه کالاهای تعریف‌شده در وضعیت غیرفعال هستند. حداقل یک کالا را فعال نمایید.'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {lines.length === 0 && (
                        <button
                          type="button"
                          onClick={() => openSubViewTab?.('prd_lines')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                        >
                          + تعریف خط تولید
                        </button>
                      )}
                      {activeYarnItems.length === 0 && (
                        <button
                          type="button"
                          onClick={() => openSubViewTab?.('prd_items')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                        >
                          + مدیریت کالاها
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                      ۱. انتخاب خط تولید کارخانه:
                    </label>
                    <select
                      value={selectedLineId}
                      onChange={e => setSelectedLineId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {(activeLines.length > 0 ? activeLines : lines).length === 0 ? (
                        <option value="">(هیچ خط تولیدی تعریف نشده است - محیط خام)</option>
                      ) : (
                        (activeLines.length > 0 ? activeLines : lines).map(line => (
                          <option key={line.id} value={line.id}>
                            {line.code} — {line.name} {line.machineType ? `(${line.machineType})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="font-black text-slate-700 dark:text-slate-300 block mb-1">
                      ۲. انتخاب کالای فعال تولیدی (نخ روی باسکول):
                    </label>
                    <select
                      value={selectedItemId}
                      onChange={e => setSelectedItemId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-black text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      {activeYarnItems.length === 0 ? (
                        <option value="">(هیچ کالای فعالی در دسترس نیست)</option>
                      ) : (
                        activeYarnItems.map(item => {
                          const spec = resolveItemTareSpec(item, allBoms);
                          return (
                            <option key={item.id} value={item.id}>
                              {item.code} — {item.name} ({item.yarnCount} {item.colorName}) {item.grade ? `[درجه ${item.grade}]` : '[بدون درجه]'} {spec.isTareLocked ? '🔒' : ''}
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                </div>

                {/* Active BOM Tare Source Banner / Selector */}
                {selectedItemObj && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Sparkles size={14} className="text-indigo-600 shrink-0" />
                      {selectedItemTareSpec.matchingBoms.length > 1 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-indigo-800 dark:text-indigo-300">فرمول تولید فعال:</span>
                          <select
                            value={selectedItemTareSpec.bom?.id || ''}
                            onChange={e => setSelectedBomId(e.target.value)}
                            className="px-2 py-1 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 font-bold text-[11px]"
                          >
                            {selectedItemTareSpec.matchingBoms.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.code} — {b.title} ({b.defaultConesPerCarton ?? 6} دوک | {b.cartonWeightGrams ?? 1450}g / {b.coneWeightGrams ?? 110}g {b.isTareLocked ? '🔒' : ''})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : selectedItemTareSpec.bom ? (
                        <span className="font-bold text-indigo-800 dark:text-indigo-300">
                          مبنای وزن دوک و کارتن از فرمول تولید:{' '}
                          <strong className="font-mono">{selectedItemTareSpec.bom.code}</strong> ({selectedItemTareSpec.bom.title})
                        </span>
                      ) : (
                        <span className="font-bold text-amber-700 dark:text-amber-300">
                          برای این کالا هنوز فرمول تولید (BOM) متصل نشده است (مقادیر پیش‌فرض اعمال می‌شود).
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openSubViewTab?.('prd_bom')}
                      className="text-[11px] font-black text-indigo-700 dark:text-indigo-300 hover:underline shrink-0 self-end sm:self-auto cursor-pointer"
                    >
                      مدیریت فرمول‌های تولید (BOM) ←
                    </button>
                  </div>
                )}

                {/* Step 3, 4, 5: Cones, Locked/Unlocked Tare & Scale Reading */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between mb-1">
                      <span>تعداد دوک در کارتن</span>
                      {isConesLocked && <Lock size={12} className="text-amber-600" />}
                    </label>
                    <input
                      type="number"
                      value={conesCount}
                      disabled={isConesLocked}
                      readOnly={isConesLocked}
                      onChange={e => setConesCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-full px-3 py-2 rounded-xl border font-black text-center ${
                        isConesLocked
                          ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 cursor-not-allowed'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between mb-1">
                      <span>وزن کارتن خالی (گرم)</span>
                      {isTareLocked && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-600">
                          <Lock size={11} /> قفل
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      value={cartonTareGrams}
                      disabled={isTareLocked}
                      readOnly={isTareLocked}
                      onChange={e => {
                        if (!isTareLocked) setCartonTareGrams(Math.max(0, parseInt(e.target.value) || 0));
                      }}
                      className={`w-full px-3 py-2 rounded-xl border font-mono font-bold text-center ${
                        isTareLocked
                          ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 cursor-not-allowed'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 flex items-center justify-between mb-1">
                      <span>وزن هر دوک (گرم)</span>
                      {isTareLocked && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-600">
                          <Lock size={11} /> قفل
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      value={coneTareGrams}
                      disabled={isTareLocked}
                      readOnly={isTareLocked}
                      onChange={e => {
                        if (!isTareLocked) setConeTareGrams(Math.max(0, parseInt(e.target.value) || 0));
                      }}
                      className={`w-full px-3 py-2 rounded-xl border font-mono font-bold text-center ${
                        isTareLocked
                          ? 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 cursor-not-allowed'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">شماره لات (Lot No)</label>
                    <input
                      type="text"
                      value={lotNumber}
                      onChange={e => setLotNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                    />
                  </div>
                </div>

                {isTareLocked && (
                  <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Lock size={14} className="shrink-0" />
                    <span>
                      وزن کارتن خالی ({cartonTareGrams} گرم) و وزن هر دوک ({coneTareGrams} گرم) در{' '}
                      {selectedItemTareSpec.isTareLocked ? 'فرمول تولید (BOM)' : 'تنظیمات باسکول'} قفل شده است و اپراتور مجاز به تغییر آن نمی‌باشد.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">شیفت کاری</label>
                    <select
                      value={shiftName}
                      onChange={e => setShiftName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                    >
                      <option value="شیفت صبح A">شیفت صبح A</option>
                      <option value="شیفت عصر B">شیفت عصر B</option>
                      <option value="شیفت شب C">شیفت شب C</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">درجه کیفی کالا (تولید)</label>
                    <select
                      value={grade}
                      onChange={e => setGrade(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                    >
                      <option value="A">درجه A (درجه ۱ ممتاز)</option>
                      <option value="B">درجه B (درجه ۲ معمولی)</option>
                      <option value="C">درجه C (درجه ۳ / ضایعاتی)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 dark:text-slate-400 block mb-1">وزن ناخالص ترازو (Kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={grossWeightKg}
                      onChange={e => setGrossWeightKg(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border-2 border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 font-mono font-black text-center text-sm text-orange-700 dark:text-orange-400"
                    />
                  </div>
                </div>

                {/* Live Weights Calculation HUD */}
                <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md">
                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 font-bold block">وزن ناخالص (Gross)</span>
                    <span className="text-base sm:text-xl font-mono font-black text-amber-400" dir="ltr">{grossWeightKg.toFixed(2)} Kg</span>
                  </div>
                  <div className="text-center border-x border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block">کسر ظرف و دوک (Tare)</span>
                    <span className="text-base sm:text-xl font-mono font-black text-rose-400" dir="ltr">-{calculatedTareKg.toFixed(3)} Kg</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-emerald-400 font-bold block">وزن خالص نخ (Net)</span>
                    <span className="text-base sm:text-xl font-mono font-black text-emerald-400" dir="ltr">{calculatedNetKg.toFixed(3)} Kg</span>
                  </div>
                </div>

                {/* Add to batch action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-500">
                    💡 با فشردن دکمه زیر، کارتن در صف وزن‌کشی نوبت ثبت شده و باسکول بلافاصله آماده وزن کارتن بعدی می‌شود.
                  </span>
                  <button
                    onClick={handleAddCartonToBatch}
                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
                  >
                    <Plus size={16} />
                    ثبت این کارتن و وزن‌کشی کارتن بعدی (Enter)
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Thermal Label Preview */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    {labelTemplate.barcodeType === 'QR_2D' ? (
                      <QrCode size={16} className="text-orange-600" />
                    ) : (
                      <Barcode size={16} className="text-orange-600" />
                    )}
                    پیش‌نمایش زنده لیبل کارتن
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {labelTemplate.labelWidthMm}x{labelTemplate.labelHeightMm} mm
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenLabelDesigner}
                      className="text-[10px] font-black text-indigo-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Settings2 size={12} />
                      <span>سفارشی‌سازی</span>
                    </button>
                  </div>
                </div>

                <div id="single-carton-label-preview">
                  <CartonLabelCard
                    companyName={selectedCompany?.name || 'شرکت تولیدی و صنعتی'}
                    template={labelTemplate}
                    carton={{
                      productName: selectedItemObj?.name || 'کالای انتخاب نشده',
                      productCode: selectedItemObj?.code || 'YN-0000',
                      yarnCount: selectedItemObj?.yarnCount || '150/48',
                      colorName: selectedItemObj?.colorName || 'سفید خام',
                      machineCode: lines.find(l => l.id === selectedLineId)?.name || 'خط تولید ۱',
                      shift: shiftName,
                      lotNumber,
                      conesCount,
                      grade,
                      grossWeightKg,
                      totalTareKg: calculatedTareKg,
                      netWeightKg: calculatedNetKg,
                      referenceCode: buildCartonReferenceCode(
                        lines.find(l => l.id === selectedLineId),
                        (erpState.nextSerialCounter || 1000) + currentBatchCartons.length + 1,
                        calculatedNetKg
                      ),
                      serialNumber: `SN-05-${String((erpState.nextSerialCounter || 1000) + currentBatchCartons.length + 1).padStart(5, '0')}`,
                      createdDateJalali: getTodayJalali(),
                      createdTimeExact: getExactTimeNow(),
                      createdBy: currentUser?.fullName || 'اپراتور خط'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sequential Weighing Table (بچ کارتن‌های جاری) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  کارتن‌های وزن‌شده در این نوبت (آماده صدور سند تولید و چاپ دسته‌ای)
                </h3>
                <span className="text-[11px] text-slate-500">امکان ثبت متوالی تا ۵۰ الی ۱۰۰ کارتن پشت‌سرهم بدون خروج از صفحه</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBatchPrinting(true)}
                  disabled={currentBatchCartons.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-black flex items-center gap-1.5 border border-blue-200 dark:border-blue-800 disabled:opacity-40 transition-colors"
                >
                  <Printer size={14} />
                  چاپ دسته‌ای کلیه لیبل‌ها ({currentBatchCartons.length})
                </button>
                <button
                  onClick={handleFinalizeBatchAndIssueVoucher}
                  disabled={currentBatchCartons.length === 0}
                  className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors"
                >
                  <FileText size={14} />
                  ثبت نهایی و صدور سند تولید
                </button>
              </div>
            </div>

            {/* Batch Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">تعداد کارتن / دوک این نوبت:</span>
                <span className="font-black text-sm text-slate-800 dark:text-slate-100">
                  {batchTotalCartons} کارتن ({batchTotalCones} دوک)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">مجموع وزن خالص لیبل‌ها:</span>
                <span className="font-mono font-black text-sm text-emerald-600" dir="ltr">{batchTotalNetWeight.toFixed(3)} Kg</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">مجموع وزن ناخالص:</span>
                <span className="font-mono font-black text-sm text-slate-700 dark:text-slate-300" dir="ltr">{batchTotalGrossWeight.toFixed(3)} Kg</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">بهای تمام‌شده هر کیلو (COGM):</span>
                <span className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400" dir="ltr">
                  {(liveBatchOrSingleEval?.cogmPerKgRials || selectedItemObj?.unitCost || 0).toLocaleString()} ریال
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">ارزش کل تولید این نوبت:</span>
                <span className="font-mono font-black text-sm text-orange-600" dir="ltr">
                  {Math.round(
                    batchTotalNetWeight * (liveBatchOrSingleEval?.cogmPerKgRials || selectedItemObj?.unitCost || 0)
                  ).toLocaleString()}{' '}
                  ریال
                </span>
              </div>
            </div>

            {/* Live Automatic BOM Material Deduction & WACC Costing Preview */}
            {activeWeighingBom && liveBatchOrSingleEval && liveBatchOrSingleEval.components.length > 0 && (
              <div className="p-3.5 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calculator size={16} className="text-indigo-600 shrink-0" />
                    <div>
                      <span className="font-black text-slate-800 dark:text-slate-100">
                        محاسبه استاندارد حسابداری: کسر خودکار مواد مصرفی از «{PRODUCTION_FLOOR_WAREHOUSE_NAME}» و بهای تمام‌شده (میانگین موزون WACC)
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        بر اساس فرمول <strong className="font-mono text-indigo-600">{activeWeighingBom.code}</strong> برای{' '}
                        {currentBatchCartons.length > 0
                          ? `کل بچ جاری (${batchTotalNetWeight.toFixed(3)} Kg خالص در ${batchTotalCartons} کارتن و ${batchTotalCones} دوک)`
                          : `لیبل فعلی روی باسکول (${calculatedNetKg.toFixed(3)} Kg خالص در ۱ کارتن و ${conesCount} دوک)`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-[11px] font-black text-emerald-600" dir="ltr">
                      COGM: {liveBatchOrSingleEval.cogmPerKgRials.toLocaleString()} Rials/Kg
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-indigo-200/70 dark:border-indigo-800/70 rounded-xl bg-white dark:bg-slate-900">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-indigo-50/70 dark:bg-indigo-950/40 font-black text-slate-600 dark:text-slate-300 border-b border-indigo-100 dark:border-indigo-800">
                      <tr>
                        <th className="p-2">کالای مصرفی (تعریف‌شده در سیستم)</th>
                        <th className="p-2 text-center">مبنای مصرف در فرمول</th>
                        <th className="p-2 text-center font-black text-rose-600">مقدار کسر از انبار تولید</th>
                        <th className="p-2 text-center">موجودی فعلی انبار تولید</th>
                        <th className="p-2 text-center">نرخ میانگین موزون (WACC)</th>
                        <th className="p-2 text-center font-black text-emerald-600">سهم در بهای تمام‌شده</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {liveBatchOrSingleEval.components.map((line, i) => {
                        const isLowStock = !line.hasSufficientProdWhStock;
                        const basisText =
                          line.consumptionBasis === 'PERCENT_OF_NET'
                            ? `${line.inputQtyOrPercent}% وزن خالص لیبل`
                            : line.consumptionBasis === 'PER_CARTON'
                            ? `${line.inputQtyOrPercent} ${line.unit} در هر کارتن`
                            : line.consumptionBasis === 'PER_CONE'
                            ? `${line.inputQtyOrPercent} ${line.unit} در هر دوک`
                            : `${line.inputQtyOrPercent} ${line.unit} در هر کیلو خالص`;
                        return (
                          <tr key={`${line.itemId}_${i}`}>
                            <td className="p-2 font-bold text-slate-800 dark:text-slate-100">
                              <span className="font-mono text-orange-600 ml-1.5">{line.itemCode}</span>
                              <span>{line.itemName}</span>
                              {!line.isDefinedItem && (
                                <span className="mr-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                                  نیاز به تطبیق با کالای سیستم
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center text-slate-600 dark:text-slate-300">
                              {basisText}
                              {line.wastePercent > 0 ? ` (+${line.wastePercent}% پرت)` : ''}
                            </td>
                            <td className="p-2 text-center font-mono font-black text-rose-600" dir="ltr">
                              -{line.batchConsumedQty.toLocaleString()} {line.unit}
                            </td>
                            <td className="p-2 text-center font-mono" dir="ltr">
                              <span className={isLowStock ? 'text-amber-600 font-black' : 'text-slate-600 dark:text-slate-300 font-bold'}>
                                {line.productionWhStockQty.toLocaleString()} {line.unit}
                              </span>
                            </td>
                            <td className="p-2 text-center font-mono text-slate-700 dark:text-slate-200" dir="ltr">
                              {line.waccUnitCostRials.toLocaleString()} ریال
                            </td>
                            <td className="p-2 text-center font-mono font-black text-emerald-600" dir="ltr">
                              {line.batchTotalCostRials.toLocaleString()} ریال
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {currentBatchCartons.length === 0 ? (
              <div className="py-8 text-center text-xs font-bold text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                هنوز کارتنی در این نوبت وزن‌کشی نشده است. وزن ناخالص را وارد نموده و دکمه «ثبت این کارتن» را بزنید.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/60 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5">ردیف</th>
                      <th className="p-2.5">کد ارجاع (بارکد)</th>
                      <th className="p-2.5">کالای تولیدی</th>
                      <th className="p-2.5 text-center">درجه کالا</th>
                      <th className="p-2.5 text-center">خط / شیفت</th>
                      <th className="p-2.5 text-center">دوک</th>
                      <th className="p-2.5 text-center">وزن ناخالص</th>
                      <th className="p-2.5 text-center">کسر ظرف</th>
                      <th className="p-2.5 text-center font-black text-emerald-600">وزن خالص</th>
                      <th className="p-2.5 text-center">ساعت ثبت</th>
                      <th className="p-2.5 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentBatchCartons.map((carton, idx) => (
                      <tr key={carton.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-orange-600">{carton.referenceCode}</td>
                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{carton.productName}</td>
                        <td className="p-2.5 text-center">{renderGradeBadge(carton.grade)}</td>
                        <td className="p-2.5 text-center text-slate-500">{carton.machineCode} — {carton.shift}</td>
                        <td className="p-2.5 text-center">{carton.conesCount}</td>
                        <td className="p-2.5 text-center font-mono" dir="ltr">{carton.grossWeightKg.toFixed(2)}</td>
                        <td className="p-2.5 text-center font-mono text-rose-500" dir="ltr">-{carton.totalTareKg.toFixed(3)}</td>
                        <td className="p-2.5 text-center font-mono font-black text-emerald-600" dir="ltr">{carton.netWeightKg.toFixed(3)} Kg</td>
                        <td className="p-2.5 text-center font-mono text-slate-400">{carton.createdTimeExact}</td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => {
                              setSinglePrintCarton(carton);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 mr-1"
                            title="چاپ تکی لیبل"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setCurrentBatchCartons(prev => prev.filter(c => c.id !== carton.id));
                            }}
                            className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                            title="حذف از بچ"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 4. SUBVIEW: PRD_ARCHIVE (بایگانی اسناد تولید) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_archive' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                بایگانی جامع اسناد و بچ‌های نوبت تولید
              </h2>
              <p className="text-xs text-slate-500 mt-1">تفکیک شماره سند، کد بایگانی، تاریخ و ساعت دقیق ثبت نوبت و رهگیری کارتن‌ها</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={archiveGradeFilter}
                onChange={e => setArchiveGradeFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="ALL">همه درجه‌ها</option>
                <option value="A">درجه A</option>
                <option value="B">درجه B</option>
                <option value="C">درجه C</option>
              </select>
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="جستجو: کد ارجاع، شماره سند، بایگانی، وزن، کالا، خط..."
                  value={archiveSearch}
                  onChange={e => setArchiveSearch(e.target.value)}
                  className="w-full sm:w-80 pr-8 pl-7 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                />
                {archiveSearch && (
                  <button
                    type="button"
                    onClick={() => setArchiveSearch('')}
                    className="absolute left-2 top-2 text-slate-400 hover:text-slate-600"
                    title="پاک کردن جستجو"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">شماره سند تولید</th>
                    <th className="p-3">کد بایگانی</th>
                    <th className="p-3">خط تولید</th>
                    <th className="p-3">محصول تولیدی</th>
                    <th className="p-3 text-center">درجه کالا</th>
                    <th className="p-3 text-center">تعداد کارتن / کد ارجاع</th>
                    <th className="p-3 text-center">مجموع وزن خالص (Kg)</th>
                    <th className="p-3 text-center">تاریخ و ساعت دقیق</th>
                    <th className="p-3 text-center">ثبت‌کننده</th>
                    <th className="p-3 text-center">وضعیت تحویل انبار</th>
                    <th className="p-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredVouchers.map(v => {
                    const linkedCartons = getVoucherCartons(v);
                    const matchedCartons = archiveSearch.trim()
                      ? linkedCartons.filter(c =>
                          matchesSearchQuery(archiveSearch, [
                            c.referenceCode,
                            c.serialNumber,
                            c.lotNumber,
                            c.netWeightKg,
                            c.grossWeightKg
                          ])
                        )
                      : [];
                    const voucherItem = erpState.items.find(i => i.id === v.itemId || i.code === v.itemCode);
                    const gradesPresent = Array.from(
                      new Set(
                        linkedCartons.length > 0
                          ? linkedCartons.map(c => (c.grade || voucherItem?.grade || '').toUpperCase())
                          : [(voucherItem?.grade || '').toUpperCase()]
                      )
                    );
                    return (
                    <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-orange-600">{v.voucherNo}</td>
                      <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-300">{v.archiveCode}</td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{v.lineName}</td>
                      <td className="p-3">{v.itemName}</td>
                      <td className="p-3 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {gradesPresent.map(gr => (
                            <React.Fragment key={gr}>{renderGradeBadge(gr)}</React.Fragment>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="font-bold">{v.cartonsCount} کارتن</div>
                        {matchedCartons.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1 mt-1">
                            {matchedCartons.slice(0, 2).map(mc => (
                              <span key={mc.id} className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800" dir="ltr">
                                {mc.referenceCode}
                              </span>
                            ))}
                            {matchedCartons.length > 2 && (
                              <span className="text-[10px] text-slate-400">+{matchedCartons.length - 2}</span>
                            )}
                          </div>
                        ) : linkedCartons.length > 0 ? (
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5" dir="ltr">
                            {linkedCartons[0].referenceCode}
                            {linkedCartons.length > 1 ? ` (+${linkedCartons.length - 1})` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-emerald-600" dir="ltr">{v.totalNetWeightKg.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <div className="font-bold">{v.dateJalali}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{v.timeExact}</div>
                      </td>
                      <td className="p-3 text-center text-slate-500">{v.operatorName}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`text-[11px] font-black ${
                            v.status === 'DELIVERED_TO_WAREHOUSE'
                              ? 'text-emerald-600'
                              : v.status === 'PENDING_RECEIPT'
                              ? 'text-indigo-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {v.status === 'DELIVERED_TO_WAREHOUSE'
                            ? `رسید در ${v.deliveredWarehouseName || 'انبار مقصد'}`
                            : v.status === 'PENDING_RECEIPT'
                            ? 'ارسال‌شده (در انتظار تایید رسید انبار)'
                            : 'در انبار تولید (آماده تحویل به انبار)'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => setSelectedVoucherForView(v)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye size={13} />
                            مشاهده کارتن‌ها
                          </button>
                          {(v.status === 'IN_PRODUCTION_WAREHOUSE' || v.status === 'PENDING_WAREHOUSE_DELIVERY') && openSubViewTab && (
                            <button
                              onClick={() => openSubViewTab('wh_production_delivery')}
                              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                              title="صدور سند تحویل از انبار تولید به انبار مقصد"
                            >
                              <Truck size={13} />
                              تحویل به انبار
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {filteredVouchers.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                        هیچ سند تولیدی در بایگانی یافت نشد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* 5. SUBVIEW: PRD_BOM (تعریف فرمول‌های تولید BOM) */}
      {/* --------------------------------------------------------------------------------- */}
      {activeSubView === 'prd_bom' && (
        <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Top BOM Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-600" />
                مهندسی فرمول‌های ساخت و تولید (BOM) و آنالیز بهای تمام‌شده
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                تعریف ساختار محصول، تخصیص مواد اولیه (POY)، روغن اسپین فینیش، کارتن و دوک، ضایعات استاندارد و سربار کارخانه
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const targetBom = filteredBoms[0] || allBoms[0];
                  if (targetBom) {
                    setSimulationBom(targetBom);
                    setShowSimulationModal(true);
                  } else {
                    showToast?.('error', 'ابتدا باید حداقل یک فرمول ساخت (BOM) تعریف نمایید');
                  }
                }}
                className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer"
                title="شبیه‌سازی سفارش تولید و محاسبه مواد مورد نیاز"
              >
                <Calculator size={15} />
                <span>شبیه‌سازی بچ تولید</span>
              </button>
              <button
                onClick={handleOpenAddBom}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus size={15} />
                <span>تعریف فرمول ساخت جدید (BOM)</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
              <div className="relative flex-1 sm:max-w-xs">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="جستجو در کد، عنوان فرمول یا نام کالا..."
                  value={bomSearch}
                  onChange={e => setBomSearch(e.target.value)}
                  className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                />
              </div>

              {bomAssignableItems.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Filter size={13} className="text-slate-400 shrink-0" />
                  <select
                    value={bomProductFilter}
                    onChange={e => setBomProductFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold max-w-[230px]"
                  >
                    <option value="ALL">تمام محصولات نهایی</option>
                    {bomAssignableItems.map(y => (
                      <option key={y.id} value={y.id}>{y.code} — {y.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="text-slate-400 text-[11px] font-bold">
              تعداد فرمول‌ها: <span className="font-mono text-slate-700 dark:text-slate-200">{filteredBoms.length}</span> از <span className="font-mono text-slate-700 dark:text-slate-200">{allBoms.length}</span>
            </div>
          </div>

          {/* BOM Table / Empty State */}
          {allBoms.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 border border-orange-200 dark:border-orange-800 flex items-center justify-center mx-auto">
                <Sparkles size={28} />
              </div>
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                هیچ فرمول ساختی (BOM) برای این شرکت ثبت نشده است
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                دیتابیس در وضعیت کاملاً خام قرار دارد. می‌توانید با کلیک بر روی دکمه زیر، اولین فرمول تولید، وزن دوک و کارتن و تخصیص چندکالایی کارخانه خود را تعریف فرمایید.
              </p>
              <button
                onClick={handleOpenAddBom}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus size={15} />
                <span>تعریف اولین فرمول ساخت (BOM)</span>
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">کد فرمول</th>
                      <th className="p-3">عنوان فرمول ساخت</th>
                      <th className="p-3">محصولات تخصیص‌یافته</th>
                      <th className="p-3 text-center">وزن دوک / کارتن و قفل</th>
                      <th className="p-3 text-center">نسخه</th>
                      <th className="p-3 text-center">تعداد اقلام</th>
                      <th className="p-3 text-center">ضایعات (%)</th>
                      <th className="p-3 text-center">بهای مواد (ریال)</th>
                      <th className="p-3 text-center">دستمزد مستقیم</th>
                      <th className="p-3 text-center">سربار ساخت</th>
                      <th className="p-3 text-center font-black text-emerald-600">بهای تمام‌شده هر کیلو</th>
                      <th className="p-3 text-center">وضعیت</th>
                      <th className="p-3 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBoms.map(bom => {
                      const conesVal = bom.defaultConesPerCarton ?? 6;
                      const bomLiveEval = evaluateBomCostAndConsumption({
                        bom,
                        items: erpState.items || [],
                        waccMap: itemWaccMap,
                        batchNetWeightKg: 23.5,
                        batchCartonsCount: 1,
                        batchConesCount: conesVal
                      });
                      const totalMat = bomLiveEval.rawMaterialsCostPerKgRials;
                      const labor = bomLiveEval.directLaborPerKgRials;
                      const overhead = bomLiveEval.factoryOverheadPerKgRials;
                      const grandTotal = bomLiveEval.cogmPerKgRials;
                      const assignedItems = getBomAssignedItemsList(bom);
                      const cartonGramsVal = bom.cartonWeightGrams ?? 1450;
                      const coneGramsVal = bom.coneWeightGrams ?? 110;

                      return (
                        <tr key={bom.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-orange-600">{bom.code}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{bom.title}</td>
                          <td className="p-3">
                            {assignedItems.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[240px]">
                                {assignedItems.slice(0, 3).map(ai => (
                                  <span
                                    key={ai.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200"
                                    title={`${ai.code} — ${ai.name}`}
                                  >
                                    <span className="font-mono text-orange-600">{ai.code}</span>
                                    <span className="truncate max-w-[110px]">{ai.name}</span>
                                  </span>
                                ))}
                                {assignedItems.length > 3 && (
                                  <span
                                    className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-black"
                                    title={assignedItems.map(x => `${x.code} - ${x.name}`).join(' | ')}
                                  >
                                    +{assignedItems.length - 3} کالای دیگر
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="font-bold text-slate-700 dark:text-slate-300 block">{bom.finishedItemName || 'تخصیص داده نشده'}</span>
                                {bom.finishedItemCode && (
                                  <span className="font-mono text-[10px] text-slate-400">{bom.finishedItemCode}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300 font-bold">
                                {conesVal} دوک | {cartonGramsVal}g / {coneGramsVal}g
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleBomTareLock(bom)}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-black inline-flex items-center gap-1 border transition-colors cursor-pointer ${
                                  bom.isTareLocked
                                    ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-100'
                                }`}
                                title={bom.isTareLocked ? 'کلیک برای باز کردن قفل وزن دوک و کارتن' : 'کلیک برای قفل کردن وزن دوک و کارتن روی باسکول'}
                              >
                                {bom.isTareLocked ? <Lock size={10} /> : <Unlock size={10} />}
                                <span>{bom.isTareLocked ? 'قفل' : 'آزاد'}</span>
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">{bom.version || 'V1.0'}</span>
                          </td>
                          <td className="p-3 text-center font-bold">
                            {(bom.components || []).length} قلم
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-amber-600">
                            {bom.wastePercent}%
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300" dir="ltr">
                            {totalMat.toLocaleString()}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500" dir="ltr">
                            {labor.toLocaleString()}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500" dir="ltr">
                            {overhead.toLocaleString()}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20" dir="ltr">
                            {grandTotal.toLocaleString()} ریال
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${bom.status === 'ACTIVE' || !bom.status ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                              {bom.status === 'ACTIVE' || !bom.status ? 'فرمول فعال' : 'پیش‌نویس'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setSimulationBom(bom);
                                  setShowSimulationModal(true);
                                }}
                                className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                                title="شبیه‌سازی بچ تولید بر اساس این فرمول"
                              >
                                <Calculator size={14} />
                              </button>
                              <button
                                onClick={() => handleDuplicateBom(bom)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="تکثیر / نسخه کپی"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={() => handleOpenEditBom(bom)}
                                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                                title="ویرایش فرمول، کالاهای متصل و وزن دوک/کارتن"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteBom(bom.id)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 transition-colors"
                                title="حذف فرمول"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredBoms.length === 0 && (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-slate-400 font-bold">
                          فرمول ساختی مطابق فیلتر انتخابی یافت نشد.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT LINE */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddLineModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                {lineForm.id ? 'ویرایش خط تولید' : 'تعریف خط تولید جدید'}
              </h3>
              <button onClick={() => setShowAddLineModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">کد خط تولید</label>
                  <input
                    type="text"
                    value={lineForm.code}
                    onChange={e => setLineForm({ ...lineForm, code: e.target.value })}
                    placeholder="مثال: PL-05"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">پیشوند کد ارجاع (اختیاری)</label>
                  <input
                    type="text"
                    value={lineForm.referencePrefix || ''}
                    onChange={e => setLineForm({ ...lineForm, referencePrefix: e.target.value.toUpperCase() })}
                    placeholder={`خودکار: ${deriveLineReferencePrefix(lineForm.name, lineForm.code)}`}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold uppercase"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">نام خط تولید</label>
                <input
                  type="text"
                  value={lineForm.name}
                  onChange={e => setLineForm({ ...lineForm, name: e.target.value })}
                  placeholder="مثال: خط پی او وای ۱ (POY)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
                <span className="text-[10px] text-slate-400 block mt-1" dir="ltr">
                  نمونه کد ارجاع: {buildCartonReferenceCode(lineForm, 1001, 24.835)}
                </span>
              </div>
              <div>
                <label className="font-bold block mb-1">نوع ماشین / تکنولوژی</label>
                <input
                  type="text"
                  value={lineForm.machineType}
                  onChange={e => setLineForm({ ...lineForm, machineType: e.target.value })}
                  placeholder="مثال: تکسچرایزینگ ۲۸۸ چشمه"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">سرپرست خط</label>
                <input
                  type="text"
                  value={lineForm.supervisorName}
                  onChange={e => setLineForm({ ...lineForm, supervisorName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">توضیحات تکمیلی</label>
                <textarea
                  value={lineForm.notes}
                  onChange={e => setLineForm({ ...lineForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddLineModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveLine}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm"
              >
                ذخیره اطلاعات خط
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT COMMODITY GROUP (HIERARCHICAL) */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FolderPlus size={17} className="text-orange-600" />
                {groupForm.id ? 'ویرایش گروه / زیرگروه کالایی' : 'تعریف گروه / زیرگروه جدید'}
              </h3>
              <button onClick={() => setShowAddGroupModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">گروه والد (سلسله‌مراتب درختی)</label>
                <select
                  value={groupForm.parentId || ''}
                  onChange={e => setGroupForm({ ...groupForm, parentId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                >
                  <option value="">(گروه ریشه - سطح اول)</option>
                  {orderedGroupsWithDepth
                    .filter(({ group: g }) => g.id !== groupForm.id)
                    .map(({ group: g, depth }) => (
                      <option key={g.id} value={g.id}>
                        {`${'— '.repeat(depth)}${g.name} (${g.code})`}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="font-bold block mb-1">کد گروه *</label>
                  <input
                    type="text"
                    value={groupForm.code || ''}
                    onChange={e => setGroupForm({ ...groupForm, code: e.target.value })}
                    placeholder="GRP-01"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-bold block mb-1">عنوان گروه / زیرگروه *</label>
                  <input
                    type="text"
                    value={groupForm.name || ''}
                    onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="مثال: نخ DTY سفید ۱۰۰/۳۶"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">توضیحات</label>
                <textarea
                  rows={2}
                  value={groupForm.description || ''}
                  onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddGroupModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveGroup}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm"
              >
                ذخیره گروه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT ITEM */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                {itemForm.id ? 'ویرایش مشخصات کالا' : 'تعریف کالای تولیدی جدید'}
              </h3>
              <button onClick={() => setShowAddItemModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">کد کالا</label>
                  <input
                    type="text"
                    value={itemForm.code || ''}
                    onChange={e => setItemForm({ ...itemForm, code: e.target.value })}
                    placeholder="مثال: YN-3005"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold">شاخه / گروه در درخت کالا</label>
                    <button
                      type="button"
                      onClick={() => setShowInlineSubgroupBox(prev => !prev)}
                      className="text-[11px] font-black text-orange-600 hover:text-orange-700 dark:text-orange-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <FolderPlus size={12} />
                      <span>{showInlineSubgroupBox ? 'بستن فرم زیرگروه' : '+ زیرگروه جدید'}</span>
                    </button>
                  </div>
                  <select
                    value={itemForm.groupId || ''}
                    onChange={e => setItemForm({ ...itemForm, groupId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    <option value="">انتخاب گروه / زیرگروه کالایی...</option>
                    {orderedGroupsWithDepth.map(({ group: g, depth }) => (
                      <option key={g.id} value={g.id}>
                        {`${'↳ '.repeat(depth)}${g.name} (${g.code})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showInlineSubgroupBox && (
                <div className="p-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <FolderPlus size={13} />
                      ایجاد سریع زیرگروه زیر شاخه فعلی (
                      {itemForm.groupId
                        ? groups.find(g => g.id === itemForm.groupId)?.name || 'شاخه انتخاب‌شده'
                        : 'گروه ریشه'}
                      )
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={inlineSubgroupCode}
                      onChange={e => setInlineSubgroupCode(e.target.value)}
                      placeholder="کد زیرگروه (اختیاری)"
                      className="px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 font-mono font-bold text-xs"
                    />
                    <input
                      type="text"
                      value={inlineSubgroupName}
                      onChange={e => setInlineSubgroupName(e.target.value)}
                      placeholder="نام زیرگروه جدید (مثلاً نخ خام ۱۵۰/۴۸)"
                      className="sm:col-span-2 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 font-bold text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInlineSubgroupBox(false)}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600"
                    >
                      انصراف
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickCreateSubgroupInItemModal}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer"
                    >
                      ثبت و انتخاب زیرگروه
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold block mb-1">نام و عنوان کامل کالا</label>
                <input
                  type="text"
                  value={itemForm.name || ''}
                  onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="مثال: نخ تکسچره پلی‌استر DTY 150/48 NIM سفید / نخ POY / دوک مقوایی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold block mb-1">ماهیت / دسته‌بندی کالا</label>
                  <select
                    value={itemForm.category || 'FINISHED_YARN'}
                    onChange={e => {
                      const nextCat = e.target.value as ErpItem['category'];
                      const nextUnit =
                        nextCat === 'PACKAGING' && (itemForm.unit === 'کیلوگرم' || !itemForm.unit)
                          ? 'عدد'
                          : itemForm.unit || 'کیلوگرم';
                      setItemForm({ ...itemForm, category: nextCat, unit: nextUnit });
                    }}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    <option value="FINISHED_YARN">محصول نهایی / نخ تولیدی</option>
                    <option value="RAW_MATERIAL">ماده اولیه مصرفی (POY، رنگ، روغن و...)</option>
                    <option value="PACKAGING">ملزومات بسته‌بندی (کارتن، دوک، نایلون و...)</option>
                    <option value="WASTE">ضایعات تولید</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">واحد سنجش انبار و مصرف</label>
                  <select
                    value={itemForm.unit || 'کیلوگرم'}
                    onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                  >
                    <option value="کیلوگرم">کیلوگرم (Kg)</option>
                    <option value="عدد">عدد (Pcs)</option>
                    <option value="ست">ست / بسته</option>
                    <option value="گرم">گرم (g)</option>
                    <option value="لیتر">لیتر (L)</option>
                    <option value="متر">متر (m)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">نرخ پایه / میانگین اولیه (ریال)</label>
                  <input
                    type="number"
                    min={0}
                    value={itemForm.unitCost ?? 0}
                    onChange={e => setItemForm({ ...itemForm, unitCost: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="نرخ هر واحد (ریال)"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold block mb-1">نمره نخ / مشخصه فنی</label>
                  <input
                    type="text"
                    value={itemForm.yarnCount || ''}
                    onChange={e => setItemForm({ ...itemForm, yarnCount: e.target.value })}
                    placeholder="150/48"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">رنگ / نوع</label>
                  <input
                    type="text"
                    value={itemForm.colorName || ''}
                    onChange={e => setItemForm({ ...itemForm, colorName: e.target.value })}
                    placeholder="سفید خام"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">درجه کالا (اختیاری)</label>
                  <select
                    value={itemForm.grade || ''}
                    onChange={e => setItemForm({ ...itemForm, grade: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                  >
                    <option value="">بدون درجه (تعیین هنگام تولید و لیبل)</option>
                    <option value="A">درجه A (درجه ۱ ممتاز)</option>
                    <option value="B">درجه B (درجه ۲ معمولی)</option>
                    <option value="C">درجه C (درجه ۳ / ضایعاتی)</option>
                  </select>
                </div>
              </div>

              {/* Info card directing tare weights & lock to BOM */}
              <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-2xl border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                <div className="text-indigo-900 dark:text-indigo-200 leading-relaxed">
                  <strong className="block font-black">تنظیم وزن دوک، کارتن و قفل آن‌ها در «فرمول تولید (BOM)»:</strong>
                  <span className="text-indigo-700/90 dark:text-indigo-300/80">
                    وزن کارتن خالی، وزن هر دوک، تعداد دوک و قفل بودن روی باسکول در بخش فرمول تولید تعریف شده و قابل تخصیص به چندین کالا است.
                  </span>
                </div>
                {openSubViewTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddItemModal(false);
                      openSubViewTab('prd_bom');
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-black shrink-0 hover:bg-indigo-100 cursor-pointer"
                  >
                    رفتن به فرمول تولید (BOM)
                  </button>
                )}
              </div>

              {/* Active switch */}
              <div className="pt-1">
                <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.isActive !== false}
                    onChange={e => setItemForm({ ...itemForm, isActive: e.target.checked })}
                    className="accent-emerald-600 w-4 h-4"
                  />
                  <div>
                    <span className="font-black block text-slate-800 dark:text-slate-100">کالا فعال است</span>
                    <span className="text-[10px] text-slate-500">نمایش در لیست توزین باسکول</span>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddItemModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveItem}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-sm"
              >
                ذخیره کالا
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: VIEW PRODUCTION VOUCHER DETAILS & CARTONS */}
      {/* --------------------------------------------------------------------------------- */}
      {selectedVoucherForView && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-600" />
                  جزئیات سند تولید {selectedVoucherForView.voucherNo}
                </h3>
                <span className="text-xs text-slate-400 font-mono">کد بایگانی: {selectedVoucherForView.archiveCode}</span>
              </div>
              <button onClick={() => setSelectedVoucherForView(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl text-xs">
              <div>خط: <strong className="font-bold text-slate-800 dark:text-slate-200">{selectedVoucherForView.lineName}</strong></div>
              <div>محصول: <strong className="font-bold text-slate-800 dark:text-slate-200">{selectedVoucherForView.itemName}</strong></div>
              <div>تاریخ: <strong className="font-bold">{selectedVoucherForView.dateJalali}</strong></div>
              <div>ساعت دقیق: <strong className="font-mono text-orange-600">{selectedVoucherForView.timeExact}</strong></div>
              <div>تعداد کارتن: <strong className="font-bold">{selectedVoucherForView.cartonsCount}</strong></div>
              <div>وزن ناخالص: <strong className="font-mono">{selectedVoucherForView.totalGrossWeightKg} Kg</strong></div>
              <div>وزن خالص کل: <strong className="font-mono text-emerald-600">{selectedVoucherForView.totalNetWeightKg} Kg</strong></div>
              <div>ثبت‌کننده: <strong>{selectedVoucherForView.operatorName}</strong></div>
              {selectedVoucherForView.bomCode && (
                <div>فرمول ساخت: <strong className="font-mono text-indigo-600">{selectedVoucherForView.bomCode}</strong></div>
              )}
              {selectedVoucherForView.consumptionDocNo && (
                <div>حواله مصرف انبار تولید: <strong className="font-mono text-rose-600">#{selectedVoucherForView.consumptionDocNo}</strong></div>
              )}
              {selectedVoucherForView.unitCostPerKgRials ? (
                <div>بهای تمام‌شده هر کیلو: <strong className="font-mono text-emerald-600">{selectedVoucherForView.unitCostPerKgRials.toLocaleString()} ریال</strong></div>
              ) : null}
              {selectedVoucherForView.totalProductionCostRials ? (
                <div>بهای کل تولید بچ: <strong className="font-mono text-orange-600">{selectedVoucherForView.totalProductionCostRials.toLocaleString()} ریال</strong></div>
              ) : null}
            </div>

            {selectedVoucherForView.consumedMaterials && selectedVoucherForView.consumedMaterials.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                    اقلام و مواد اولیه کسرشده از «{PRODUCTION_FLOOR_WAREHOUSE_NAME}» طبق فرمول تولید (به نرخ میانگین موزون WACC):
                  </h4>
                  {selectedVoucherForView.consumptionDocNo && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200 dark:border-rose-800">
                      حواله مصرف انبار: #{selectedVoucherForView.consumptionDocNo}
                    </span>
                  )}
                </div>
                <div className="border border-indigo-200 dark:border-indigo-800 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-indigo-50/70 dark:bg-indigo-950/40 font-bold text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-2">کد و نام کالای مصرفی</th>
                        <th className="p-2 text-center">مقدار کسرشده</th>
                        <th className="p-2 text-center">نرخ میانگین موزون (ریال)</th>
                        <th className="p-2 text-center">جمع بهای مصرفی (ریال)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedVoucherForView.consumedMaterials.map((cm, idx) => (
                        <tr key={`${cm.itemId}_${idx}`}>
                          <td className="p-2 font-bold">
                            <span className="font-mono text-orange-600 ml-1">{cm.itemCode}</span>
                            <span>{cm.itemName}</span>
                          </td>
                          <td className="p-2 text-center font-mono font-black text-rose-600" dir="ltr">
                            -{cm.consumedQty.toLocaleString()} {cm.unit}
                          </td>
                          <td className="p-2 text-center font-mono" dir="ltr">
                            {cm.waccUnitCostRials.toLocaleString()}
                          </td>
                          <td className="p-2 text-center font-mono font-black text-emerald-600" dir="ltr">
                            {cm.totalCostRials.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">فهرست کارتن‌های ثبت شده در این سند:</h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-600">
                  <tr>
                    <th className="p-2">ردیف</th>
                    <th className="p-2">کد ارجاع</th>
                    <th className="p-2 text-center">درجه کالا</th>
                    <th className="p-2 text-center">دوک</th>
                    <th className="p-2 text-center">وزن ناخالص</th>
                    <th className="p-2 text-center">وزن خالص</th>
                    <th className="p-2 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {erpState.cartonLabels
                    .filter(c => selectedVoucherForView.cartonIds?.includes(c.id) || c.productionVoucherNo === selectedVoucherForView.voucherNo)
                    .map((c, i) => (
                      <tr key={c.id}>
                        <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-2 font-mono font-bold text-orange-600">{c.referenceCode}</td>
                        <td className="p-2 text-center">{renderGradeBadge(c.grade)}</td>
                        <td className="p-2 text-center">{c.conesCount}</td>
                        <td className="p-2 text-center font-mono">{c.grossWeightKg.toFixed(2)}</td>
                        <td className="p-2 text-center font-mono font-black text-emerald-600">{c.netWeightKg.toFixed(3)} Kg</td>
                        <td className="p-2 text-center">
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            {c.isSalesLocked || c.status === 'SOLD'
                              ? 'حواله فروش (قفل)'
                              : c.status === 'IN_TRANSIT'
                              ? 'در انتظار تایید رسید انبار'
                              : c.status === 'ADJUSTED_OUT'
                              ? 'کسر تعدیل انبار'
                              : c.warehouseId === PRODUCTION_FLOOR_WAREHOUSE_ID
                              ? 'در انبار تولید'
                              : 'موجود در انبار'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedVoucherForView(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black shadow-sm"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL / SHEET: BATCH PRINT STICKERS */}
      {/* --------------------------------------------------------------------------------- */}
      {isBatchPrinting && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-orange-600" />
                  چاپ دسته‌ای کلیه لیبل‌های کارتن ({currentBatchCartons.length} کارتن)
                </h3>
                <span className="text-xs text-slate-500">
                  سایز لیبل: {labelTemplate.labelWidthMm}x{labelTemplate.labelHeightMm} mm | نوع بارکد:{' '}
                  {labelTemplate.barcodeType === 'LINEAR_1D' ? 'خطی 1D' : labelTemplate.barcodeType === 'QR_2D' ? 'دوبعدی QR' : 'خطی + QR'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenLabelDesigner}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-black flex items-center gap-1 hover:bg-indigo-100"
                >
                  <Palette size={13} />
                  <span>طراحی لیبل</span>
                </button>
                <button onClick={() => setIsBatchPrinting(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div id="batch-labels-print-container" className="space-y-4">
              {currentBatchCartons.map((carton, idx) => (
                <CartonLabelCard
                  key={carton.id}
                  carton={carton}
                  companyName={selectedCompany?.name || 'شرکت تولیدی و صنعتی'}
                  template={labelTemplate}
                  qrDataUrl={qrCodeDataUrls[carton.id]}
                  batchIndexLabel={`ردیف ${idx + 1} از ${currentBatchCartons.length}`}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsBatchPrinting(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={() => handlePrintElement('batch-labels-print-container', true)}
                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md flex items-center gap-1.5"
              >
                <Printer size={15} />
                ارسال به چاپگر لیبل‌زن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: SINGLE LABEL PRINT */}
      {/* --------------------------------------------------------------------------------- */}
      {singlePrintCarton && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Printer size={16} className="text-orange-600" />
                چاپ لیبل کارتن {singlePrintCarton.referenceCode}
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleOpenLabelDesigner}
                  className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-black flex items-center gap-1 hover:bg-indigo-100"
                >
                  <Palette size={12} />
                  <span>طراحی</span>
                </button>
                <button onClick={() => setSinglePrintCarton(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div id="single-carton-print-box">
              <CartonLabelCard
                carton={singlePrintCarton}
                companyName={selectedCompany?.name || 'شرکت تولیدی و صنعتی'}
                template={labelTemplate}
                qrDataUrl={qrCodeDataUrls[singlePrintCarton.id]}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSinglePrintCarton(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600"
              >
                انصراف
              </button>
              <button
                onClick={() => handlePrintElement('single-carton-print-box', true)}
                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md flex items-center gap-1.5"
              >
                <Printer size={15} />
                چاپ لیبل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: CUSTOM LABEL DESIGNER & PRINT FIELD SELECTOR */}
      {/* --------------------------------------------------------------------------------- */}
      {showLabelDesignerModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-5xl w-full p-5 sm:p-6 shadow-2xl space-y-4 my-6 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
                  <Palette size={20} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                    طراح اختصاصی لیبل کارتن و تعیین دقیق اقلام چاپی
                  </h3>
                  <p className="text-xs text-slate-400">انتخاب نوع بارکد (خطی قدیم کارخانه / دوبعدی QR)، ابعاد برچسب و مشخص کردن فیلدهای روی چاپ</p>
                </div>
              </div>
              <button onClick={() => setShowLabelDesignerModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 self-end sm:self-auto">
                <X size={18} />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700 text-xs">
              <span className="font-black text-slate-600 dark:text-slate-300">الگوهای آماده:</span>
              <button
                type="button"
                onClick={() =>
                  setDesignerDraft({
                    ...DEFAULT_LABEL_TEMPLATE_CONFIG,
                    barcodeType: 'LINEAR_1D',
                    fields: {
                      ...DEFAULT_LABEL_TEMPLATE_CONFIG.fields,
                      showHeaderSubtitle: false,
                      showYarnCount: true,
                      showColorName: true,
                      showShift: false,
                      showOperator: false,
                      showSerialNumber: false,
                      showFooterNote: false
                    }
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-500 font-bold"
              >
                طرح قدیم کارخانه (خطی 1D مینیمال)
              </button>
              <button
                type="button"
                onClick={() =>
                  setDesignerDraft({
                    ...DEFAULT_LABEL_TEMPLATE_CONFIG,
                    barcodeType: 'BOTH'
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-500 font-bold"
              >
                طرح کامل صنعتی (خطی + QR)
              </button>
              <button
                type="button"
                onClick={() =>
                  setDesignerDraft({
                    ...DEFAULT_LABEL_TEMPLATE_CONFIG,
                    barcodeType: 'QR_2D'
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-orange-500 font-bold"
              >
                طرح استاندارد دوبعدی (QR 2D)
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Settings & Field Checkboxes */}
              <div className="lg:col-span-7 space-y-4 text-xs">
                {/* Barcode & Dimensions */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <h4 className="font-black text-slate-800 dark:text-slate-100">۱. تنظیمات بارکد و ابعاد لیبل حرارتی</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">نوع بارکد</label>
                      <select
                        value={designerDraft.barcodeType}
                        onChange={e => setDesignerDraft({ ...designerDraft, barcodeType: e.target.value as ErpBarcodeType })}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      >
                        <option value="LINEAR_1D">بارکد خطی 1D (قدیم کارخانه)</option>
                        <option value="QR_2D">بارکد دوبعدی (QR)</option>
                        <option value="BOTH">هر دو (خطی + QR)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">محتوای بارکد خطی</label>
                      <select
                        value={designerDraft.barcodeValueSource}
                        onChange={e => setDesignerDraft({ ...designerDraft, barcodeValueSource: e.target.value as any })}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      >
                        <option value="referenceCode">کد ارجاع (پیشوند خط + سریال + وزن خالص)</option>
                        <option value="serialNumber">شماره سریال (SN-...)</option>
                        <option value="productCode">کد کالا</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">ارتفاع بارکد خطی (px)</label>
                      <input
                        type="number"
                        min={24}
                        max={84}
                        value={designerDraft.linearBarcodeHeightPx}
                        onChange={e => setDesignerDraft({ ...designerDraft, linearBarcodeHeightPx: Math.max(24, Math.min(84, parseInt(e.target.value) || 44)) })}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">عرض لیبل (mm)</label>
                      <input
                        type="number"
                        min={40}
                        max={210}
                        value={designerDraft.labelWidthMm}
                        onChange={e => setDesignerDraft({ ...designerDraft, labelWidthMm: parseInt(e.target.value) || 100 })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">طول لیبل (mm)</label>
                      <input
                        type="number"
                        min={30}
                        max={297}
                        value={designerDraft.labelHeightMm}
                        onChange={e => setDesignerDraft({ ...designerDraft, labelHeightMm: parseInt(e.target.value) || 70 })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">سایز فونت</label>
                      <select
                        value={designerDraft.fontSizeScale}
                        onChange={e => setDesignerDraft({ ...designerDraft, fontSizeScale: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      >
                        <option value="SMALL">کوچک (فشرده)</option>
                        <option value="MEDIUM">متوسط (استاندارد)</option>
                        <option value="LARGE">بزرگ (خوانا)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">نوع کادر</label>
                      <select
                        value={designerDraft.borderStyle}
                        onChange={e => setDesignerDraft({ ...designerDraft, borderStyle: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      >
                        <option value="SOLID">خط ممتد استاندارد</option>
                        <option value="DOUBLE">کادر دوخطه ضخیم</option>
                        <option value="NONE">حاشیه نازک</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">تیتر سفارشی بالا (اختیاری)</label>
                      <input
                        type="text"
                        value={designerDraft.headerTitle}
                        onChange={e => setDesignerDraft({ ...designerDraft, headerTitle: e.target.value })}
                        placeholder={selectedCompany?.name || 'نام شرکت'}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">زیرتیتر لیبل</label>
                      <input
                        type="text"
                        value={designerDraft.headerSubtitle}
                        onChange={e => setDesignerDraft({ ...designerDraft, headerSubtitle: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">متن پاورقی (Footer)</label>
                      <input
                        type="text"
                        value={designerDraft.footerNote}
                        onChange={e => setDesignerDraft({ ...designerDraft, footerNote: e.target.value })}
                        placeholder="مثال: ساخت ایران - کنترل کیفیت تایید شده"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={designerDraft.showBarcodeHumanText}
                      onChange={e => setDesignerDraft({ ...designerDraft, showBarcodeHumanText: e.target.checked })}
                      className="accent-orange-600 w-4 h-4"
                    />
                    <span>نمایش حروف و اعداد خوانای کد زیر بارکد خطی</span>
                  </label>
                </div>

                {/* Toggleable Fields */}
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-800 dark:text-slate-100">۲. تعیین فیلدهایی که روی لیبل پرینت می‌شوند</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allOn = { ...designerDraft.fields };
                          (Object.keys(allOn) as (keyof typeof allOn)[]).forEach(k => { allOn[k] = true; });
                          setDesignerDraft({ ...designerDraft, fields: allOn });
                        }}
                        className="text-[10px] font-black text-emerald-600 hover:underline"
                      >
                        انتخاب همه
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const minFields = { ...designerDraft.fields };
                          (Object.keys(minFields) as (keyof typeof minFields)[]).forEach(k => { minFields[k] = false; });
                          minFields.showCompanyName = true;
                          minFields.showProductName = true;
                          minFields.showNetWeight = true;
                          minFields.showReferenceCode = true;
                          setDesignerDraft({ ...designerDraft, fields: minFields });
                        }}
                        className="text-[10px] font-black text-slate-500 hover:underline"
                      >
                        حداقل فیلدها
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { key: 'showCompanyName', label: 'نام شرکت / کارخانه' },
                      { key: 'showHeaderSubtitle', label: 'زیرتیتر بالای لیبل' },
                      { key: 'showProductName', label: 'نام کالا (نخ)' },
                      { key: 'showProductCode', label: 'کد کالا' },
                      { key: 'showYarnCount', label: 'نمره نخ' },
                      { key: 'showColorName', label: 'رنگ نخ' },
                      { key: 'showMachineLine', label: 'خط تولید / ماشین' },
                      { key: 'showShift', label: 'شیفت کاری' },
                      { key: 'showLotNumber', label: 'شماره لات (Lot)' },
                      { key: 'showConesCount', label: 'تعداد دوک' },
                      { key: 'showGrade', label: 'گرید کیفی (A/B/C)' },
                      { key: 'showGrossWeight', label: 'وزن ناخالص (Gross)' },
                      { key: 'showTareWeight', label: 'وزن ظرف و دوک (Tare)' },
                      { key: 'showNetWeight', label: 'وزن خالص (Net)' },
                      { key: 'showReferenceCode', label: 'کد ارجاع کارتن' },
                      { key: 'showSerialNumber', label: 'شماره سریال (SN)' },
                      { key: 'showDate', label: 'تاریخ تولید' },
                      { key: 'showTime', label: 'ساعت دقیق توزین' },
                      { key: 'showOperator', label: 'نام اپراتور توزین' },
                      { key: 'showFooterNote', label: 'متن پاورقی دلخواه' }
                    ].map(item => {
                      const k = item.key as keyof ErpLabelTemplateConfig['fields'];
                      return (
                        <label
                          key={item.key}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-colors ${
                            designerDraft.fields[k]
                              ? 'bg-orange-50/70 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800 text-slate-800 dark:text-slate-100'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(designerDraft.fields[k])}
                            onChange={e =>
                              setDesignerDraft({
                                ...designerDraft,
                                fields: { ...designerDraft.fields, [k]: e.target.checked }
                              })
                            }
                            className="accent-orange-600 w-3.5 h-3.5"
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Live WYSIWYG Label Preview */}
              <div className="lg:col-span-5 flex flex-col justify-between bg-slate-100/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200">
                  <span>پیش‌نمایش زنده خروجی چاپ:</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {designerDraft.labelWidthMm} × {designerDraft.labelHeightMm} mm
                  </span>
                </div>

                <div className="my-auto">
                  <CartonLabelCard
                    companyName={selectedCompany?.name || 'شرکت تولیدی و صنعتی'}
                    template={designerDraft}
                    carton={{
                      productName: selectedItemObj?.name || 'نخ تکسچره پلی‌استر DTY 150/48 NIM',
                      productCode: selectedItemObj?.code || 'YN-3001',
                      yarnCount: selectedItemObj?.yarnCount || '150/48',
                      colorName: selectedItemObj?.colorName || 'سفید خام',
                      machineCode: lines.find(l => l.id === selectedLineId)?.name || 'خط تکسچره ۱',
                      shift: shiftName || 'شیفت صبح A',
                      lotNumber: lotNumber || 'L405-88',
                      conesCount: conesCount || 6,
                      grade: grade || 'A',
                      grossWeightKg: grossWeightKg || 25.61,
                      totalTareKg: calculatedTareKg || 2.11,
                      netWeightKg: calculatedNetKg || 23.5,
                      referenceCode: buildCartonReferenceCode(
                        lines.find(l => l.id === selectedLineId),
                        1001,
                        calculatedNetKg || 23.5
                      ),
                      serialNumber: 'SN-050820-01001',
                      createdDateJalali: getTodayJalali(),
                      createdTimeExact: getExactTimeNow(),
                      createdBy: currentUser?.fullName || 'اپراتور خط'
                    }}
                  />
                </div>

                <div className="text-[11px] text-slate-500 leading-relaxed bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  بارکد خطی با استاندارد صنعتی <strong>Code 128B</strong> و بارکد دوبعدی <strong>QR</strong> به صورت کاملاً آفلاین بدون نیاز به اینترنت رندر و چاپ می‌شوند.
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowLabelDesignerModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveLabelTemplate}
                className="px-6 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 size={15} />
                <span>ذخیره طراحی و اعمال در چاپ لیبل‌ها</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT BOM (FORMULA & COST ENGINE) */}
      {/* --------------------------------------------------------------------------------- */}
      {showAddEditBomModal && editingBom && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 flex items-center justify-center border border-orange-200 dark:border-orange-800">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                    {editingBom.id ? 'ویرایش فرمول ساخت و آنالیز بهای تمام‌شده (BOM)' : 'تعریف فرمول ساخت جدید (BOM)'}
                  </h3>
                  <p className="text-xs text-slate-400">تنظیم مصرف مواد اولیه، ضایعات استاندارد، سربار کارخانه و ملزومات بسته‌بندی</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddEditBomModal(false);
                  setEditingBom(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Basic Info Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold block mb-1">کد فرمول *</label>
                <input
                  type="text"
                  value={editingBom.code || ''}
                  onChange={e => setEditingBom({ ...editingBom, code: e.target.value })}
                  placeholder="مثال: BOM-001"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold block mb-1">عنوان فرمول ساخت *</label>
                <input
                  type="text"
                  value={editingBom.title || ''}
                  onChange={e => setEditingBom({ ...editingBom, title: e.target.value })}
                  placeholder="مثال: فرمول استاندارد نخ تکسچره DTY 150/48"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">نسخه / وضعیت</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={editingBom.version || 'V1.0'}
                    onChange={e => setEditingBom({ ...editingBom, version: e.target.value })}
                    className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-center"
                  />
                  <select
                    value={editingBom.status || 'ACTIVE'}
                    onChange={e => setEditingBom({ ...editingBom, status: e.target.value as any })}
                    className="w-1/2 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-center"
                  >
                    <option value="ACTIVE">فعال</option>
                    <option value="DRAFT">پیش‌نویس</option>
                    <option value="ARCHIVED">بایگانی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">ضایعات استاندارد (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingBom.wastePercent ?? 2.5}
                  onChange={e => setEditingBom({ ...editingBom, wastePercent: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-amber-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold block mb-1">دستمزد مستقیم هر کیلو (ریال)</label>
                <input
                  type="number"
                  value={editingBom.directLaborPerKg ?? 0}
                  onChange={e => setEditingBom({ ...editingBom, directLaborPerKg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">سربار کارخانه هر کیلو (ریال)</label>
                <input
                  type="number"
                  value={editingBom.factoryOverheadPerKg ?? 0}
                  onChange={e => setEditingBom({ ...editingBom, factoryOverheadPerKg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                />
              </div>
            </div>

            {/* Multi-Product Assignment Section */}
            {(() => {
              const selectedIds = getBomFinishedItemIds(editingBom);
              const selectedSet = new Set(selectedIds);
              const visibleItems = bomAssignableItems.filter(itm =>
                !bomModalItemSearch.trim() ||
                matchesSearchQuery(bomModalItemSearch, [itm.code, itm.name, itm.yarnCount, itm.colorName, itm.groupName])
              );
              const toggleItemSelection = (itemId: string) => {
                const nextIds = selectedSet.has(itemId)
                  ? selectedIds.filter(id => id !== itemId)
                  : [...selectedIds, itemId];
                const primary = nextIds.length > 0 ? erpState.items.find(i => i.id === nextIds[0]) : undefined;
                setEditingBom({
                  ...editingBom,
                  finishedItemIds: nextIds,
                  finishedItemId: primary?.id || '',
                  finishedItemCode: primary?.code || '',
                  finishedItemName: primary?.name || ''
                });
              };
              const selectAllVisible = () => {
                const merged = Array.from(new Set([...selectedIds, ...visibleItems.map(i => i.id)]));
                const primary = merged.length > 0 ? erpState.items.find(i => i.id === merged[0]) : undefined;
                setEditingBom({
                  ...editingBom,
                  finishedItemIds: merged,
                  finishedItemId: primary?.id || '',
                  finishedItemCode: primary?.code || '',
                  finishedItemName: primary?.name || ''
                });
              };
              const clearAllSelection = () => {
                setEditingBom({
                  ...editingBom,
                  finishedItemIds: [],
                  finishedItemId: '',
                  finishedItemCode: '',
                  finishedItemName: ''
                });
              };

              return (
                <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-black text-slate-800 dark:text-slate-100 block">
                        تخصیص فرمول تولید به کالاها (امکان انتخاب یک یا چند کالا):
                      </span>
                      <span className="text-[11px] text-slate-500">
                        کالاهای انتخاب‌شده هنگام توزین باسکول، وزن دوک/کارتن و وضعیت قفل این فرمول را به صورت خودکار دریافت می‌کنند.
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-black text-[11px] shrink-0 self-start sm:self-auto">
                      {selectedIds.length} کالا انتخاب شده
                    </span>
                  </div>

                  {bomAssignableItems.length > 0 ? (
                    <>
                      {selectedIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedIds.map(id => {
                            const itm = erpState.items.find(i => i.id === id);
                            if (!itm) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 text-[11px] font-bold shadow-xs"
                              >
                                <span className="font-mono text-orange-600">{itm.code}</span>
                                <span className="text-slate-800 dark:text-slate-100">{itm.name}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleItemSelection(id)}
                                  className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                  title="حذف از این فرمول"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[180px]">
                          <Search size={13} className="absolute right-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            value={bomModalItemSearch}
                            onChange={e => setBomModalItemSearch(e.target.value)}
                            placeholder="جستجوی کالا برای تخصیص (کد، نام، نمره، رنگ)..."
                            className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={selectAllVisible}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-black text-emerald-700 dark:text-emerald-400 hover:border-emerald-400 cursor-pointer"
                        >
                          انتخاب همه ({visibleItems.length})
                        </button>
                        {selectedIds.length > 0 && (
                          <button
                            type="button"
                            onClick={clearAllSelection}
                            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-rose-600 hover:border-rose-400 cursor-pointer"
                          >
                            پاک کردن انتخاب
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-0.5">
                        {visibleItems.map(itm => {
                          const isChecked = selectedSet.has(itm.id);
                          return (
                            <label
                              key={itm.id}
                              className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-orange-50/80 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 font-black text-slate-900 dark:text-slate-100'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleItemSelection(itm.id)}
                                className="accent-orange-600 w-3.5 h-3.5 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate">{itm.name}</div>
                                <div className="text-[10px] font-mono text-slate-400 truncate">
                                  {itm.code} {itm.yarnCount ? `• ${itm.yarnCount}` : ''} {itm.colorName ? `• ${itm.colorName}` : ''}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                        {visibleItems.length === 0 && (
                          <div className="col-span-full py-3 text-center text-[11px] text-slate-400 font-bold">
                            کالایی با این مشخصات یافت نشد.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <input
                      type="text"
                      value={editingBom.finishedItemName || ''}
                      onChange={e => setEditingBom({ ...editingBom, finishedItemName: e.target.value })}
                      placeholder="نام محصول تولیدی (مثال: نخ DTY 150/48)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    />
                  )}
                </div>
              );
            })()}

            {/* BOM Packaging Tare Weights & Lock Section */}
            <div className="p-3.5 rounded-2xl border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-black text-orange-900 dark:text-orange-200">
                    پارامترهای بسته‌بندی، وزن دوک و کارتن و قفل باسکول:
                  </h4>
                  <p className="text-[11px] text-orange-700/80 dark:text-orange-300/80">
                    این مقادیر هنگام توزین خط تولید برای تمام کالاهای متصل به این فرمول اعمال می‌شوند.
                  </p>
                </div>
                <span className="font-mono text-[11px] font-black px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 shrink-0 self-start sm:self-auto" dir="ltr">
                  Tare: {(
                    ((editingBom.cartonWeightGrams ?? 1450) +
                      (editingBom.defaultConesPerCarton ?? 6) * (editingBom.coneWeightGrams ?? 110)) /
                    1000
                  ).toFixed(3)} Kg
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">تعداد دوک پیش‌فرض</label>
                  <input
                    type="number"
                    min={1}
                    value={editingBom.defaultConesPerCarton ?? 6}
                    onChange={e => setEditingBom({ ...editingBom, defaultConesPerCarton: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">وزن کارتن خالی (گرم)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingBom.cartonWeightGrams ?? 1450}
                    onChange={e => setEditingBom({ ...editingBom, cartonWeightGrams: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">وزن هر دوک (گرم)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingBom.coneWeightGrams ?? 110}
                    onChange={e => setEditingBom({ ...editingBom, coneWeightGrams: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-center"
                  />
                </div>
                <label className="flex items-center gap-2 p-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/40 cursor-pointer h-[38px]">
                  <input
                    type="checkbox"
                    checked={Boolean(editingBom.isTareLocked)}
                    onChange={e => setEditingBom({ ...editingBom, isTareLocked: e.target.checked })}
                    className="accent-amber-600 w-4 h-4 shrink-0"
                  />
                  <span className="font-black text-[11px] text-amber-900 dark:text-amber-200 truncate">
                    قفل وزن دوک و کارتن
                  </span>
                </label>
              </div>
            </div>

            {/* Components Table (Selected strictly from defined system items + WACC costing) */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                    اجزای مصرفی فرمول تولید (انتخاب از کالاهای تعریف‌شده سیستم و کسر خودکار از «{PRODUCTION_FLOOR_WAREHOUSE_NAME}»):
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    هر قلم مصرفی را از کالاهای تعریف‌شده انتخاب کرده و مبنای کسر (وزن در ۱ کیلو، درصد از وزن خالص لیبل، تعداد در هر کارتن یا تعداد در هر دوک) را تعیین کنید.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openCreateItemAt(selectedGroupId)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 hover:bg-slate-200 cursor-pointer"
                    title="تعریف کالای ماده اولیه یا بسته‌بندی جدید در درخت کالا"
                  >
                    <Plus size={13} />
                    <span>تعریف کالای جدید در سیستم</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncEditingBomWithWarehouseWacc}
                    className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-black flex items-center gap-1 hover:bg-indigo-100 cursor-pointer"
                    title="بروزرسانی نرخ واحد کلیه اقلام از میانگین موزون لحظه‌ای انبار (WACC)"
                  >
                    <RefreshCw size={13} />
                    <span>بروزرسانی نرخ از میانگین موزون انبار</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddComponentToEditingBom}
                    className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>افزودن جزء مصرفی به فرمول</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-2.5 text-center w-9">ردیف</th>
                      <th className="p-2.5 min-w-[230px]">انتخاب کالای مصرفی (از کالاهای تعریف‌شده سیستم)</th>
                      <th className="p-2.5 w-44">مبنای مصرف و کسر از انبار</th>
                      <th className="p-2.5 text-center w-28">مقدار / درصد</th>
                      <th className="p-2.5 text-center w-20">پرت جزء (%)</th>
                      <th className="p-2.5 text-center w-20">واحد</th>
                      <th className="p-2.5 text-center w-36">نرخ میانگین موزون (ریال)</th>
                      <th className="p-2.5 text-center w-32">سهم در ۱ کیلو محصول</th>
                      <th className="p-2.5 text-center w-10">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(editingBom.components || []).map((comp, idx) => {
                      const matchedItem = resolveComponentDefinedItem(comp, erpState.items || []);
                      const waccInfo = matchedItem ? itemWaccMap.get(matchedItem.id) : undefined;
                      const basis: ErpBomConsumptionBasis = comp.consumptionBasis || 'PER_KG_NET';
                      const conesPerCarton = Math.max(1, Number(editingBom.defaultConesPerCarton ?? 6));
                      const stdCartonNetKg = 23.5;
                      const wasteFactor = 1 + Math.max(0, Number(comp.wastePercent || 0)) / 100;
                      let effectivePer1Kg = Number(comp.qtyPerKgOutput || 0) * wasteFactor;
                      if (basis === 'PERCENT_OF_NET') {
                        const pct = Number(comp.consumptionPercent ?? (comp.qtyPerKgOutput || 0) * 100);
                        effectivePer1Kg = (pct / 100) * wasteFactor;
                      } else if (basis === 'PER_CARTON') {
                        effectivePer1Kg = (Number(comp.qtyPerKgOutput || 0) * wasteFactor) / stdCartonNetKg;
                      } else if (basis === 'PER_CONE') {
                        effectivePer1Kg = (Number(comp.qtyPerKgOutput || 0) * conesPerCarton * wasteFactor) / stdCartonNetKg;
                      }
                      const effectiveRate =
                        waccInfo && waccInfo.costSource === 'WACC_WAREHOUSE' && waccInfo.waccUnitCostRials > 0
                          ? waccInfo.waccUnitCostRials
                          : Number(comp.unitCostRials || matchedItem?.unitCost || 0);
                      const totalPartPerKg = Math.round(effectivePer1Kg * effectiveRate);

                      return (
                        <tr key={comp.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 align-top">
                          <td className="p-2 text-center font-mono text-slate-400 pt-3">{idx + 1}</td>
                          <td className="p-2 space-y-1">
                            <select
                              value={matchedItem?.id || comp.itemId || ''}
                              onChange={e => handleSelectDefinedItemForComponent(idx, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-[11px]"
                            >
                              <option value="">-- انتخاب کالا از فهرست کالاهای تعریف‌شده --</option>
                              {bomComponentCandidateItems.map(itm => {
                                const catLabel =
                                  itm.category === 'RAW_MATERIAL'
                                    ? 'ماده اولیه'
                                    : itm.category === 'PACKAGING'
                                    ? 'بسته‌بندی'
                                    : itm.category === 'WASTE'
                                    ? 'ضایعات'
                                    : 'نخ/کالا';
                                const info = itemWaccMap.get(itm.id);
                                const prdStock = info?.productionWhStockQty ?? 0;
                                return (
                                  <option key={itm.id} value={itm.id}>
                                    [{catLabel}] {itm.code} — {itm.name} ({itm.unit || 'کیلوگرم'} | موجودی انبار تولید: {prdStock})
                                  </option>
                                );
                              })}
                            </select>
                            {matchedItem ? (
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                                  کالای متصل: {matchedItem.code}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                                  موجودی انبار تولید: {(waccInfo?.productionWhStockQty ?? 0).toLocaleString()} {matchedItem.unit}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={comp.itemName}
                                  onChange={e => handleUpdateComponentInEditingBom(idx, { itemName: e.target.value })}
                                  placeholder="نام قلم یا انتخاب از لیست بالا..."
                                  className="w-full px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 text-[11px] font-bold"
                                />
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <select
                              value={basis}
                              onChange={e => {
                                const nextBasis = e.target.value as ErpBomConsumptionBasis;
                                if (nextBasis === 'PERCENT_OF_NET') {
                                  const pct = comp.consumptionPercent ?? Number(((comp.qtyPerKgOutput || 1) * 100).toFixed(2));
                                  handleUpdateComponentInEditingBom(idx, {
                                    consumptionBasis: nextBasis,
                                    consumptionPercent: pct,
                                    qtyPerKgOutput: Number((pct / 100).toFixed(6))
                                  });
                                } else if (nextBasis === 'PER_CARTON' || nextBasis === 'PER_CONE') {
                                  handleUpdateComponentInEditingBom(idx, {
                                    consumptionBasis: nextBasis,
                                    qtyPerKgOutput: comp.qtyPerKgOutput && comp.qtyPerKgOutput >= 1 ? comp.qtyPerKgOutput : 1,
                                    unit: matchedItem?.unit || 'عدد'
                                  });
                                } else {
                                  handleUpdateComponentInEditingBom(idx, {
                                    consumptionBasis: nextBasis
                                  });
                                }
                              }}
                              className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-[11px]"
                            >
                              <option value="PER_KG_NET">ضریب در ۱ کیلو خالص</option>
                              <option value="PERCENT_OF_NET">درصد از وزن خالص لیبل (%)</option>
                              <option value="PER_CARTON">تعداد در هر کارتن تولیدی</option>
                              <option value="PER_CONE">تعداد در هر دوک داخل کارتن</option>
                            </select>
                          </td>
                          <td className="p-2">
                            {basis === 'PERCENT_OF_NET' ? (
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={comp.consumptionPercent ?? Number(((comp.qtyPerKgOutput || 0) * 100).toFixed(2))}
                                  onChange={e => {
                                    const pct = parseFloat(e.target.value) || 0;
                                    handleUpdateComponentInEditingBom(idx, {
                                      consumptionPercent: pct,
                                      qtyPerKgOutput: Number((pct / 100).toFixed(6))
                                    });
                                  }}
                                  className="w-full px-2 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-950/20 text-center font-mono font-black text-indigo-700 dark:text-indigo-300"
                                />
                                <span className="block text-[9px] text-center text-slate-400 mt-0.5 font-mono">
                                  ={(Number(comp.consumptionPercent ?? (comp.qtyPerKgOutput || 0) * 100) / 100).toFixed(3)} در کیلو
                                </span>
                              </div>
                            ) : (
                              <div>
                                <input
                                  type="number"
                                  step={basis === 'PER_KG_NET' ? '0.001' : '1'}
                                  value={comp.qtyPerKgOutput}
                                  onChange={e => handleUpdateComponentInEditingBom(idx, { qtyPerKgOutput: parseFloat(e.target.value) || 0 })}
                                  className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono font-bold"
                                />
                                <span className="block text-[9px] text-center text-slate-400 mt-0.5">
                                  {basis === 'PER_CARTON'
                                    ? 'در هر کارتن'
                                    : basis === 'PER_CONE'
                                    ? `در هر دوک (×${conesPerCarton})`
                                    : 'در هر ۱ کیلو خالص'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              value={comp.wastePercent ?? 0}
                              onChange={e => handleUpdateComponentInEditingBom(idx, { wastePercent: Math.max(0, parseFloat(e.target.value) || 0) })}
                              className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono font-bold text-amber-600"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={comp.unit}
                              onChange={e => handleUpdateComponentInEditingBom(idx, { unit: e.target.value })}
                              placeholder="کیلوگرم"
                              className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-bold text-[11px]"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={comp.unitCostRials || 0}
                              onChange={e => handleUpdateComponentInEditingBom(idx, { unitCostRials: parseFloat(e.target.value) || 0 })}
                              className="w-full px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono font-bold"
                            />
                            {waccInfo && (
                              <span className="block text-[9px] text-center mt-0.5 font-bold text-indigo-600 dark:text-indigo-400">
                                {waccInfo.costSource === 'WACC_WAREHOUSE'
                                  ? `میانگین موزون انبار: ${waccInfo.waccUnitCostRials.toLocaleString()}`
                                  : `نرخ پایه کالا: ${waccInfo.waccUnitCostRials.toLocaleString()}`}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-center font-mono font-black text-slate-700 dark:text-slate-200 pt-3" dir="ltr">
                            {totalPartPerKg.toLocaleString()}
                          </td>
                          <td className="p-2 text-center pt-2.5">
                            <button
                              type="button"
                              onClick={() => handleRemoveComponentFromEditingBom(idx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {(editingBom.components || []).length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-slate-400 font-bold">
                          هنوز هیچ جزء مصرفی به این فرمول افزوده نشده است. دکمه «افزودن جزء مصرفی به فرمول» را بزنید.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live Cost Calculation Engine Bar (Accounting Standard WACC + Direct Labor + Factory Overhead = COGM) */}
            {(() => {
              const liveModalEval = evaluateBomCostAndConsumption({
                bom: editingBom,
                items: erpState.items || [],
                waccMap: itemWaccMap,
                batchNetWeightKg: 23.5,
                batchCartonsCount: 1,
                batchConesCount: Math.max(1, Number(editingBom.defaultConesPerCarton ?? 6))
              });
              const totalMaterialsCost = liveModalEval.rawMaterialsCostPerKgRials;
              const labor = liveModalEval.directLaborPerKgRials;
              const overhead = liveModalEval.factoryOverheadPerKgRials;
              const totalCostPerKg = liveModalEval.cogmPerKgRials;

              return (
                <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl border border-indigo-500/20 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">بهای مواد مصرفی هر کیلو (میانگین موزون WACC):</span>
                    <strong className="font-mono font-black text-sm text-amber-300" dir="ltr">{totalMaterialsCost.toLocaleString()} ریال</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">دستمزد مستقیم هر کیلو:</span>
                    <strong className="font-mono font-black text-sm text-blue-300" dir="ltr">{labor.toLocaleString()} ریال</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">سربار ساخت هر کیلو:</span>
                    <strong className="font-mono font-black text-sm text-purple-300" dir="ltr">{overhead.toLocaleString()} ریال</strong>
                  </div>
                  <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-400/30">
                    <span className="text-emerald-300 block text-[10px] font-bold">بهای تمام‌شده ۱ کیلو محصول نهایی (COGM):</span>
                    <strong className="font-mono font-black text-base text-emerald-400" dir="ltr">{totalCostPerKg.toLocaleString()} ریال</strong>
                  </div>
                </div>
              );
            })()}

            {/* Notes */}
            <div>
              <label className="font-bold text-xs block mb-1">یادداشت‌ها و مشخصات فنی فرمول</label>
              <textarea
                value={editingBom.notes || ''}
                onChange={e => setEditingBom({ ...editingBom, notes: e.target.value })}
                placeholder="توضیحات تکمیلی، استاندارد آزمایشگاهی، رطوبت مجاز و..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowAddEditBomModal(false);
                  setEditingBom(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveBom}
                className="px-6 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={15} />
                <span>ذخیره رسمی فرمول ساخت (BOM)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------------------- */}
      {/* MODAL: BOM BATCH SIMULATION & REQUIREMENTS CALCULATOR */}
      {/* --------------------------------------------------------------------------------- */}
      {showSimulationModal && simulationBom && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
                  <Calculator size={20} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100">
                    شبیه‌سازی سفارش تولید، محاسبه مواد مصرفی و بهای تمام‌شده (میانگین موزون WACC)
                  </h3>
                  <p className="text-xs text-slate-400">محاسبه دقیق اقلام کسرشونده از انبار تولید بر اساس وزن، درصد، کارتن و دوک</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSimulationModal(false);
                  setSimulationBom(null);
                }}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Inputs: Select BOM & Batch Target Kg */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div>
                <label className="font-bold block mb-1">فرمول ساخت انتخابی:</label>
                <select
                  value={simulationBom.id}
                  onChange={e => {
                    const sel = allBoms.find(b => b.id === e.target.value);
                    if (sel) setSimulationBom(sel);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                >
                  {allBoms.map(b => (
                    <option key={b.id} value={b.id}>{b.code} — {b.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">حجم کل سفارش تولید (کیلوگرم نخ خالص):</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="100"
                    value={simulationBatchQtyKg}
                    onChange={e => setSimulationBatchQtyKg(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-black text-indigo-600 text-sm"
                  />
                  <div className="flex gap-1">
                    {[1000, 5000, 10000, 25000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSimulationBatchQtyKg(val)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${simulationBatchQtyKg === val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-200 text-slate-600'}`}
                      >
                        {(val / 1000)}t
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Simulation Results Printable Card */}
            <div id="bom-simulation-ticket" className="space-y-4">
              {(() => {
                const simAssignedItems = getBomAssignedItemsList(simulationBom);
                const batchKg = simulationBatchQtyKg;
                const estCartons = Math.max(1, Math.round(batchKg / 23.5));
                const conesPerCarton = Math.max(1, Number(simulationBom.defaultConesPerCarton ?? 6));
                const estCones = estCartons * conesPerCarton;
                const simEval = evaluateBomCostAndConsumption({
                  bom: simulationBom,
                  items: erpState.items || [],
                  waccMap: itemWaccMap,
                  batchNetWeightKg: batchKg,
                  batchCartonsCount: estCartons,
                  batchConesCount: estCones
                });

                const costPerKg = simEval.cogmPerKgRials;
                const batchMaterialsCost = simEval.batchRawMaterialsCostRials;
                const batchLaborCost = simEval.batchDirectLaborCostRials;
                const batchOverheadCost = simEval.batchFactoryOverheadCostRials;
                const batchTotalCost = simEval.batchTotalCogmRials;

                return (
                  <>
                    {simAssignedItems.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-2 rounded-xl border border-indigo-200/70 dark:border-indigo-800 text-[11px]">
                        <span className="font-black text-indigo-800 dark:text-indigo-300">کالاهای متصل به این فرمول:</span>
                        {simAssignedItems.map(ai => (
                          <span key={ai.id} className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 font-bold">
                            {ai.code} — {ai.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400 block text-[10px]">تولید نخ خالص هدف:</span>
                        <strong className="font-mono font-black text-sm text-slate-800 dark:text-slate-100" dir="ltr">
                          {batchKg.toLocaleString()} Kg (~{estCartons} کارتن)
                        </strong>
                      </div>
                      <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                        <span className="text-amber-700 dark:text-amber-400 block text-[10px]">ضایعات استاندارد:</span>
                        <strong className="font-mono font-black text-sm text-amber-700 dark:text-amber-300" dir="ltr">
                          {((batchKg * (simulationBom.wastePercent || 0)) / 100).toFixed(1)} Kg ({simulationBom.wastePercent}%)
                        </strong>
                      </div>
                      <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30">
                        <span className="text-blue-700 dark:text-blue-400 block text-[10px]">بهای تمام‌شده هر کیلو (COGM):</span>
                        <strong className="font-mono font-black text-sm text-blue-700 dark:text-blue-300" dir="ltr">{costPerKg.toLocaleString()} ریال</strong>
                      </div>
                      <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <span className="text-emerald-700 dark:text-emerald-300 block text-[10px] font-bold">کل بهای تمام‌شده سفارش:</span>
                        <strong className="font-mono font-black text-sm text-emerald-600" dir="ltr">{batchTotalCost.toLocaleString()} ریال</strong>
                      </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 font-black text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="p-2.5 text-center">ردیف</th>
                            <th className="p-2.5">کالای مصرفی</th>
                            <th className="p-2.5 text-center">مبنای مصرف</th>
                            <th className="p-2.5 text-center font-black text-indigo-600">کل مقدار مورد نیاز در بچ</th>
                            <th className="p-2.5 text-center">موجودی انبار تولید</th>
                            <th className="p-2.5 text-center">نرخ میانگین موزون (ریال)</th>
                            <th className="p-2.5 text-center font-black text-emerald-600">مجموع هزینه قلم (ریال)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {simEval.components.map((line, idx) => {
                            const basisLabel =
                              line.consumptionBasis === 'PERCENT_OF_NET'
                                ? `${line.inputQtyOrPercent}% وزن خالص`
                                : line.consumptionBasis === 'PER_CARTON'
                                ? `${line.inputQtyOrPercent} در هر کارتن`
                                : line.consumptionBasis === 'PER_CONE'
                                ? `${line.inputQtyOrPercent} در هر دوک`
                                : `${line.inputQtyOrPercent} در هر کیلو`;
                            return (
                              <tr key={`${line.itemId}_${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                                <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">
                                  <span className="font-mono text-orange-600 ml-1">{line.itemCode}</span>
                                  <span>{line.itemName}</span>
                                </td>
                                <td className="p-2.5 text-center text-[11px] text-slate-500">
                                  {basisLabel}
                                  {line.wastePercent > 0 ? ` (+${line.wastePercent}% پرت)` : ''}
                                </td>
                                <td className="p-2.5 text-center font-mono font-black text-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20" dir="ltr">
                                  {line.batchConsumedQty.toLocaleString()} {line.unit}
                                </td>
                                <td className="p-2.5 text-center font-mono" dir="ltr">
                                  {line.productionWhStockQty.toLocaleString()} {line.unit}
                                </td>
                                <td className="p-2.5 text-center font-mono text-slate-500" dir="ltr">
                                  {line.waccUnitCostRials.toLocaleString()}
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">
                                  {line.batchTotalCostRials.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-800">
                          <tr>
                            <td colSpan={6} className="p-2.5 text-left font-black">مجموع بهای کل مواد مصرفی بچ (به نرخ میانگین موزون):</td>
                            <td className="p-2.5 text-center font-mono font-black text-emerald-600" dir="ltr">
                              {batchMaterialsCost.toLocaleString()} ریال
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="p-2.5 text-left">مجموع هزینه دستمزد مستقیم بچ:</td>
                            <td className="p-2.5 text-center font-mono" dir="ltr">
                              {batchLaborCost.toLocaleString()} ریال
                            </td>
                          </tr>
                          <tr>
                            <td colSpan={6} className="p-2.5 text-left">مجموع هزینه سربار ساخت بچ:</td>
                            <td className="p-2.5 text-center font-mono" dir="ltr">
                              {batchOverheadCost.toLocaleString()} ریال
                            </td>
                          </tr>
                          <tr className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black">
                            <td colSpan={6} className="p-3 text-left text-sm">جمع کل بهای تمام‌شده تولید این سفارش (COGM):</td>
                            <td className="p-3 text-center font-mono text-base" dir="ltr">
                              {batchTotalCost.toLocaleString()} ریال
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handlePrintElement('bom-simulation-ticket')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={15} />
                <span>چاپ کارنامه مواد و برآورد بهای سفارش</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSimulationModal(false);
                  setSimulationBom(null);
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer shadow-sm"
              >
                بستن پنجره شبیه‌سازی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
