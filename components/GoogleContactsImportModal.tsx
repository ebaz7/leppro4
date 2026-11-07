import React, { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, FileText, Check, ArrowRight, ShieldCheck, Search, Users, Sparkles, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SalesContact } from '../types';

interface GoogleContactsImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    existingContacts: SalesContact[];
    onImportSuccess: (importedContacts: SalesContact[], mode: 'skip' | 'update' | 'all') => void;
}

export interface ParsedContactPreview {
    id: string;
    name: string;
    mobile: string;
    secondaryPhone?: string;
    email?: string;
    birthday?: string;
    company?: string;
    address?: string;
    notes?: string;
    isDuplicate: boolean;
    existingMatchName?: string;
    selected: boolean;
}

/**
 * Fixes Mojibake caused by UTF-8 bytes decoded as Windows-1252/ISO-8859-1
 */
export function fixMojibake(str: string): string {
    if (!str || typeof str !== 'string') return str || '';
    if (/[\u00C0-\u00FF]/.test(str)) {
        try {
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                bytes[i] = str.charCodeAt(i) & 0xFF;
            }
            const decoded = new TextDecoder('utf-8').decode(bytes);
            if (decoded && !decoded.includes('')) {
                return decoded;
            }
        } catch (e) {
            // fallback
        }
    }
    return str;
}

/**
 * Decodes vCard field values (handling QUOTED-PRINTABLE, CHARSET=UTF-8, etc.)
 */
function decodeVCardValue(val: string): string {
    if (!val) return '';
    let result = val.trim();
    if (result.includes('=')) {
        try {
            const clean = result.replace(/=\r?\n/g, '');
            const hexParts = clean.split('=').filter(Boolean);
            if (hexParts.length > 0 && /^[0-9A-Fa-f]{2}$/.test(hexParts[0])) {
                const bytes = new Uint8Array(hexParts.map(h => parseInt(h.substring(0, 2), 16)));
                result = new TextDecoder('utf-8').decode(bytes);
            }
        } catch (e) {
            // fallback
        }
    }
    return fixMojibake(result);
}

/**
 * Normalizes phone numbers (e.g. +98 912 548 0900 -> 09125480900)
 */
export function normalizePhoneNumber(raw: string): string {
    if (!raw) return '';
    // Google CSV sometimes delimits multiple values with ":::"
    const firstPart = raw.split(':::')[0] || raw;
    let cleaned = firstPart.trim().replace(/[\s\-\(\)\.]/g, '');
    
    // Convert Iranian prefixes
    if (cleaned.startsWith('+98')) {
        cleaned = '0' + cleaned.slice(3);
    } else if (cleaned.startsWith('0098')) {
        cleaned = '0' + cleaned.slice(4);
    } else if (cleaned.startsWith('98') && cleaned.length >= 11) {
        cleaned = '0' + cleaned.slice(2);
    }
    return cleaned;
}

/**
 * Parses vCard (.vcf) format (Google Contacts vCard export / Android / iOS)
 */
function parseVCardText(text: string): ParsedContactPreview[] {
    const contacts: ParsedContactPreview[] = [];
    const vcards = text.split(/BEGIN:VCARD/i).filter(v => v.trim().length > 0);

    for (const vcard of vcards) {
        let name = '';
        const phones: string[] = [];
        let email = '';
        let birthday = '';
        let company = '';
        let address = '';
        let notes = '';

        const lines = vcard.split(/\r?\n/);
        for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('FN:') || cleanLine.startsWith('FN;')) {
                const rawVal = cleanLine.substring(cleanLine.indexOf(':') + 1);
                name = decodeVCardValue(rawVal);
            } else if (!name && (cleanLine.startsWith('N:') || cleanLine.startsWith('N;'))) {
                const rawVal = cleanLine.substring(cleanLine.indexOf(':') + 1);
                const parts = rawVal.split(';');
                const lastName = decodeVCardValue(parts[0] || '');
                const firstName = decodeVCardValue(parts[1] || '');
                name = `${firstName} ${lastName}`.trim();
            } else if (cleanLine.toUpperCase().startsWith('TEL')) {
                const num = cleanLine.substring(cleanLine.indexOf(':') + 1).trim();
                if (num) phones.push(normalizePhoneNumber(num));
            } else if (cleanLine.toUpperCase().startsWith('EMAIL')) {
                email = cleanLine.substring(cleanLine.indexOf(':') + 1).trim();
            } else if (cleanLine.toUpperCase().startsWith('BDAY')) {
                birthday = cleanLine.substring(cleanLine.indexOf(':') + 1).trim();
            } else if (cleanLine.toUpperCase().startsWith('ORG')) {
                const rawVal = cleanLine.substring(cleanLine.indexOf(':') + 1).split(';')[0];
                company = decodeVCardValue(rawVal);
            } else if (cleanLine.toUpperCase().startsWith('ADR')) {
                const rawVal = cleanLine.substring(cleanLine.indexOf(':') + 1).replace(/;/g, ' ');
                address = decodeVCardValue(rawVal);
            } else if (cleanLine.toUpperCase().startsWith('NOTE')) {
                const rawVal = cleanLine.substring(cleanLine.indexOf(':') + 1);
                notes = decodeVCardValue(rawVal);
            }
        }

        const primaryPhone = phones[0] || '';
        if (name || primaryPhone) {
            contacts.push({
                id: Math.random().toString(36).substr(2, 9),
                name: fixMojibake(name || primaryPhone || 'مخاطب بدون نام'),
                mobile: primaryPhone,
                secondaryPhone: phones[1] || undefined,
                email,
                birthday,
                company: fixMojibake(company),
                address: fixMojibake(address),
                notes: fixMojibake(notes),
                isDuplicate: false,
                selected: true
            });
        }
    }
    return contacts;
}

/**
 * Parses Google CSV, Outlook CSV, and general Excel/CSV tabular formats
 */
function parseTabularData(rows: any[]): ParsedContactPreview[] {
    const list: ParsedContactPreview[] = [];

    for (const row of rows) {
        // 1. Resolve Name
        let name = '';
        if (row['Name']) name = String(row['Name']).trim();
        else if (row['نام'] || row['نام و نام خانوادگی']) name = String(row['نام'] || row['نام و نام خانوادگی']).trim();
        else if (row['First Name'] || row['Last Name'] || row['Given Name'] || row['Family Name']) {
            const first = String(row['Given Name'] || row['First Name'] || '').trim();
            const last = String(row['Family Name'] || row['Last Name'] || '').trim();
            name = `${first} ${last}`.trim();
        }

        name = fixMojibake(name);

        // 2. Resolve Phone
        let phone = '';
        const phoneCandidates = [
            row['Phone 1 - Value'],
            row['Phone 1'],
            row['موبایل'],
            row['Mobile'],
            row['Mobile Phone'],
            row['Phone'],
            row['Phone Number'],
            row['تلفن'],
            row['شماره'],
            row['شماره تماس'],
            row['Business Phone'],
            row['Home Phone']
        ];
        for (const cand of phoneCandidates) {
            if (cand && String(cand).trim()) {
                phone = normalizePhoneNumber(String(cand));
                break;
            }
        }

        // Secondary Phone
        let secPhone = '';
        if (row['Phone 2 - Value'] || row['Phone 2'] || row['تلفن دوم']) {
            secPhone = normalizePhoneNumber(String(row['Phone 2 - Value'] || row['Phone 2'] || row['تلفن دوم']));
        }

        // 3. Email
        const email = String(row['E-mail 1 - Value'] || row['E-mail Address'] || row['Email'] || row['ایمیل'] || '').trim();

        // 4. Birthday
        const birthday = String(row['Birthday'] || row['تاریخ تولد'] || '').trim();

        // 5. Company / Org
        const company = fixMojibake(String(row['Organization 1 - Name'] || row['Company'] || row['شرکت'] || '').trim());

        // 6. Address
        const address = fixMojibake(String(row['Address 1 - Formatted'] || row['Address'] || row['آدرس'] || '').trim());

        // 7. Notes
        const notes = fixMojibake(String(row['Notes'] || row['یادداشت'] || '').trim());

        if (name || phone) {
            list.push({
                id: Math.random().toString(36).substr(2, 9),
                name: name || phone || 'مخاطب بدون نام',
                mobile: phone,
                secondaryPhone: secPhone || undefined,
                email: email || undefined,
                birthday: birthday || undefined,
                company: company || undefined,
                address: address || undefined,
                notes: notes || undefined,
                isDuplicate: false,
                selected: true
            });
        }
    }
    return list;
}

export const GoogleContactsImportModal: React.FC<GoogleContactsImportModalProps> = ({
    isOpen,
    onClose,
    existingContacts,
    onImportSuccess
}) => {
    const [fileName, setFileName] = useState<string>('');
    const [parsedList, setParsedList] = useState<ParsedContactPreview[]>([]);
    const [searchFilter, setSearchFilter] = useState('');
    const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'all'>('skip');
    const [isParsing, setIsParsing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setErrorMessage(null);
        setIsParsing(true);

        const lowerName = file.name.toLowerCase();

        if (lowerName.endsWith('.vcf') || lowerName.endsWith('.vcard')) {
            // Read as UTF-8 text for vCard
            const textReader = new FileReader();
            textReader.onload = (event) => {
                try {
                    const text = event.target?.result as string;
                    const items = parseVCardText(text);
                    enrichWithDuplicates(items);
                } catch (err) {
                    console.error('vCard parse error:', err);
                    setErrorMessage('خطا در خواندن فایل vCard. لطفاً از سالم بودن فایل مطمئن شوید.');
                } finally {
                    setIsParsing(false);
                }
            };
            textReader.readAsText(file, 'UTF-8');
        } else {
            // Read as ArrayBuffer for CSV or Excel via XLSX to preserve UTF-8 Persian text
            const bufReader = new FileReader();
            bufReader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const wb = XLSX.read(data, { type: 'array', codepage: 65001 });
                    const sheetName = wb.SheetNames[0];
                    const sheet = wb.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet);
                    if (!rows || rows.length === 0) {
                        setErrorMessage('هیچ ردیفی در فایل انتخابی یافت نشد.');
                        setParsedList([]);
                        return;
                    }
                    const items = parseTabularData(rows);
                    enrichWithDuplicates(items);
                } catch (err) {
                    console.error('CSV/Excel parse error:', err);
                    setErrorMessage('خطا در خواندن فایل CSV یا اکسل. لطفاً خروجی استاندارد گوگل کانتکت را انتخاب کنید.');
                } finally {
                    setIsParsing(false);
                }
            };
            bufReader.readAsArrayBuffer(file);
        }
    };

    const enrichWithDuplicates = (items: ParsedContactPreview[]) => {
        const enriched = items.map(item => {
            const cleanMob = item.mobile.replace(/^0/, '').trim();
            const found = existingContacts.find(c => {
                const exMob = (c.mobile || '').replace(/^0/, '').trim();
                if (cleanMob && exMob && (cleanMob.endsWith(exMob) || exMob.endsWith(cleanMob))) return true;
                if (c.name.trim().toLowerCase() === item.name.trim().toLowerCase()) return true;
                return false;
            });
            return {
                ...item,
                isDuplicate: !!found,
                existingMatchName: found?.name,
                // Default uncheck duplicates if mode is 'skip'
                selected: duplicateMode === 'skip' ? !found : true
            };
        });
        setParsedList(enriched);
    };

    const toggleSelectAll = (checked: boolean) => {
        setParsedList(prev => prev.map(p => ({
            ...p,
            selected: checked
        })));
    };

    const toggleItem = (id: string) => {
        setParsedList(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
    };

    const filteredPreview = parsedList.filter(p => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.mobile.includes(q) || (p.email && p.email.toLowerCase().includes(q));
    });

    const totalCount = parsedList.length;
    const duplicateCount = parsedList.filter(p => p.isDuplicate).length;
    const newCount = totalCount - duplicateCount;
    const selectedCount = parsedList.filter(p => p.selected).length;

    const handleConfirmImport = () => {
        const selectedToImport = parsedList.filter(p => p.selected);
        if (selectedToImport.length === 0) {
            alert('لطفاً حداقل یک مخاطب را جهت واردسازی انتخاب فرمایید.');
            return;
        }

        const finalContacts: SalesContact[] = selectedToImport.map(p => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: p.name,
            mobile: p.mobile,
            birthday: p.birthday || '',
            sendBirthdayGreeting: true,
            accountCode: undefined
        }));

        onImportSuccess(finalContacts, duplicateMode);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in text-right font-sans" dir="rtl">
            <div className="glass-panel rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex flex-col max-h-[90vh] animate-scale-in">
                
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white p-5 md:p-6 flex items-center justify-between shadow-md shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
                            <Users size={26} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black">ایمپورت مخاطبین از Google Contacts</h2>
                            <p className="text-xs text-blue-100 mt-0.5 font-medium">
                                بارگذاری مستقیم خروجی‌های Google CSV و vCard و اضافه کردن به لیست مشتریان
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 custom-scrollbar">
                    
                    {/* Step 1: Upload File or Drag & Drop */}
                    {parsedList.length === 0 ? (
                        <div className="space-y-4">
                            {/* Guide Card */}
                            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-4 rounded-2xl flex items-start gap-3">
                                <Sparkles size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                                <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
                                    <strong>راهنمای سریع:</strong> وارد وب‌سایت <span className="underline font-bold dir-ltr inline-block">contacts.google.com</span> شوید، روی دکمه <strong>Export</strong> (خروجی گرفتن) کلیک کنید و فایل <strong>Google CSV</strong> یا <strong>vCard</strong> را دانلود فرمایید. سپس آن فایل را در کادر زیر انتخاب نمایید.
                                </div>
                            </div>

                            {/* Drop Zone */}
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-indigo-300 dark:border-indigo-700/60 hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-3xl p-8 md:p-12 text-center cursor-pointer transition-all hover:scale-[1.005] group"
                            >
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    className="hidden" 
                                    accept=".csv, .vcf, .vcard, .xlsx, .xls"
                                    onChange={handleFileSelected} 
                                />
                                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-3xl mx-auto flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-md">
                                    <Upload size={30} />
                                </div>
                                <h3 className="text-base font-black text-gray-800 dark:text-gray-100 mb-1">
                                    کلیک کنید یا فایل خروجی گوگل را اینجا رها نمایید
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                                    پشتیبانی از فرمت‌های <strong>Google CSV (.csv)</strong>، <strong>vCard (.vcf)</strong> و فایل‌های اکسل مخاطبین
                                </p>
                            </div>

                            {isParsing && (
                                <div className="text-center py-6 text-indigo-600 dark:text-indigo-400 font-bold text-xs animate-pulse">
                                    در حال پردازش و استخراج مخاطبین...
                                </div>
                            )}

                            {errorMessage && (
                                <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl flex items-center gap-2 text-red-700 dark:text-red-300 text-xs font-bold">
                                    <AlertCircle size={18} className="shrink-0" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Step 2: Preview & Select Contacts */
                        <div className="space-y-4 animate-fade-in">
                            {/* Summary Bar */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-center">
                                    <span className="text-[11px] text-gray-500 block font-bold">کل مخاطبین فایل</span>
                                    <span className="text-lg font-black text-gray-900 dark:text-white font-mono">{totalCount}</span>
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 text-center">
                                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block font-bold">مخاطبین جدید</span>
                                    <span className="text-lg font-black text-emerald-700 dark:text-emerald-300 font-mono">{newCount}</span>
                                </div>
                                <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-2xl border border-amber-200 dark:border-amber-800/60 text-center">
                                    <span className="text-[11px] text-amber-700 dark:text-amber-300 block font-bold">قبلاً ثبت شده (تکراری)</span>
                                    <span className="text-lg font-black text-amber-700 dark:text-amber-300 font-mono">{duplicateCount}</span>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-2xl border border-blue-200 dark:border-blue-800/60 text-center">
                                    <span className="text-[11px] text-blue-700 dark:text-blue-300 block font-bold">انتخاب شده جهت ورود</span>
                                    <span className="text-lg font-black text-blue-700 dark:text-blue-300 font-mono">{selectedCount}</span>
                                </div>
                            </div>

                            {/* Duplicate Policy & Search */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-gray-50 dark:bg-gray-800/70 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">سیاست مواجهه با تکراری‌ها:</span>
                                    <div className="flex gap-1.5">
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setDuplicateMode('skip');
                                                setParsedList(prev => prev.map(p => ({ ...p, selected: !p.isDuplicate })));
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${duplicateMode === 'skip' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}
                                        >
                                            رد کردن تکراری‌ها (فقط جدیدها)
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setDuplicateMode('update');
                                                setParsedList(prev => prev.map(p => ({ ...p, selected: true })));
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${duplicateMode === 'update' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'}`}
                                        >
                                            بروزرسانی تکراری‌ها
                                        </button>
                                    </div>
                                </div>

                                <div className="relative w-full md:w-64">
                                    <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="جستجو در لیست مخاطبین..." 
                                        value={searchFilter} 
                                        onChange={e => setSearchFilter(e.target.value)} 
                                        className="w-full pr-9 pl-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Select All Bar */}
                            <div className="flex items-center justify-between text-xs font-bold px-2 text-gray-500">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedCount === totalCount && totalCount > 0} 
                                        onChange={e => toggleSelectAll(e.target.checked)} 
                                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                                    />
                                    <span>انتخاب / عدم انتخاب همه ({selectedCount} از {totalCount})</span>
                                </label>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setParsedList([]);
                                        setFileName('');
                                    }} 
                                    className="text-xs text-red-600 hover:underline cursor-pointer"
                                >
                                    انتخاب فایل دیگر
                                </button>
                            </div>

                            {/* Table of Preview */}
                            <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-xs text-right">
                                    <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 sticky top-0 z-10 font-bold border-b border-gray-200 dark:border-gray-700">
                                        <tr>
                                            <th className="p-3 text-center w-12">انتخاب</th>
                                            <th className="p-3">نام و مشخصات</th>
                                            <th className="p-3 text-center">شماره تماس (موبایل)</th>
                                            <th className="p-3 text-center">ایمیل / سایر</th>
                                            <th className="p-3 text-center">وضعیت تکراری</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {filteredPreview.map(item => (
                                            <tr 
                                                key={item.id} 
                                                onClick={() => toggleItem(item.id)}
                                                className={`cursor-pointer transition-colors ${
                                                    item.selected 
                                                        ? 'bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50/70' 
                                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/40 opacity-60'
                                                }`}
                                            >
                                                <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={item.selected} 
                                                        onChange={() => toggleItem(item.id)} 
                                                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-black text-gray-900 dark:text-gray-100">{item.name}</div>
                                                    {item.company && <span className="text-[10px] text-gray-400 block">{item.company}</span>}
                                                </td>
                                                <td className="p-3 text-center font-mono font-bold text-gray-700 dark:text-gray-300 dir-ltr">
                                                    {item.mobile || <span className="text-gray-400 italic font-sans text-[10px]">بدون شماره</span>}
                                                </td>
                                                <td className="p-3 text-center text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                                                    {item.email || '-'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {item.isDuplicate ? (
                                                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                            موجود در CRM
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                            جدید
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredPreview.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-gray-400 italic">
                                                    مخاطبی با فیلتر جستجو شده یافت نشد.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 md:p-5 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center gap-3 bg-gray-50 dark:bg-gray-900/60 shrink-0">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-all cursor-pointer"
                    >
                        انصراف و بستن
                    </button>

                    {parsedList.length > 0 && (
                        <button 
                            type="button"
                            onClick={handleConfirmImport}
                            disabled={selectedCount === 0}
                            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                            <CheckCircle2 size={18} />
                            <span>افزودن {selectedCount} مخاطب به سیستم</span>
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
};
