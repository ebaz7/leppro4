import React, { useState, useEffect, useRef } from 'react';

// Common Persian plate letters
export const PERSIAN_PLATE_CHARS = [
  'الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 
  'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض', 
  'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 
  'م', 'ن', 'و', 'ه', 'ی', 'D', 'S'
];

// Helper to convert Persian/Arabic digits to English digits
export const toEnglishDigits = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, d => (d.charCodeAt(0) - 1776).toString())
    .replace(/[٠-٩]/g, d => (d.charCodeAt(0) - 1632).toString());
};

// Parse a raw plate string into 4 components
export const parsePlateParts = (plateStr: string) => {
  if (!plateStr) return { p1: '', char: '', p2: '', city: '' };
  
  const raw = toEnglishDigits(plateStr).trim();

  // Pattern 0: Delimited with spaces or dashes or "ایران"
  // e.g. "15 ج 831 ایران 57" or "15-ج-831-57" or "15 ج 831 57"
  const spaced = raw.match(/^(\d{1,2})\s*[-/]?\s*([^\d\s\-_/]{1,5})\s*[-/]?\s*(\d{1,3})\s*(?:[-/]|ایران|\s)*\s*(\d{1,2})?$/);
  if (spaced) {
    return {
      p1: spaced[1] || '',
      char: spaced[2] || 'ب',
      p2: spaced[3] || '',
      city: spaced[4] || ''
    };
  }
  
  const clean = raw.replace(/\s+/g, '').replace(/[-|/_]/g, '').replace(/ایران/g, '');
  
  // Pattern 1: Standard order: 2 digits + 1+ Persian/Latin characters + 3 digits + 2 digits (e.g. 12ب34567 or 12الف34567)
  const match1 = clean.match(/^(\d{2})([^\d\s]{1,5})(\d{3})(\d{2})$/);
  if (match1) {
    return {
      p1: match1[1],
      char: match1[2],
      p2: match1[3],
      city: match1[4]
    };
  }

  // Pattern 2: Reversed order (3 digits + char + 2 digits + 2 digits, e.g. "345 ق 15 57")
  const match2 = clean.match(/^(\d{3})([^\d\s]{1,5})(\d{2})(\d{2})$/);
  if (match2) {
    return {
      p1: match2[3],
      char: match2[2],
      p2: match2[1],
      city: match2[4]
    };
  }

  // Pattern 3: Standard without city code (e.g. 12ب345)
  const match3 = clean.match(/^(\d{2})([^\d\s]{1,5})(\d{3})$/);
  if (match3) {
    return {
      p1: match3[1],
      char: match3[2],
      p2: match3[3],
      city: ''
    };
  }

  // Pattern 4: Reversed without city code (e.g. 345ب12)
  const match4 = clean.match(/^(\d{3})([^\d\s]{1,5})(\d{2})$/);
  if (match4) {
    return {
      p1: match4[3],
      char: match4[2],
      p2: match4[1],
      city: ''
    };
  }

  // Pattern 5: Any combination separated by letter
  const letterMatch = clean.match(/^(\d{1,2})([^\d\s]+)(\d*)$/);
  if (letterMatch) {
    const afterDigits = letterMatch[3];
    return {
      p1: letterMatch[1],
      char: letterMatch[2],
      p2: afterDigits.length > 3 ? afterDigits.slice(0, 3) : afterDigits,
      city: afterDigits.length > 3 ? afterDigits.slice(3, 5) : ''
    };
  }
  
  // Partial match attempt
  const digits = clean.replace(/[^0-9]/g, '');
  const chars = clean.replace(/[0-9]/g, '');
  
  return {
    p1: digits.slice(0, 2),
    char: chars.slice(0, 5) || 'ب',
    p2: digits.slice(2, 5),
    city: digits.slice(5, 7)
  };
};

// Format parts back to a unified plate string (e.g. "12 ب 345 ایران 67")
export const formatPlateParts = (p1: string, char: string, p2: string, city: string) => {
  if (!p1 && !char && !p2 && !city) return '';
  const c = char || 'ب';
  if (city) {
    return `${p1} ${c} ${p2} ایران ${city}`.trim();
  }
  return `${p1} ${c} ${p2}`.trim();
};

// ==================== PLATE DISPLAY COMPONENT ====================
interface IranianPlateDisplayProps {
  value?: string;
  p1?: string;
  char?: string;
  p2?: string;
  city?: string;
  size?: 'nano' | 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const IranianPlateDisplay: React.FC<IranianPlateDisplayProps> = ({
  value,
  p1: p1Prop,
  char: charProp,
  p2: p2Prop,
  city: cityProp,
  size = 'md',
  className = ''
}) => {
  let p1 = p1Prop || '';
  let char = charProp || '';
  let p2 = p2Prop || '';
  let city = cityProp || '';

  if (value && (!p1 || !char || !p2 || !city)) {
    const parsed = parsePlateParts(value);
    p1 = parsed.p1;
    char = parsed.char;
    p2 = parsed.p2;
    city = parsed.city;
  }

  // Size styling maps
  const sizeStyles = {
    nano: {
      container: 'h-5 text-[8px] rounded border border-gray-800 shrink-0',
      flagWidth: 'w-2',
      flagText: 'text-[3px]',
      p1Width: 'w-3.5',
      charWidth: 'w-3.5',
      p2Width: 'w-5',
      cityWidth: 'w-4',
      cityText: 'text-[5px]',
    },
    xs: {
      container: 'h-6 text-[10px] rounded shrink-0',
      flagWidth: 'w-3',
      flagText: 'text-[4px]',
      p1Width: 'w-5',
      charWidth: 'w-5',
      p2Width: 'w-7',
      cityWidth: 'w-6',
      cityText: 'text-[6px]',
    },
    sm: {
      container: 'h-8 text-xs rounded-md',
      flagWidth: 'w-4',
      flagText: 'text-[5px]',
      p1Width: 'w-6',
      charWidth: 'w-6',
      p2Width: 'w-9',
      cityWidth: 'w-7',
      cityText: 'text-[7px]',
    },
    md: {
      container: 'h-11 text-base rounded-lg border-2',
      flagWidth: 'w-6',
      flagText: 'text-[6px]',
      p1Width: 'w-10',
      charWidth: 'w-10',
      p2Width: 'w-14',
      cityWidth: 'w-11',
      cityText: 'text-[8px]',
    },
    lg: {
      container: 'h-14 text-2xl rounded-xl border-2',
      flagWidth: 'w-8',
      flagText: 'text-[7px]',
      p1Width: 'w-14',
      charWidth: 'w-14',
      p2Width: 'w-20',
      cityWidth: 'w-14',
      cityText: 'text-[9px]',
    }
  }[size];

  if (!p1 && !char && !p2 && !city) {
    return <span className={`text-gray-400 font-mono ${className}`}>-</span>;
  }

  return (
    <div 
      className={`inline-flex items-center bg-white border-gray-900 text-gray-900 font-black shadow-sm overflow-hidden select-none dir-ltr ${sizeStyles.container} ${className}`}
      style={{ borderColor: '#1f2937' }}
    >
      {/* Left Blue Strip */}
      <div className={`bg-[#1E4198] ${sizeStyles.flagWidth} h-full flex flex-col items-center justify-center text-white shrink-0 py-0.5`}>
        <div className="flex gap-[1px] mb-0.5">
          <div className="w-1.5 h-0.5 bg-green-500"></div>
          <div className="w-1.5 h-0.5 bg-white"></div>
          <div className="w-1.5 h-0.5 bg-red-500"></div>
        </div>
        <span className={`${sizeStyles.flagText} font-bold leading-none`}>I.R.</span>
        <span className={`${sizeStyles.flagText} font-bold leading-none`}>IRAN</span>
      </div>

      {/* Part 1 (2 digits) */}
      <div className={`${sizeStyles.p1Width} text-center font-bold tracking-tight shrink-0`}>
        {p1 || '--'}
      </div>

      {/* Letter */}
      <div className={`${sizeStyles.charWidth} text-center font-black text-blue-900 shrink-0`}>
        {char || '-'}
      </div>

      {/* Part 2 (3 digits) */}
      <div className={`${sizeStyles.p2Width} text-center font-bold tracking-tight shrink-0`}>
        {p2 || '---'}
      </div>

      {/* City Section (Right) */}
      <div className={`${sizeStyles.cityWidth} h-full flex flex-col border-l-2 border-gray-900 bg-gray-50 shrink-0`}>
        <div className={`h-1/3 flex items-center justify-center border-b border-gray-300 ${sizeStyles.cityText} font-black text-gray-500`}>
          ایران
        </div>
        <div className="flex-1 flex items-center justify-center font-bold leading-none">
          {city || '--'}
        </div>
      </div>
    </div>
  );
};


// ==================== PLATE INPUT COMPONENT ====================
interface IranianPlateInputProps {
  value?: string;
  onChange: (val: string) => void;
  onEnter?: () => void;
  className?: string;
}

export const IranianPlateInput: React.FC<IranianPlateInputProps> = ({
  value = '',
  onChange,
  onEnter,
  className = ''
}) => {
  const parsed = parsePlateParts(value);

  const [p1, setP1] = useState(parsed.p1);
  const [char, setChar] = useState(parsed.char || 'ب');
  const [p2, setP2] = useState(parsed.p2);
  const [city, setCity] = useState(parsed.city);

  const ref1 = useRef<HTMLInputElement>(null);
  const refChar = useRef<HTMLSelectElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const refCity = useRef<HTMLInputElement>(null);

  const isInternalChangeRef = useRef(false);
  const prevValueRef = useRef(value);

  // Keep state synced ONLY if parent value changes externally (e.g. from memory recall or permit load)
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      prevValueRef.current = value;
      return;
    }
    if (prevValueRef.current === value) {
      return;
    }
    prevValueRef.current = value;
    const curParsed = parsePlateParts(value);
    setP1(curParsed.p1);
    if (curParsed.char) setChar(curParsed.char);
    setP2(curParsed.p2);
    setCity(curParsed.city);
  }, [value]);

  const updateAll = (np1: string, nchar: string, np2: string, ncity: string) => {
    isInternalChangeRef.current = true;
    setP1(np1);
    setChar(nchar);
    setP2(np2);
    setCity(ncity);
    onChange(formatPlateParts(np1, nchar, np2, ncity));
  };

  // 1. First 2 digits (p1)
  const handleP1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toEnglishDigits(e.target.value).replace(/\D/g, '');
    const val = raw.length > 2 ? raw.slice(-2) : raw;
    updateAll(val, char, p2, city);
  };

  // 2. Persian letter dropdown (char)
  const handleCharChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    updateAll(p1, val, p2, city);
    ref2.current?.focus();
  };

  // 3. Middle 3 digits (p2)
  const handleP2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toEnglishDigits(e.target.value).replace(/\D/g, '');
    const val = raw.length > 3 ? raw.slice(-3) : raw;
    updateAll(p1, char, val, city);
  };

  // 4. City code 2 digits (city)
  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toEnglishDigits(e.target.value).replace(/\D/g, '');
    const val = raw.length > 2 ? raw.slice(-2) : raw;
    updateAll(p1, char, p2, val);
  };

  // Keyboard Navigation: Enter advances to next field; Backspace in empty field goes back
  const handleKeyDownP1 = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      refChar.current?.focus();
    }
  };

  const handleKeyDownChar = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      ref2.current?.focus();
    } else if (e.key === 'Backspace' && !char) {
      ref1.current?.focus();
    }
  };

  const handleKeyDownP2 = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      refCity.current?.focus();
    } else if (e.key === 'Backspace' && !p2) {
      refChar.current?.focus();
    }
  };

  const handleKeyDownCity = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      if (onEnter) {
        onEnter();
      } else {
        refCity.current?.blur();
      }
    } else if (e.key === 'Backspace' && !city) {
      ref2.current?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      e.preventDefault();
      const p = parsePlateParts(text);
      if (p.p1 || p.char || p.p2 || p.city) {
        updateAll(p.p1, p.char || 'ب', p.p2, p.city);
      }
    }
  };

  const [directText, setDirectText] = useState('');
  const [showDirect, setShowDirect] = useState(false);

  const handleDirectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDirectText(val);
    const p = parsePlateParts(val);
    if (p.p1 || p.char || p.p2 || p.city) {
      setP1(p.p1);
      if (p.char) setChar(p.char);
      setP2(p.p2);
      setCity(p.city);
      onChange(formatPlateParts(p.p1, p.char || 'ب', p.p2, p.city));
    }
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 w-full max-w-full ${className}`} onPaste={handlePaste}>
      <div 
        className="flex items-center justify-center bg-white border-2 border-gray-800 rounded-xl overflow-hidden h-12 sm:h-14 font-black shadow-md ring-2 ring-blue-500/10 focus-within:ring-blue-500/30 transition-all select-none w-full max-w-[340px] mx-auto"
        dir="ltr"
      >
        {/* Left Blue Strip */}
        <div className="bg-[#1E4198] w-7 sm:w-8 h-full flex flex-col items-center justify-center text-white py-0.5 shrink-0 relative">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex gap-[1px]">
              <div className="w-1.5 h-0.5 bg-green-500"></div>
              <div className="w-1.5 h-0.5 bg-white"></div>
              <div className="w-1.5 h-0.5 bg-red-500"></div>
            </div>
            <span className="text-[6px] sm:text-[7px] font-black leading-none">I.R.</span>
            <span className="text-[6px] sm:text-[7px] font-black leading-none">IRAN</span>
          </div>
        </div>

        {/* Part 1 (2 digits) */}
        <div className="w-10 sm:w-12 h-full flex items-center justify-center border-r border-gray-200 shrink-0">
          <input
            ref={ref1}
            type="text"
            inputMode="numeric"
            enterKeyHint="next"
            className="w-full h-full text-center text-lg sm:text-2xl font-black outline-none bg-transparent focus:bg-blue-50/60 transition-colors text-gray-900"
            placeholder="۱۲"
            value={p1}
            onChange={handleP1Change}
            onKeyDown={handleKeyDownP1}
            onFocus={e => e.target.select()}
          />
        </div>

        {/* Persian Letter Select */}
        <div className="w-12 sm:w-14 h-full flex items-center justify-center bg-gray-50/50 border-r border-gray-200 shrink-0">
          <select
            ref={refChar}
            enterKeyHint="next"
            className="w-full h-full text-center text-base sm:text-xl font-black bg-transparent outline-none appearance-none cursor-pointer text-blue-900 text-center"
            value={char}
            onChange={handleCharChange}
            onKeyDown={handleKeyDownChar}
          >
            {PERSIAN_PLATE_CHARS.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Part 2 (3 digits) */}
        <div className="flex-1 min-w-[50px] sm:min-w-[65px] h-full flex items-center justify-center">
          <input
            ref={ref2}
            type="text"
            inputMode="numeric"
            enterKeyHint="next"
            className="w-full h-full text-center text-lg sm:text-2xl font-black outline-none bg-transparent focus:bg-blue-50/60 transition-colors text-gray-900"
            placeholder="۳۴۵"
            value={p2}
            onChange={handleP2Change}
            onKeyDown={handleKeyDownP2}
            onFocus={e => e.target.select()}
          />
        </div>

        {/* City Code (Right Section) */}
        <div className="w-11 sm:w-13 h-full flex flex-col border-l-2 border-gray-800 bg-gray-50 shrink-0">
          <div className="h-4 flex items-center justify-center text-[7px] sm:text-[8px] border-b border-gray-300 font-black text-gray-500 tracking-wider">
            ایران
          </div>
          <input
            ref={refCity}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            className="w-full flex-1 h-full text-center text-base sm:text-xl font-black outline-none bg-transparent focus:bg-blue-50/60 transition-colors text-gray-900"
            placeholder="۶۷"
            value={city}
            onChange={handleCityChange}
            onKeyDown={handleKeyDownCity}
            onFocus={e => e.target.select()}
          />
        </div>
      </div>

      <div className="flex items-center justify-between w-full max-w-[340px] px-1 text-[11px] text-gray-500">
        <span className="text-[10px] text-gray-400 font-medium">پرش بین بخش‌ها با Enter یا Next</span>
        <button
          type="button"
          onClick={() => setShowDirect(!showDirect)}
          className="text-blue-600 hover:text-blue-800 text-[11px] font-bold underline"
        >
          {showDirect ? 'بستن کادر متنی' : 'تایپ مستقیم پلاک'}
        </button>
      </div>

      {showDirect && (
        <div className="w-full max-w-[340px] mt-1 animate-fade-in">
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-2 text-center text-sm font-bold dir-ltr placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 outline-none"
            placeholder="مثال: 12ب345ایران67 یا 68ع415ایران22"
            value={directText}
            onChange={handleDirectChange}
          />
        </div>
      )}
    </div>
  );
};
