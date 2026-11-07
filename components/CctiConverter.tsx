import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Download, CheckCircle, AlertTriangle, Settings2, Users, Search, Trash2, Edit2, Check, X, Archive, Eye, Printer, Calendar, ArrowUp, ArrowDown, FileCheck, Loader2, Share2, FileType, Image as ImageIcon, Plus, Layers, ArrowLeftRight, Sparkles } from 'lucide-react';
import * as XLSX from 'xlsx';

import { User } from '../types';
import { openSendToChat } from '../services/chatShareService';

interface CctiArchiveDetail {
    id: string;
    name: string;
    account: string;
    amount: number;
}

interface CctiArchive {
    id: string;
    date: number;
    monthName: string;
    personCount: number;
    totalAmount: number;
    fileContent: string;
    details: CctiArchiveDetail[];
}

interface Props {
    financialYear?: string;
    currentUser: User;
    canManageArchive?: boolean;
}

const CctiConverter: React.FC<Props> = ({ financialYear, currentUser, canManageArchive = false }) => {
    const [file, setFile] = useState<File | null>(null);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [archives, setArchives] = useState<CctiArchive[]>([]);
    const [selectedArchiveView, setSelectedArchiveView] = useState<CctiArchive | null>(null);
    
    // Mapping state
    const [idCol, setIdCol] = useState<string>(''); // Used for referencing saved info
    const [accountCol, setAccountCol] = useState<string>(''); // Optional now
    const [amountCol, setAmountCol] = useState<string>('');
    const [nameCol, setNameCol] = useState<string>('');
    
    // Config state
    const [delimiter, setDelimiter] = useState<string>(',');
    const [archiveMonthName, setArchiveMonthName] = useState<string>('');
    
    const [activeTab, setActiveTab] = useState<'pdf-merge' | 'convert' | 'manage' | 'archive'>('pdf-merge');
    const [archiveTab, setArchiveTab] = useState<'list' | 'kardex'>('list');
    const [kardexSearch, setKardexSearch] = useState('');
    const [selectedKardexPerson, setSelectedKardexPerson] = useState<string | null>(null);

    // PDF & Image Converter / Merger State
    const [pdfMergeFiles, setPdfMergeFiles] = useState<{ id: string; name: string; size: number; type: string; base64: string; previewUrl: string }[]>([]);
    const [scannerFilter, setScannerFilter] = useState<'magic_color' | 'crisp_bw' | 'enhance' | 'original'>('magic_color');
    const [isMerging, setIsMerging] = useState(false);
    const [mergedPdfResult, setMergedPdfResult] = useState<{ url: string; fileName: string; fileData: string } | null>(null);

    const pdfInputRef = useRef<HTMLInputElement>(null);

    const handlePdfFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;

        selectedFiles.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64 = evt.target?.result as string;
                setPdfMergeFiles(prev => [
                    ...prev,
                    {
                        id: Math.random().toString(36).substr(2, 9),
                        name: file.name,
                        size: file.size,
                        type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
                        base64: base64,
                        previewUrl: base64
                    }
                ]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const handleMovePdfFile = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === pdfMergeFiles.length - 1) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        const updated = [...pdfMergeFiles];
        const [movedItem] = updated.splice(index, 1);
        updated.splice(targetIndex, 0, movedItem);
        setPdfMergeFiles(updated);
    };

    const handleRemovePdfFile = (id: string) => {
        setPdfMergeFiles(prev => prev.filter(f => f.id !== id));
    };

    const handleRunMergeToPdf = async () => {
        if (pdfMergeFiles.length === 0) {
            alert('لطفاً حداقل یک تصویر یا فایل PDF انتخاب کنید.');
            return;
        }
        setIsMerging(true);
        setMergedPdfResult(null);
        try {
            const payload = pdfMergeFiles.map(f => ({
                name: f.name,
                fileName: f.name,
                data: f.base64,
                type: f.type.includes('pdf') ? 'pdf' : 'image'
            }));
            const response = await fetch('/api/tools/merge-to-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: payload, filter: scannerFilter })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'خطا در تبدیل و ادغام فایل‌ها');
            }
            const data = await response.json();
            setMergedPdfResult(data);
        } catch (err: any) {
            alert(err.message || 'خطا در پردازش ادغام');
        } finally {
            setIsMerging(false);
        }
    };

    const handleDeleteArchive = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('آیا از حذف این بایگانی مطمئن هستید؟ این عملیات غیرقابل بازگشت است.')) {
            const newArchives = archives.filter(a => a.id !== id);
            setArchives(newArchives);
            localStorage.setItem('ccti_archives', JSON.stringify(newArchives));
            if (selectedArchiveView?.id === id) {
                setSelectedArchiveView(null);
            }
        }
    };

    // Calculate Unique Persons for Kardex
    const kardexPersons = Array.from(new Set(archives.flatMap(a => a.details.map(d => d.name || d.id))));
    const filteredKardexPersons = kardexPersons.filter(p => p ? String(p).includes(kardexSearch) : false);
    const [savedPersons, setSavedPersons] = useState<Record<string, { account: string, name: string }>>({});
    
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAccount, setEditAccount] = useState('');
    const [editName, setEditName] = useState('');
    
    // New states for validation and dynamic IBAN
    const [sourceIban, setSourceIban] = useState<string>(() => localStorage.getItem('ccti_source_iban') || 'IR790110000000200043622006');
    const [expectedTotalAmount, setExpectedTotalAmount] = useState<string>('');
    
    const [manualRows, setManualRows] = useState<{id: string, name: string, account: string, amount: string}[]>([]);
    const [manualAmount, setManualAmount] = useState('');
    
    // For manage tab manual entry
    const [newPersonId, setNewPersonId] = useState('');
    const [newPersonName, setNewPersonName] = useState('');
    const [newPersonAccount, setNewPersonAccount] = useState('');
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const accountsFileInputRef = useRef<HTMLInputElement>(null);

    // Helper for Persian months and their days
    const PERSIAN_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
    const getPersianMonthDays = (monthIndex1Based: number, yearNum: number = 1404) => {
        if (monthIndex1Based >= 1 && monthIndex1Based <= 6) return 31;
        if (monthIndex1Based >= 7 && monthIndex1Based <= 11) return 30;
        const isLeap = ((yearNum + 38) * 31) % 128 < 31;
        return isLeap ? 30 : 29;
    };

    useEffect(() => {
        try {
            const options: Intl.DateTimeFormatOptions = { calendar: 'persian', year: 'numeric', month: 'numeric' };
            const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', options).formatToParts(new Date());
            const m = parseInt(parts.find(p => p.type === 'month')?.value || '1');
            const y = parseInt(parts.find(p => p.type === 'year')?.value || '1404');
            const mName = PERSIAN_MONTHS[m - 1] || `ماه ${m}`;
            const days = getPersianMonthDays(m, Number(financialYear || y));
            setArchiveMonthName(`حقوق ${mName} ${financialYear || y} (${days} روزه)`);
        } catch(e) {
            setArchiveMonthName(`حقوق ماه جاری`);
        }

        let localPersons: Record<string, { account: string, name: string }> = {};
        const data = localStorage.getItem('ccti_persons') || localStorage.getItem('ccti_persons_backup');
        if (data) {
            try {
                localPersons = JSON.parse(data) || {};
                setSavedPersons(localPersons);
            } catch (e) {}
        }
        
        let localArchives: CctiArchive[] = [];
        const archiveData = localStorage.getItem('ccti_archives');
        if (archiveData) {
            try {
                localArchives = JSON.parse(archiveData) || [];
                setArchives(localArchives);
            } catch(e){}
        }

        // Sync with permanent server storage (database.json) so accounts never disappear
        fetch('/api/ccti/data')
            .then(r => r.ok ? r.json() : null)
            .then(serverData => {
                if (!serverData) return;
                const serverPersons = serverData.persons || {};
                const mergedPersons: Record<string, { account: string, name: string }> = { ...serverPersons, ...localPersons };

                // Also auto-recover any valid IBANs from archives if not in memory
                const allArchives: CctiArchive[] = (Array.isArray(serverData.archives) && serverData.archives.length > localArchives.length)
                    ? serverData.archives
                    : localArchives;
                allArchives.forEach(arch => {
                    (arch.details || []).forEach(det => {
                        if (det.account && det.account !== 'EMPTY' && det.id) {
                            if (!mergedPersons[det.id]) {
                                mergedPersons[det.id] = { account: det.account, name: det.name || det.id };
                            }
                        }
                    });
                });

                setSavedPersons(mergedPersons);
                try {
                    localStorage.setItem('ccti_persons', JSON.stringify(mergedPersons));
                    localStorage.setItem('ccti_persons_backup', JSON.stringify(mergedPersons));
                } catch (e) {}

                if (Object.keys(mergedPersons).length > Object.keys(serverPersons).length) {
                    fetch('/api/ccti/persons', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ persons: mergedPersons, merge: true })
                    }).catch(() => {});
                }

                if (allArchives.length > 0) {
                    setArchives(allArchives);
                    try {
                        localStorage.setItem('ccti_archives', JSON.stringify(allArchives));
                    } catch (e) {}
                }
                if (serverData.sourceIban && !localStorage.getItem('ccti_source_iban')) {
                    setSourceIban(serverData.sourceIban);
                    localStorage.setItem('ccti_source_iban', serverData.sourceIban);
                }
            })
            .catch(() => {});
    }, []);

    const updateSavedPersons = (newData: Record<string, { account: string, name: string }>, mergeOnServer = true) => {
        setSavedPersons(newData);
        try {
            localStorage.setItem('ccti_persons', JSON.stringify(newData));
            localStorage.setItem('ccti_persons_backup', JSON.stringify(newData));
        } catch (e) {
            console.error('Error saving CCTI persons:', e);
        }
        fetch('/api/ccti/persons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ persons: newData, merge: mergeOnServer, sourceIban })
        }).catch(() => {});
    };

    const handleImportAccountsExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (!data || data.length === 0) {
                    alert('فایل اکسل انتخاب‌شده خالی است.');
                    return;
                }

                // Header detection
                let headerIdx = 0;
                for (let i = 0; i < Math.min(data.length, 25); i++) {
                    const rowStr = (data[i] || []).join(' ');
                    if (rowStr.includes('حساب') || rowStr.includes('شبا') || rowStr.includes('نام') || rowStr.includes('فامیل') || rowStr.includes('کد') || rowStr.includes('IBAN')) {
                        headerIdx = i;
                        break;
                    }
                }

                const headers = (data[headerIdx] || []).map(h => String(h || '').trim());
                
                // Column matching
                const accountColIdx = headers.findIndex(h => h.includes('شبا') || h.includes('حساب') || h.toUpperCase().includes('IBAN') || h.includes('کارت'));
                
                // Smart Name Detection (Separate First Name & Last Name OR Combined Name)
                const firstNameIdx = headers.findIndex(h => h && (h === 'نام' || h.includes('نام کوچک') || (h.includes('نام') && !h.includes('خانوادگی') && !h.includes('فامیل') && !h.includes('پدر') && !h.includes('پرسنل') && !h.includes('شعبه') && !h.includes('بانک')) || h.toLowerCase() === 'first name' || h.toLowerCase() === 'firstname'));
                const lastNameIdx = headers.findIndex(h => h && (h.includes('خانوادگی') || h.includes('فامیل') || h.includes('شهرت') || h.toLowerCase().includes('last name') || h.toLowerCase().includes('lastname') || h.toLowerCase().includes('family')));
                const fullNameIdx = headers.findIndex(h => h && (h.includes('نام و نام خانوادگی') || h.includes('نام و فامیل') || h.includes('نام پرسنل') || h.includes('نام کامل') || h.includes('مشخصات') || h.toLowerCase().includes('full name') || (h.includes('نام') && lastNameIdx === -1)));

                const idColIdx = headers.findIndex(h => h && (h.includes('کد پرسنلی') || h.includes('شناسه') || h.includes('کد ملی') || h.includes('شماره پرسنلی') || h.includes('پرونده') || (h.includes('کد') && !h.includes('شعبه') && !h.includes('بانک')) || h.toUpperCase() === 'ID'));

                const rows = data.slice(headerIdx + 1);
                let importedCount = 0;
                const newSaved = { ...savedPersons };

                const normalizeDigits = (str: string) => {
                    if (!str) return '';
                    return String(str)
                        .replace(/[۰-۹]/g, (d: any) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                        .replace(/[٠-٩]/g, (d: any) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                        .replace(/ي/g, 'ی')
                        .replace(/ك/g, 'ک')
                        .replace(/\s+/g, ' ')
                        .trim();
                };

                rows.forEach((row, idx) => {
                    if (!Array.isArray(row) || row.length === 0) return;

                    let rawAccount = accountColIdx !== -1 ? String(row[accountColIdx] || '').trim() : '';
                    let rawId = idColIdx !== -1 ? String(row[idColIdx] || '').trim() : '';
                    let rawName = '';

                    // Combine separate First Name + Last Name columns if present
                    if (firstNameIdx !== -1 && lastNameIdx !== -1 && firstNameIdx !== lastNameIdx) {
                        const fname = String(row[firstNameIdx] || '').trim();
                        const lname = String(row[lastNameIdx] || '').trim();
                        rawName = `${fname} ${lname}`.replace(/\s+/g, ' ').trim();
                    } else if (fullNameIdx !== -1) {
                        rawName = String(row[fullNameIdx] || '').trim();
                    } else if (firstNameIdx !== -1 || lastNameIdx !== -1) {
                        const fname = firstNameIdx !== -1 ? String(row[firstNameIdx] || '').trim() : '';
                        const lname = lastNameIdx !== -1 ? String(row[lastNameIdx] || '').trim() : '';
                        rawName = `${fname} ${lname}`.replace(/\s+/g, ' ').trim();
                    }

                    // Fallback account detection if header wasn't standard
                    if (!rawAccount) {
                        for (const cell of row) {
                            const cStr = normalizeDigits(String(cell || '')).replace(/[\s-]/g, '');
                            if (cStr.toUpperCase().startsWith('IR') || (cStr.length >= 12 && /^\d+$/.test(cStr))) {
                                rawAccount = cStr;
                                break;
                            }
                        }
                    }

                    // Fallback name detection if name wasn't found by header
                    if (!rawName) {
                        const textCells = row
                            .map((c, cIdx) => ({ val: String(c || '').trim(), cIdx }))
                            .filter(item => item.cIdx !== accountColIdx && item.cIdx !== idColIdx && item.val.length >= 2 && /[\u0600-\u06FF]/.test(item.val) && !item.val.includes('جمع'));
                        if (textCells.length >= 2) {
                            rawName = `${textCells[0].val} ${textCells[1].val}`.trim();
                        } else if (textCells.length === 1) {
                            rawName = textCells[0].val;
                        }
                    }

                    if (!rawAccount) return;
                    if (rawName.includes('جمع کل') || rawName === 'جمع' || rawName === 'مجموع') return;

                    const normAccount = normalizeDigits(rawAccount).replace(/[\s-]/g, '').toUpperCase();
                    if (normAccount.length < 5) return;

                    const normName = normalizeDigits(rawName);
                    const normId = normalizeDigits(rawId);

                    // Find if this person already exists by ID or Name so we update in-place without duplicating
                    let targetKey = normId || normName || `P_${idx + 1}`;
                    for (const [existingKey, existingVal] of Object.entries(newSaved)) {
                        if ((normId && normalizeDigits(existingKey) === normId) || (normName && normalizeDigits(existingVal.name) === normName) || (normName && normalizeDigits(existingKey) === normName)) {
                            targetKey = existingKey;
                            break;
                        }
                    }

                    newSaved[targetKey] = {
                        account: normAccount,
                        name: normName || newSaved[targetKey]?.name || targetKey
                    };

                    importedCount++;
                });

                if (importedCount === 0) {
                    alert('هیچ شماره حسابی در فایل اکسل شناسایی نشد. لطفاً مطمئن شوید فایل دارای ستون شماره حساب یا شبا است.');
                    return;
                }

                updateSavedPersons(newSaved, true);
                setActiveTab('manage');
                alert(`✅ با موفقیت ${importedCount} شماره حساب پرسنل (با تشخیص خودکار نام و نام خانوادگی) در حافظه دائمی سرور و سیستم ذخیره شد.`);
            } catch (err: any) {
                alert('خطا در خواندن فایل اکسل شماره حساب‌ها: ' + (err.message || 'نامشخص'));
            } finally {
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    const handleExportAccountsExcel = () => {
        const entries = Object.entries(savedPersons);
        if (entries.length === 0) {
            alert('حافظه پرسنل خالی است.');
            return;
        }

        const exportData = entries.map(([id, data], idx) => ({
            'ردیف': idx + 1,
            'کد پرسنلی / شناسه': id,
            'نام و نام خانوادگی': data.name || '-',
            'شماره حساب / شبا': data.account || '-'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "حافظه پرسنل");
        XLSX.writeFile(wb, `ccti_personnel_accounts_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleClearSavedPersons = () => {
        if (window.confirm('آیا از پاکسازی کامل حافظه شماره حساب‌های پرسنل مطمئن هستید؟')) {
            updateSavedPersons({}, false);
            alert('حافظه پرسنل پاکسازی شد.');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;
        setFile(uploadedFile);
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
            
            if (data.length > 0) {
                // Smart header detection: find row with expected keywords
                let headerRowIndex = 0;
                for (let i = 0; i < Math.min(data.length, 20); i++) {
                    const rowParams = (data[i] as any[]) || [];
                    const rowStr = rowParams.join(' ').replace(/\s+/g, ' ');
                    if (rowStr.includes('مبلغ') || rowStr.includes('نام') || rowStr.includes('حساب') || rowStr.includes('شبا') || rowStr.includes('خالص') || rowStr.includes('کد پرسنلی') || rowStr.includes('کد ملی')) {
                        headerRowIndex = i;
                        break;
                    }
                }

                const rawHeaders = (data[headerRowIndex] as unknown[] || []);
                const expectedLength = Math.max(...data.slice(headerRowIndex).map((r: any) => r.length));
                // Fill undefined headers
                const headers = Array.from({ length: expectedLength }).map((_, idx) => {
                    const col = rawHeaders[idx];
                    return col ? String(col).trim() : `ستون_${idx + 1}`;
                });

                // Auto-detect Persian month from file name, sheet name, or top header rows
                const topText = `${uploadedFile.name} ${wsname} ${data.slice(0, Math.max(headerRowIndex, 5)).map((r: any) => (r || []).join(' ')).join(' ')}`;
                const detectedMonthIdx = PERSIAN_MONTHS.findIndex(pm => topText.includes(pm));
                if (detectedMonthIdx !== -1) {
                    const mName = PERSIAN_MONTHS[detectedMonthIdx];
                    const yMatch = topText.replace(/[۰-۹]/g, (d: any) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString()).match(/14\d{2}/);
                    const yVal = yMatch ? Number(yMatch[0]) : Number(financialYear || 1404);
                    const days = getPersianMonthDays(detectedMonthIdx + 1, yVal);
                    setArchiveMonthName(`حقوق ${mName} ${yVal} (${days} روزه)`);
                }

                // Filter out empty rows and summary/total rows ("جمع کل", "مجموع") so employee count is exact
                const rawRowData = data.slice(headerRowIndex + 1).filter((r: unknown) => {
                    if (!Array.isArray(r) || r.length === 0) return false;
                    const nonEmptyCells = r.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
                    if (nonEmptyCells.length === 0) return false;
                    const joined = nonEmptyCells.map(c => String(c).trim()).join(' ');
                    if (joined.includes('جمع کل') || joined.includes('مجموع کل') || /^جمع(\s|$)/.test(joined)) return false;
                    return true;
                });
                
                // Smart First Name + Last Name Column Auto-Combination
                const firstNameCol = headers.find(h => h && (h === 'نام' || h.includes('نام کوچک') || (h.includes('نام') && !h.includes('خانوادگی') && !h.includes('فامیل') && !h.includes('پدر') && !h.includes('پرسنل') && !h.includes('بانک')) || h.toLowerCase() === 'first name'));
                const lastNameCol = headers.find(h => h && (h.includes('خانوادگی') || h.includes('فامیل') || h.includes('شهرت') || h.toLowerCase().includes('last name') || h.toLowerCase().includes('family')));

                let combinedColName = '';
                if (firstNameCol && lastNameCol && firstNameCol !== lastNameCol) {
                    combinedColName = 'نام و نام خانوادگی (ترکیبی)';
                    if (!headers.includes(combinedColName)) {
                        headers.push(combinedColName);
                    }
                }

                setColumns(headers);

                const formattedData = rawRowData.map((row: any) => {
                    const obj: any = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index];
                    });
                    if (combinedColName && firstNameCol && lastNameCol) {
                        const fn = String(obj[firstNameCol] || '').trim();
                        const ln = String(obj[lastNameCol] || '').trim();
                        obj[combinedColName] = `${fn} ${ln}`.replace(/\s+/g, ' ').trim();
                    }
                    return obj;
                }).filter((obj: any) => {
                    if (combinedColName && !obj[combinedColName]) return false;
                    return true;
                });
                
                setExcelData(formattedData);
                
                const accountMatch = headers.find(h => h && (h.includes('حساب') || h.includes('شبا') || h.toUpperCase().includes('IBAN')));
                const amountMatch = headers.find(h => h && (h.includes('خالص پرداختی') || h.includes('مبلغ پرداختی') || h.includes('خالص') || h.includes('مبلغ') || h.includes('پرداخت')));
                const nameMatch = combinedColName || headers.find(h => h && (h.includes('نام و نام خانوادگی') || h.includes('نام و فامیل') || h.includes('نام')));
                const codeMatch = headers.find(h => h && (h.includes('کد پرسنلی') || h.includes('شماره پرسنلی') || h.includes('شناسه') || (h.includes('کد') && !h.includes('ردیف') && !h.includes('شعبه'))));
                
                if (accountMatch) setAccountCol(accountMatch);
                if (amountMatch) setAmountCol(amountMatch);
                if (codeMatch) {
                    setIdCol(codeMatch);
                    if (nameMatch) setNameCol(nameMatch);
                } else if (nameMatch) {
                    setIdCol(nameMatch);
                    setNameCol(nameMatch);
                }
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    const handleGenerate = () => {
        if (excelData.length > 0 && (!amountCol || !idCol)) {
            alert('انتخاب ستون‌های شناسه (کد/نام) و مبلغ الزامی است.');
            return;
        }

        let missingCount = 0;
        let generatedCount = 0;
        let totalAmount = 0;
        const detailsArchive: CctiArchiveDetail[] = [];
        
        const newSaved = { ...savedPersons };
        const xmlTxLines: string[] = [];

        // Helper for XML Date
        let shamsiDateStr = '1403-01-01';
        let shamsiDateTimeStr = '1403-01-01T12:00:00';
        try {
            const options: Intl.DateTimeFormatOptions = { calendar: 'persian', year: 'numeric', month: '2-digit', day: '2-digit' };
            const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', options).formatToParts(new Date());
            const y = parts.find(p => p.type === 'year')?.value || '1403';
            const m = parts.find(p => p.type === 'month')?.value || '01';
            const d = parts.find(p => p.type === 'day')?.value || '01';
            const h = new Date().getHours().toString().padStart(2, '0');
            const min = new Date().getMinutes().toString().padStart(2, '0');
            const sec = new Date().getSeconds().toString().padStart(2, '0');
            shamsiDateStr = `${y}-${m}-${d}`;
            shamsiDateTimeStr = `${y}-${m}-${d}T${h}:${min}:${sec}`;
        } catch(e) {}

        const normalizeStr = (str: string) => {
            if (!str) return '';
            return String(str)
                .replace(/[۰-۹]/g, (d: any) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                .replace(/[٠-٩]/g, (d: any) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                .replace(/ي/g, 'ی')
                .replace(/ك/g, 'ک')
                .replace(/\s+/g, ' ')
                .trim();
        };

        const processRow = (id: string, amount: string, accountOrig: string, nameOrig: string) => {
            if (!id && !nameOrig) return;
            const normId = normalizeStr(id);
            const normName = normalizeStr(nameOrig);
            if (normId.includes('جمع') || normName.includes('جمع') || normId === 'مجموع' || normName === 'مجموع') return;

            const nAmount = Math.round(Number(amount)) || 0;
            if (nAmount <= 0) return;

            let account = normalizeStr(accountOrig).replace(/[\s-]/g, '');
            let name = nameOrig || id;

            if (account) {
                const saveKey = normId || normName;
                if (saveKey) {
                    newSaved[saveKey] = { account, name: name || newSaved[saveKey]?.name || saveKey };
                }
            } else {
                let foundPerson = newSaved[id] || newSaved[normId] || (normName ? newSaved[normName] : undefined);
                
                if (!foundPerson) {
                    const allSaved = Object.entries(newSaved);
                    for (const [savedId, savedData] of allSaved) {
                        const normSavedId = normalizeStr(savedId);
                        const normSavedName = normalizeStr(savedData.name);
                        if ((normId && (normSavedId === normId || normSavedName === normId)) || (normName && (normSavedName === normName || normSavedId === normName))) {
                            foundPerson = savedData;
                            break;
                        }
                    }
                }

                if (foundPerson) {
                    account = foundPerson.account || '';
                    name = nameOrig || foundPerson.name || id;
                } else {
                    name = nameOrig || id;
                }
            }

            if (!account) {
                missingCount++;
                account = 'EMPTY';
            }

            let iban = account.toUpperCase();
            if (iban !== 'EMPTY' && !iban.startsWith('IR')) {
                iban = 'IR' + account;
            }

            generatedCount++;
            totalAmount += nAmount;
            detailsArchive.push({ id: id || name, name, account, amount: nAmount });

            xmlTxLines.push(`      <CdtTrfTxInf>
        <PmtId>
          <InstrId>EMPTY</InstrId>
          <EndToEndId>EMPTY</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="IRR">${nAmount}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${name}</Nm>
          <Id>
            <PrvtId>
              <Othr>
                <Id>EMPTY</Id>
              </Othr>
            </PrvtId>
          </Id>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${iban}</IBAN>
          </Id>
        </CdtrAcct>
      </CdtTrfTxInf>`);
        };

        excelData.forEach(row => {
            const id = row[idCol] ? String(row[idCol]).trim() : '';
            let amount = row[amountCol] || '';
            if (typeof amount === 'string') {
                amount = amount
                    .replace(/[۰-۹]/g, (d: any) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                    .replace(/[٠-٩]/g, (d: any) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                    .replace(/,/g, '');
            }
            let account = accountCol ? String(row[accountCol] || '').trim() : '';
            let name = nameCol ? String(row[nameCol] || '').trim() : '';
            processRow(id, amount, account, name);
        });
        
        manualRows.forEach(row => {
            const id = row.id.trim();
            let amount = String(row.amount).replace(/,/g, '');
            let account = row.account.trim();
            let name = row.name.trim();
            processRow(id, amount, account, name);
        });

        updateSavedPersons(newSaved);

        if (generatedCount === 0) {
            alert('هیچ ردیف معتبری برای تولید فایل پیدا نشد. لطفاً از صحت ستون‌ها مطمئن شوید.');
            return;
        }

        if (expectedTotalAmount && Number(expectedTotalAmount.replace(/,/g, '')) !== totalAmount) {
            const expectedNum = Number(expectedTotalAmount.replace(/,/g, ''));
            alert(`جمع مبالغ وارد شده (${expectedNum.toLocaleString()} ریال) با جمع کل ردیف‌ها (${totalAmount.toLocaleString()} ریال) مغایرت دارد.\n\nاختلاف: ${Math.abs(expectedNum - totalAmount).toLocaleString()} ریال`);
            return;
        }

        if (missingCount > 0) {
            const proceed = window.confirm(`${missingCount} ردیف مجاز به دلیل نداشتن شماره شبا به صورت EMPTY ایجاد شدند.\nآیا مایل به دریافت فایل هستید؟`);
            if (!proceed) return;
        }

        localStorage.setItem('ccti_source_iban', sourceIban);

        let safeSourceIban = sourceIban.toUpperCase();
        if (!safeSourceIban.startsWith('IR') && safeSourceIban.length > 0) {
            safeSourceIban = 'IR' + safeSourceIban;
        }
        
        const msgId = `${safeSourceIban}${Date.now().toString().slice(-9)}`;
        const groupIban = safeSourceIban; 
        const companyName = 'شرکت تولیدی لپان بافت';

        const xmlContent = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${shamsiDateTimeStr}</CreDtTm>
      <NbOfTxs>${generatedCount}</NbOfTxs>
      <CtrlSum>${totalAmount}</CtrlSum>
      <InitgPty>
        <Nm>${companyName}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>1</PmtInfId>
      <PmtMtd Ccy="IRR">TRF</PmtMtd>
      <NbOfTxs>${generatedCount}</NbOfTxs>
      <CtrlSum>${totalAmount}</CtrlSum>
      <ReqdExctnDt>${shamsiDateStr}</ReqdExctnDt>
      <Dbtr>
        <Nm>${companyName}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${groupIban}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>BMJIIRTHXXX</BIC>
        </FinInstnId>
      </DbtrAgt>
${xmlTxLines.join('\\n')}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

        const fileName = `${safeSourceIban || `salary_${archiveMonthName || new Date().getTime()}`}.ccti`;

        // Save archive
        const newArchive: CctiArchive = {
            id: String(new Date().getTime()),
            date: new Date().getTime(),
            monthName: archiveMonthName || 'بدون نام مستعار',
            totalAmount,
            personCount: generatedCount,
            fileContent: xmlContent,
            details: detailsArchive
        };
        const newArchivesList = [newArchive, ...archives];
        setArchives(newArchivesList);
        localStorage.setItem('ccti_archives', JSON.stringify(newArchivesList));
        fetch('/api/ccti/archives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archives: newArchivesList, sourceIban })
        }).catch(() => {});
        setArchiveMonthName('');

        const blob = new Blob([xmlContent], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDeletePerson = (id: string) => {
        if(window.confirm('آیا از حذف این شخص مطمئن هستید؟')) {
            const newData = {...savedPersons};
            delete newData[id];
            updateSavedPersons(newData, false);
        }
    };
    
    const handleStartEdit = (id: string) => {
        setEditingId(id);
        setEditAccount(savedPersons[id].account);
        setEditName(savedPersons[id].name);
    }
    
    const handleSaveEdit = () => {
        if (editingId) {
            const newData = {...savedPersons};
            newData[editingId] = { account: editAccount, name: editName };
            updateSavedPersons(newData, true);
            setEditingId(null);
        }
    }
    
    const handleAddPerson = () => {
        if (!newPersonId || !newPersonAccount) return alert('شناسه و شماره حساب الزامی است');
        const newData = {...savedPersons};
        newData[newPersonId] = { account: newPersonAccount, name: newPersonName };
        updateSavedPersons(newData, true);
        setNewPersonId(''); setNewPersonName(''); setNewPersonAccount('');
    }

    const savedPersonsCount = Object.keys(savedPersons).length;

    return (
        <div className="p-3 sm:p-5 md:p-6 max-w-6xl mx-auto w-full space-y-5 pt-20 md:pt-6 animate-fade-in pb-32 h-full flex flex-col">
            <input 
                type="file" 
                ref={accountsFileInputRef} 
                className="hidden" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleImportAccountsExcel} 
            />
            {/* Unified Executive Hero Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-5 sm:p-6 shadow-xl border border-white/10 shrink-0">
                <div className="absolute -top-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0 border border-white/20">
                            <FileText className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[10px] font-black">
                                    ابزارهای مالی و اسنادی
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-slate-300 text-[10px] font-bold">
                                    استاندارد بانکی پایا / ساتنا (CCTI)
                                </span>
                            </div>
                            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight mt-1">
                                مبدل فایل حقوق (CCTI) و ادغام اسناد PDF
                            </h2>
                            <p className="text-xs text-slate-300/90 mt-0.5 font-medium">
                                تبدیل هوشمند اکسل حقوق به فرمت XML بانک مرکزی، مدیریت شبا پرسنل و یکپارچه‌سازی اسناد PDF
                            </p>
                        </div>
                    </div>

                    {/* Sub-Tabs Switcher + Always-Visible Excel Accounts Import Button */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/15 w-full lg:w-auto">
                        <button
                            type="button"
                            onClick={() => accountsFileInputRef.current?.click()}
                            className="flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
                            title="آپلود فایل اکسل حاوی نام و شماره حساب/شبا پرسنل"
                        >
                            <Upload size={15} />
                            <span>📥 ورود اکسل شماره حساب‌ها</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('pdf-merge')}
                            className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'pdf-merge' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}
                        >
                            <ArrowLeftRight size={15} className={activeTab === 'pdf-merge' ? 'text-blue-600' : ''}/>
                            <span>تبدیل عکس و ادغام PDF</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('convert')}
                            className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'convert' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}
                        >
                            <Upload size={15} className={activeTab === 'convert' ? 'text-indigo-600' : ''}/>
                            <span>صدور فایل CCTI</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('manage')}
                            className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'manage' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}
                        >
                            <Users size={15} className={activeTab === 'manage' ? 'text-emerald-600' : ''}/>
                            <span>حافظه پرسنل ({savedPersonsCount})</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('archive')}
                            className={`flex-1 lg:flex-none px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'archive' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-200 hover:bg-white/10 hover:text-white'}`}
                        >
                            <Archive size={15} className={activeTab === 'archive' ? 'text-amber-600' : ''}/>
                            <span>بایگانی ماه‌ها ({archives.length})</span>
                        </button>
                    </div>
                </div>

                {/* 4-Column KPI Strip */}
                <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-4 pt-4 border-t border-white/10">
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] text-slate-300 font-bold">پرسنل ثبت‌شده در حافظه</p>
                            <p className="text-lg font-black text-white font-mono mt-0.5">{savedPersonsCount} نفر</p>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                            <Users size={18} />
                        </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] text-indigo-200 font-bold">دوره‌های حقوق بایگانی</p>
                            <p className="text-lg font-black text-indigo-300 font-mono mt-0.5">{archives.length} دوره</p>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                            <Archive size={18} />
                        </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] text-emerald-200 font-bold">فایل‌های آماده ادغام PDF</p>
                            <p className="text-lg font-black text-emerald-300 font-mono mt-0.5">{pdfMergeFiles.length} فایل</p>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                            <Layers size={18} />
                        </div>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] text-amber-200 font-bold">سال مالی فعال</p>
                            <p className="text-lg font-black text-amber-300 font-mono mt-0.5">{financialYear || '۱۴۰۴'}</p>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                            <FileText size={18} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 bg-white/80 dark:bg-gray-900/60 p-6 rounded-3xl border border-white/50 shadow-xl custom-scrollbar">
                {activeTab === 'pdf-merge' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200/60 dark:border-blue-800/40">
                            <h3 className="text-base font-black text-blue-900 dark:text-blue-200 flex items-center gap-2">
                                <FileType size={20} className="text-blue-600 dark:text-blue-400" />
                                ابزار عمومی تبدیل عکس‌ها به PDF و ادغام اسناد
                            </h3>
                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
                                تمام کاربران می‌توانند فایل‌های تصویری (JPG, PNG, WEBP) و اسناد PDF را در این بخش آپلود، مرتب‌سازی و در قالب یک فایل استاندارد PDF یکپارچه دریافت کنند.
                            </p>
                        </div>

                        {/* File Uploader Dropzone */}
                        <div 
                            onClick={() => pdfInputRef.current?.click()}
                            className="border-2 border-dashed border-blue-300 dark:border-blue-800 hover:border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center group"
                        >
                            <input 
                                type="file" 
                                ref={pdfInputRef} 
                                multiple 
                                accept="image/*, application/pdf" 
                                onChange={handlePdfFileSelect} 
                                className="hidden" 
                            />
                            <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <Plus size={28} />
                            </div>
                            <span className="font-black text-sm text-gray-800 dark:text-gray-100">
                                جهت افزودن عکس‌ها یا فایل‌های PDF کلیک کنید
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                انتخاب همزمان چند فایل تصویری و PDF پشتیبانی می‌شود
                            </span>
                        </div>

                        {/* File list preview */}
                        {pdfMergeFiles.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <Layers size={16} />
                                        لیست فایل‌های انتخاب‌شده ({pdfMergeFiles.length} فایل):
                                    </span>
                                    <button 
                                        onClick={() => { setPdfMergeFiles([]); setMergedPdfResult(null); }}
                                        className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1"
                                    >
                                        <Trash2 size={14} /> پاکسازی لیست
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {pdfMergeFiles.map((file, idx) => (
                                        <div 
                                            key={file.id} 
                                            className="flex items-center justify-between p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 text-xs"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <span className="w-6 h-6 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center font-bold text-[10px] shrink-0">
                                                    {idx + 1}
                                                </span>
                                                {file.type.includes('image') ? (
                                                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 shrink-0 bg-gray-100">
                                                        <img src={file.previewUrl} alt={file.name} className="w-full h-full object-cover" />
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center font-black shrink-0">
                                                        PDF
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-800 dark:text-gray-200 truncate">{file.name}</p>
                                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                                        {(file.size / 1024).toFixed(1)} KB • {file.type.includes('pdf') ? 'سند PDF' : 'تصویر'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <button 
                                                    onClick={() => handleMovePdfFile(idx, 'up')}
                                                    disabled={idx === 0}
                                                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30"
                                                    title="انتقال به بالا"
                                                >
                                                    <ArrowUp size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleMovePdfFile(idx, 'down')}
                                                    disabled={idx === pdfMergeFiles.length - 1}
                                                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30"
                                                    title="انتقال به پایین"
                                                >
                                                    <ArrowDown size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleRemovePdfFile(file.id)}
                                                    className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-500"
                                                    title="حذف"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* CamScanner Effect / Quality Selector */}
                                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-blue-500/10 border border-amber-500/20 dark:border-amber-400/20 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <Sparkles size={16} className="text-amber-500 animate-pulse" />
                                            افکت هوشمند اسکنر (مشابه CamScanner):
                                        </label>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                            کیفیت و رنگ خودکار
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-600 dark:text-gray-400">
                                        حذف سایه‌های تاریک عکس گوشی، سفید کردن پس‌زمینه کاغذ، تقویت شفافیت نوشته‌ها و حفظ رنگ مهرهای رسمی
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setScannerFilter('magic_color')}
                                            className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 ${
                                                scannerFilter === 'magic_color'
                                                    ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-102'
                                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-amber-400'
                                            }`}
                                        >
                                            <span>✨ جادویی (Magic Color)</span>
                                            <span className="text-[9px] opacity-85 font-normal">رنگ و کنتراست شفاف (پیشنهادی)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setScannerFilter('crisp_bw')}
                                            className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 ${
                                                scannerFilter === 'crisp_bw'
                                                    ? 'bg-slate-800 text-white border-slate-900 shadow-md scale-102'
                                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-slate-400'
                                            }`}
                                        >
                                            <span>📄 سیاه‌سفید اسکنر</span>
                                            <span className="text-[9px] opacity-85 font-normal">کنتراست بالا و تفکیک متن</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setScannerFilter('enhance')}
                                            className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 ${
                                                scannerFilter === 'enhance'
                                                    ? 'bg-blue-600 text-white border-blue-700 shadow-md scale-102'
                                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                                            }`}
                                        >
                                            <span>⚡ تعادل خودکار</span>
                                            <span className="text-[9px] opacity-85 font-normal">تنظیم هوشمند نور و وضوح</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setScannerFilter('original')}
                                            className={`p-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 ${
                                                scannerFilter === 'original'
                                                    ? 'bg-gray-600 text-white border-gray-700 shadow-md scale-102'
                                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                                            }`}
                                        >
                                            <span>🖼️ حالت اصلی</span>
                                            <span className="text-[9px] opacity-85 font-normal">بدون اعمال فیلتر</span>
                                        </button>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleRunMergeToPdf}
                                    disabled={isMerging || pdfMergeFiles.length === 0}
                                    className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-black text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isMerging ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            در حال تبدیل و ادغام فایل‌ها...
                                        </>
                                    ) : (
                                        <>
                                            <FileCheck size={18} />
                                            ادغام و خروجی یکپارچه فایل PDF
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Merged Result Section */}
                        {mergedPdfResult && (
                            <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 space-y-4 animate-fade-in">
                                <div className="flex items-center gap-3 text-emerald-800 dark:text-emerald-200">
                                    <CheckCircle size={24} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <div>
                                        <p className="font-black text-sm">فایل PDF یکپارچه با موفقیت ساخته شد!</p>
                                        <p className="text-xs opacity-80">{mergedPdfResult.fileName}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 pt-2">
                                    <a 
                                        href={mergedPdfResult.url} 
                                        download={mergedPdfResult.fileName}
                                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm"
                                    >
                                        <Download size={16} /> دانلود فایل PDF
                                    </a>
                                    <button 
                                        onClick={() => openSendToChat({
                                            attachment: { fileName: mergedPdfResult.fileName, url: mergedPdfResult.url },
                                            defaultMessage: `📄 فایل PDF یکپارچه جدید: ${mergedPdfResult.fileName}`
                                        })}
                                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm"
                                    >
                                        <Share2 size={16} /> ارسال به گفتگوی سازمانی
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'convert' && (
                    <div className="space-y-8 animate-fade-in">
                        {/* Quick Accounts Excel Import Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-blue-500/10 border border-emerald-500/30 rounded-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black text-sm text-gray-800 dark:text-gray-100">حافظه دائمی شماره حساب‌های پرسنل ({savedPersonsCount} نفر ثبت شده)</h4>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">با یک‌بار آپلود اکسل شماره حساب‌ها (حتی با دو ستون مجزای نام و نام خانوادگی)، اطلاعات روی سرور ذخیره شده و هرگز نمی‌پرد.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => accountsFileInputRef.current?.click()}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
                                >
                                    <Upload size={16} />
                                    <span>📥 آپلود اکسل شماره حساب‌ها</span>
                                </button>
                                {savedPersonsCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleExportAccountsExcel}
                                        className="px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                                    >
                                        <Download size={15} />
                                        <span>خروجی اکسل</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Step 1: Upload */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center font-black">۱</div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">آپلود فایل اکسل این ماه</h3>
                            </div>
                            
                            <div 
                                className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${file ? 'border-green-400 bg-green-50/50 dark:bg-green-900/10' : 'border-blue-200 bg-blue-50 dark:border-blue-900/30 dark:bg-gray-800/50 hover:border-blue-400 hover:bg-blue-100/50 dark:hover:bg-gray-800/80'}`}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
                                {file ? (
                                    <div className="flex flex-col items-center text-green-600 dark:text-green-400">
                                        <CheckCircle size={48} className="mb-2" />
                                        <span className="font-bold">{file.name}</span>
                                        <span className="text-xs mt-2 opacity-80">{excelData.length} ردیف یافت شد</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-blue-500 dark:text-blue-400 text-center">
                                        <Upload size={48} className="mb-2 opacity-80" />
                                        <span className="font-bold">برای انتخاب فایل اکسل کلیک کنید</span>
                                        <span className="text-xs mt-2 opacity-70">همان فایل حقوق که در آن ستون مبلغ وجود دارد (<span dir="ltr">.xlsx, .xls</span>)</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Step 2: Mapping */}
                        {file && columns.length > 0 && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center font-black">۲</div>
                                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">تبدیل هوشمند</h3>
                                    </div>
                                </div>
                                
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-2xl p-4 text-sm text-yellow-800 dark:text-yellow-300 mb-4 font-bold leading-relaxed">
                                    سیستم به طور خودکار بر اساس <span className="text-yellow-900 dark:text-yellow-100 bg-yellow-200 dark:bg-yellow-700/50 px-1 rounded mx-1">کد/نام</span> شماره شبای پرسنل را از پایگاه داده می‌خواند. فقط کافیست ستون مبلغ این ماه را تنظیم کنید.
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">ستون شناسه (کد پرسنلی یا نام) <span className="text-red-500">*</span></label>
                                        <select 
                                            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={idCol}
                                            onChange={(e) => setIdCol(e.target.value)}
                                        >
                                            <option value="">-- انتخاب کنید --</option>
                                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">ستون مبلغ حقوق این ماه <span className="text-red-500">*</span></label>
                                        <select 
                                            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={amountCol}
                                            onChange={(e) => setAmountCol(e.target.value)}
                                        >
                                            <option value="">-- انتخاب کنید --</option>
                                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 text-blue-600 dark:text-blue-400">ستون شماره حساب / شبا (اختیاری)</label>
                                        <select 
                                            className="w-full bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded-xl p-3 text-sm outline-none"
                                            value={accountCol}
                                            onChange={(e) => setAccountCol(e.target.value)}
                                        >
                                            <option value="">ندارد (خواندن از حافظه سیستم)</option>
                                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <p className="text-[10px] text-gray-500 font-bold pr-1">اگر انتخاب شود، حافظه سیستم بروزرسانی می‌شود.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 text-blue-600 dark:text-blue-400">ستون نام (برای خروجی بهتر)</label>
                                        <select 
                                            className="w-full bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded-xl p-3 text-sm outline-none"
                                            value={nameCol}
                                            onChange={(e) => setNameCol(e.target.value)}
                                        >
                                            <option value="">ندارد</option>
                                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1"><Settings2 size={16}/> جداکننده (Delimiter)</label>
                                        <select 
                                            className="w-full md:w-1/2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={delimiter}
                                            onChange={(e) => setDelimiter(e.target.value)}
                                        >
                                            <option value=",">کاما ( , ) - رایج‌ترین</option>
                                            <option value=";">نقطه ویرگول ( ; )</option>
                                            <option value="\t">تب ( Tab )</option>
                                            <option value="|">خط عمودی ( | )</option>
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-4 md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-6 mt-2">
                                        <h4 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Settings2 size={18}/> تنظیمات فایل خروجی</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">شماره شبا حساب مبدا (برداشت) <span className="text-red-500">*</span></label>
                                                <input 
                                                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr text-left font-mono"
                                                    value={sourceIban}
                                                    placeholder="IR..."
                                                    onChange={(e) => setSourceIban(e.target.value)}
                                                />
                                                <p className="text-[10px] text-gray-500 font-bold pr-1">این شماره دقیقاً نام فایل خروجی شما خواهد بود.</p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300">جمع کل مبلغ حقوق‌ها (برای بررسی صحت کسر) <span className="text-red-500">*</span></label>
                                                <input 
                                                    className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr text-left font-mono"
                                                    value={expectedTotalAmount}
                                                    placeholder="ریال"
                                                    onChange={(e) => {
                                                        const raw = e.target.value;
                                                        const norm = raw
                                                            .replace(/[۰-۹]/g, (d: any) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
                                                            .replace(/[٠-٩]/g, (d: any) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                                                        const val = norm.replace(/[^0-9]/g, '');
                                                        setExpectedTotalAmount(val ? Number(val).toLocaleString() : '');
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {(idCol && amountCol) || excelData.length === 0 ? (
                                    <div className="pt-6 space-y-6">
                                        <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
                                            <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2"><Settings2 size={18}/> افزودن دستی پرداخت (اختیاری)</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                                                <input placeholder="شناسه/کد پرسنلی" className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={newPersonId} onChange={e => setNewPersonId(e.target.value)} />
                                                <input placeholder="نام (اختیاری)" className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={newPersonName} onChange={e => setNewPersonName(e.target.value)} />
                                                <input placeholder="شماره حساب/شبا (اختیاری)" className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={newPersonAccount} onChange={e => setNewPersonAccount(e.target.value)} />
                                                <input placeholder="مبلغ حقوق" className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={manualAmount} onChange={e => setManualAmount(e.target.value)} />
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    if(!newPersonId || !manualAmount) return alert('شناسه و مبلغ الزامی است');
                                                    setManualRows([...manualRows, {id: newPersonId, name: newPersonName, account: newPersonAccount, amount: manualAmount}]);
                                                    setNewPersonId(''); setNewPersonName(''); setNewPersonAccount(''); setManualAmount('');
                                                }}
                                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                                            >
                                                افزودن به لیست خروجی
                                            </button>
                                            
                                            {manualRows.length > 0 && (
                                                <div className="mt-4 space-y-2">
                                                    {manualRows.map((r, i) => (
                                                        <div key={i} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded-lg text-sm border border-gray-100 dark:border-gray-700">
                                                            <div>
                                                                <span className="font-bold">{r.id}</span> - {r.name || 'بدون نام'} | {r.amount}
                                                            </div>
                                                            <button onClick={() => setManualRows(manualRows.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 p-1">
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
                                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-2">نام این ماه جهت ذخیره در بایگانی (مثلا حقوق مهر 1403) <span className="text-red-500">*</span></label>
                                            <input 
                                                placeholder="مثال: حقوق اردیبهشت 1403" 
                                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                                value={archiveMonthName} 
                                                onChange={e => setArchiveMonthName(e.target.value)} 
                                            />
                                        </div>

                                        <button 
                                            onClick={() => {
                                                if(!archiveMonthName) return alert('لطفا نام/بازه زمانی فایل را جهت بایگانی مشخص کنید');
                                                handleGenerate();
                                            }}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-5 rounded-2xl font-black text-lg hover:shadow-lg hover:shadow-green-500/30 transition-all active:scale-95"
                                        >
                                            <Download size={24} />
                                            <span>صدور فایل حقوق نهایی ({excelData.length + manualRows.length} ردیف بررسی خواهد شد)</span>
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'manage' && (
                    <div className="space-y-4 animate-fade-in h-full flex flex-col">
                        {/* High-Visibility Excel Import & Backup Header Card */}
                        <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white shadow-lg border border-white/20">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
                                        <Upload size={24} className="text-white animate-bounce" />
                                    </div>
                                    <div>
                                        <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                                            ورود و آپلود سریع شماره حساب‌ها از اکسل
                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/30 border border-emerald-300/40 text-emerald-100 text-[10px] font-extrabold">
                                                {savedPersonsCount} نفر ذخیره در حافظه
                                            </span>
                                        </h3>
                                        <p className="text-xs text-white/90 mt-1 leading-relaxed">
                                            فایل اکسل خود (شامل نام، فامیلی و شماره حساب/شبا) را آپلود کنید تا بلافاصله در حافظه سیستم ثبت گردد و هرگز نپرد.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => accountsFileInputRef.current?.click()}
                                        className="px-5 py-3 rounded-2xl bg-white text-emerald-900 font-black text-xs hover:bg-emerald-50 active:scale-95 shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                                    >
                                        <Upload size={18} className="text-emerald-600" />
                                        <span>آپلود اکسل شماره حساب‌ها</span>
                                    </button>

                                    {savedPersonsCount > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleExportAccountsExcel}
                                                className="px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs backdrop-blur-md border border-white/20 shadow-md transition-all flex items-center gap-2 cursor-pointer"
                                            >
                                                <Download size={16} />
                                                <span>دانلود اکسل پشتیبان</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleClearSavedPersons}
                                                className="px-3 py-3 rounded-2xl bg-rose-500/30 hover:bg-rose-500/50 text-rose-100 font-bold text-xs backdrop-blur-md border border-rose-300/30 transition-all flex items-center gap-1.5 cursor-pointer"
                                                title="پاکسازی حافظه"
                                            >
                                                <Trash2 size={16} />
                                                <span>پاکسازی</span>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Manual Entry Fallback Box */}
                        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
                            <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-3 text-sm flex items-center gap-2">
                                <Plus size={16} className="text-blue-600" />
                                ثبت دستی تکی پرسنل در حافظه (اختیاری)
                            </h4>
                            <div className="flex flex-col md:flex-row gap-2">
                                <input placeholder="کد پرسنلی / شناسه" className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={newPersonId} onChange={e => setNewPersonId(e.target.value)} />
                                <input placeholder="نام و نام خانوادگی" className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={newPersonName} onChange={e => setNewPersonName(e.target.value)} />
                                <input placeholder="شماره حساب / شبا" className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm" value={newPersonAccount} onChange={e => setNewPersonAccount(e.target.value)} />
                                <button onClick={handleAddPerson} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-2.5 font-bold text-sm shrink-0 flex items-center justify-center gap-1">ثبت در حافظه</button>
                            </div>
                        </div>
                        
                        <div className="relative mb-2 mt-2">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="جستجو در مشخصات یا شماره حساب..."
                                className="w-full pl-4 pr-10 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-gray-100"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 min-h-[300px] border border-gray-100 dark:border-gray-800 rounded-2xl p-2 bg-gray-50/50 dark:bg-black/20 custom-scrollbar">
                            {Object.keys(savedPersons).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-gradient-to-b from-emerald-50/40 to-teal-50/20 dark:from-emerald-950/10 dark:to-transparent rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 my-2">
                                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 shadow-inner">
                                        <Upload size={32} />
                                    </div>
                                    <h4 className="font-black text-base text-gray-800 dark:text-gray-200 mb-1">
                                        هنوز هیچ شماره حسابی در حافظه ثبت نشده است
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md leading-relaxed mb-4">
                                        برای ذخیره‌سازی سریع شماره حساب تمام پرسنل کافیست فایل اکسل حاوی نام و شماره حساب را انتخاب و آپلود فرمایید.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => accountsFileInputRef.current?.click()}
                                        className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <Upload size={18} />
                                        <span>📥 آپلود اکسل شماره حساب‌ها</span>
                                    </button>
                                </div>
                            ) : (
                                Object.entries(savedPersons)
                                    .filter(([id, data]) => 
                                        String(id || '').includes(searchTerm) || 
                                        String(data?.name || '').includes(searchTerm) || 
                                        String(data?.account || '').includes(searchTerm)
                                    )
                                    .map(([id, data]) => (
                                    <div key={id} className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm hover:shadow transition-all group">
                                        {editingId === id ? (
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <input 
                                                    value={editName} 
                                                    onChange={e => setEditName(e.target.value)} 
                                                    className="border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-gray-900 rounded-lg p-2 text-sm outline-none" 
                                                    placeholder="نام"
                                                />
                                                <input 
                                                    value={editAccount} 
                                                    onChange={e => setEditAccount(e.target.value)} 
                                                    className="border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-gray-900 rounded-lg p-2 text-sm outline-none" 
                                                    placeholder="شماره حساب/شبا"
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="font-bold text-gray-800 dark:text-gray-200">
                                                    {data.name || 'بدون نام'}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                                                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-[10px]">شناسه/کد: {id}</span>
                                                    <span dir="ltr" className="font-mono">{data.account}</span>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="flex items-center gap-1 self-end md:self-auto opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                            {editingId === id ? (
                                                <>
                                                    <button onClick={handleSaveEdit} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200">
                                                        <Check size={16} />
                                                    </button>
                                                    <button onClick={() => setEditingId(null)} className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                                                        <X size={16} />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleStartEdit(id)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeletePerson(id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
                
                {activeTab === 'archive' && (
                    <div className="space-y-4 animate-fade-in h-full flex flex-col">
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                            <button 
                                onClick={() => { setArchiveTab('list'); setSelectedArchiveView(null); }}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${archiveTab === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}`}
                            >
                                لیست فایل‌ها
                            </button>
                            <button 
                                onClick={() => { setArchiveTab('kardex'); setSelectedArchiveView(null); }}
                                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${archiveTab === 'kardex' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500'}`}
                            >
                                کاردکس اشخاص
                            </button>
                        </div>

                        {archiveTab === 'list' && (
                            <>
                                {!selectedArchiveView ? (
                                    <>
                                        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm mb-4 bg-gradient-to-l from-transparent to-blue-50 dark:to-blue-900/20">
                                            <h3 className="font-black text-gray-800 dark:text-gray-200 text-lg flex items-center gap-2"><Archive className="text-blue-500" /> بایگانی پرداخت‌های حقوق</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">لیست فایل‌های صادر شده قبلی در اینجا قابل مشاهده و بازبینی هستند.</p>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 bg-gray-50/50 dark:bg-black/20 custom-scrollbar">
                                            {archives.length === 0 ? (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-400 font-bold py-12">
                                                    <Archive size={48} className="mb-4 opacity-50" />
                                                    بایگانی خالی است
                                                </div>
                                            ) : (
                                                archives.map(arch => (
                                                    <div key={arch.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-md">
                                                        <div>
                                                            <h4 className="font-bold text-gray-800 dark:text-gray-200 text-lg">{arch.monthName}</h4>
                                                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                                                <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(arch.date).toLocaleDateString('fa-IR')}</span>
                                                                <span className="flex items-center gap-1"><Users size={12}/> {arch.personCount} پرسنل</span>
                                                                <span className="font-bold text-gray-700 dark:text-gray-300">جمع کل: {arch.totalAmount.toLocaleString()} ریال</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {canManageArchive && (
                                                                <button 
                                                                    onClick={(e) => handleDeleteArchive(arch.id, e)}
                                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                                    title="حذف بایگانی"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => setSelectedArchiveView(arch)}
                                                                className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                                            >
                                                                <Eye size={16} /> نمایش جزئیات
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col h-full animate-fade-in relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-4 print:p-0 print:border-none print:shadow-none">
                                        <div className="flex items-start justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-4">
                                            <div>
                                                <h3 className="font-black text-gray-800 dark:text-gray-200 text-xl">{selectedArchiveView.monthName}</h3>
                                                <div className="flex gap-6 text-sm text-gray-500 mt-2">
                                                    <span>تعداد: <strong className="text-gray-800 dark:text-gray-200">{selectedArchiveView.personCount} نفر</strong></span>
                                                    <span>جمع پرداختی: <strong className="text-green-600 dark:text-green-400">{selectedArchiveView.totalAmount.toLocaleString()} ریال</strong></span>
                                                    <span>تاریخ صدور: <strong className="text-gray-800 dark:text-gray-200">{new Date(selectedArchiveView.date).toLocaleDateString('fa-IR')}</strong></span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 hidden-print">
                                                <button 
                                                    onClick={() => window.print()}
                                                    className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                                >
                                                    <Printer size={16} /> چاپ
                                                </button>
                                                <button 
                                                    onClick={() => setSelectedArchiveView(null)}
                                                    className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                                >
                                                    بازگشت
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar print:overflow-visible">
                                            <table className="w-full text-sm text-right border-collapse print:text-xs">
                                                <thead>
                                                    <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                        <th className="py-3 px-4 font-bold rounded-tr-lg">ردیف</th>
                                                        <th className="py-3 px-4 font-bold">نام و نام خانوادگی</th>
                                                        <th className="py-3 px-4 font-bold">شماره شبا (تخصیص یافته)</th>
                                                        <th className="py-3 px-4 font-bold text-left rounded-tl-lg">مبلغ پرداختی (ریال)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedArchiveView.details && selectedArchiveView.details.map((detail, idx) => (
                                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                                            <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                                                            <td className="py-3 px-4 font-bold text-gray-800 dark:text-gray-200">{detail.name || detail.id}</td>
                                                            <td className="py-3 px-4 text-gray-600 dark:text-gray-400 font-mono text-xs">{detail.account}</td>
                                                            <td className="py-3 px-4 font-bold text-green-600 dark:text-green-400 text-left dir-ltr">{detail.amount.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const blob = new Blob([selectedArchiveView.fileContent], { type: 'text/plain;charset=utf-8;' });
                                                const link = document.createElement("a");
                                                const url = URL.createObjectURL(blob);
                                                link.setAttribute("href", url);
                                                link.setAttribute("download", `salary_${selectedArchiveView.monthName}.ccti`);
                                                link.style.visibility = 'hidden';
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                            }}
                                            className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-4 rounded-xl font-bold hover:shadow-lg hover:shadow-blue-500/30 transition-all active:scale-95 hidden-print"
                                        >
                                            <Download size={20} />
                                            دانلود مجدد فایل CCTI صادر شده
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {archiveTab === 'kardex' && (
                            <div className="flex flex-col h-full animate-fade-in bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm p-4 print:p-0 print:border-none print:shadow-none">
                                <div className="flex items-center justify-between mb-4 border-b border-gray-100 dark:border-gray-700 pb-4 hidden-print">
                                    <h3 className="font-black text-gray-800 dark:text-gray-200 text-lg flex items-center gap-2"><FileText className="text-emerald-500" /> کاردکس پرداخت حقوق اشخاص</h3>
                                    {selectedKardexPerson && (
                                        <button 
                                            onClick={() => setSelectedKardexPerson(null)}
                                            className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                                        >
                                            بازگشت به لیست
                                        </button>
                                    )}
                                </div>

                                {!selectedKardexPerson ? (
                                    <div className="flex flex-col h-full space-y-4">
                                        <div className="relative hidden-print">
                                            <input 
                                                type="text" 
                                                placeholder="جستجوی شخص..." 
                                                value={kardexSearch}
                                                onChange={e => setKardexSearch(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                            />
                                            <Search className="absolute left-3 top-3.5 text-gray-400" size={18} />
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                                {filteredKardexPersons.length === 0 ? (
                                                    <div className="col-span-full py-10 text-center text-gray-400 font-bold">شخصی با این نام یافت نشد.</div>
                                                ) : (
                                                    filteredKardexPersons.map(person => {
                                                        const personHistory = archives.map(a => {
                                                            const detail = a.details.find(d => (d.name || d.id) === person);
                                                            return detail ? { monthTitle: a.monthName, amount: detail.amount, date: a.date } : null;
                                                        }).filter(Boolean);
                                                        const totalAmount = personHistory.reduce((sum, item) => sum + (item?.amount || 0), 0);

                                                        return (
                                                            <div 
                                                                key={person} 
                                                                onClick={() => setSelectedKardexPerson(person)}
                                                                className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all group"
                                                            >
                                                                <h4 className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-blue-600 transition-colors">{person}</h4>
                                                                <div className="flex justify-between items-end mt-3">
                                                                    <div className="text-xs text-gray-500">طی {personHistory.length} ماه صادر شده</div>
                                                                    <div className="text-sm font-bold text-green-600 dark:text-green-500">{totalAmount.toLocaleString()} ریال</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col h-full animate-fade-in relative">
                                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                                            <div>
                                                <h3 className="font-black text-gray-900 dark:text-white text-2xl mb-1">کاردکس پرداختی: {selectedKardexPerson}</h3>
                                                <p className="text-sm text-gray-500">تاریخ گزارش: {new Date().toLocaleDateString('fa-IR')} | سال مالی وابسته</p>
                                            </div>
                                            <button 
                                                onClick={() => window.print()}
                                                className="hidden-print flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-bold transition-all"
                                            >
                                                <Printer size={18} /> چاپ کاردکس
                                            </button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar print:overflow-visible">
                                            {(() => {
                                                const history = archives
                                                    .map(a => {
                                                        const detail = a.details.find(d => (d.name || d.id) === selectedKardexPerson);
                                                        return detail ? { monthTitle: a.monthName, amount: detail.amount, date: a.date, account: detail.account } : null;
                                                    })
                                                    .filter(Boolean)
                                                    .sort((a, b) => (a!.date - b!.date)); // Ascending
                                                
                                                const grandTotal = history.reduce((sum, item) => sum + item!.amount, 0);

                                                return (
                                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden print:border-none">
                                                        <table className="w-full text-sm text-right border-collapse">
                                                            <thead>
                                                                <tr className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300">
                                                                    <th className="py-3 px-4 font-bold border-b border-gray-200 dark:border-gray-700">ردیف</th>
                                                                    <th className="py-3 px-4 font-bold border-b border-gray-200 dark:border-gray-700">دوره حقوق (نام فایل)</th>
                                                                    <th className="py-3 px-4 font-bold border-b border-gray-200 dark:border-gray-700">شماره حساب (شبا) مقصد</th>
                                                                    <th className="py-3 px-4 font-bold border-b border-gray-200 dark:border-gray-700 text-left">مبلغ پرداختی (ریال)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {history.map((record, index) => (
                                                                    <tr key={index} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                                        <td className="py-3 px-4 text-gray-500">{index + 1}</td>
                                                                        <td className="py-3 px-4 font-bold text-gray-800 dark:text-gray-200">{record!.monthTitle}</td>
                                                                        <td className="py-3 px-4 text-gray-500 font-mono text-xs">{record!.account}</td>
                                                                        <td className="py-3 px-4 font-bold text-green-600 dark:text-green-400 text-left dir-ltr">{record!.amount.toLocaleString()}</td>
                                                                    </tr>
                                                                ))}
                                                                <tr className="bg-blue-50 dark:bg-blue-900/20 print:bg-gray-100">
                                                                    <td colSpan={3} className="py-4 px-4 font-black text-left text-gray-800 dark:text-gray-200">جمع کل پرداختی‌ها:</td>
                                                                    <td className="py-4 px-4 font-black text-left text-blue-700 dark:text-blue-400 text-lg dir-ltr">{grandTotal.toLocaleString()} ریال</td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CctiConverter;

