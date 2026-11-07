import React, { useState, useEffect } from 'react';
import { Calculator, X, Minus, Copy, Check, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../constants';

interface FloatingCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isMinimized: boolean;
}

export const FloatingCalculator: React.FC<FloatingCalculatorProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isMinimized
}) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [copied, setCopied] = useState(false);
  const [isCalculated, setIsCalculated] = useState(false);

  const handleDigit = (d: string) => {
    if (isCalculated || display === '0') {
      setDisplay(d);
      setIsCalculated(false);
    } else {
      if (display.length < 15) {
        setDisplay(prev => prev + d);
      }
    }
  };

  const handleDot = () => {
    if (isCalculated) {
      setDisplay('0.');
      setIsCalculated(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(prev => prev + '.');
    }
  };

  const handleOperator = (op: string) => {
    setIsCalculated(false);
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
    setIsCalculated(false);
  };

  const handleCalculate = () => {
    if (!equation) return;
    try {
      const parts = equation.trim().split(' ');
      const num1 = parseFloat(parts[0]);
      const op = parts[1];
      const num2 = parseFloat(display);
      let res = 0;
      if (op === '+') res = num1 + num2;
      else if (op === '-') res = num1 - num2;
      else if (op === '×' || op === '*') res = num1 * num2;
      else if (op === '÷' || op === '/') {
        if (num2 === 0) {
          setDisplay('خطای تقسیم بر صفر');
          setIsCalculated(true);
          return;
        }
        res = num1 / num2;
      } else if (op === '%') {
        res = (num1 * num2) / 100;
      }
      const finalVal = Math.round(res * 10000) / 10000;
      setDisplay(String(finalVal));
      setEquation(equation + display + ' =');
      setIsCalculated(true);
    } catch {
      setDisplay('خطا');
    }
  };

  const handleBackspace = () => {
    if (isCalculated) {
      setDisplay('0');
      setIsCalculated(false);
      return;
    }
    setDisplay(prev => {
      if (prev === '0' || prev === 'خطا' || prev === 'خطای تقسیم بر صفر' || prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const key = e.key;
      if (key >= '0' && key <= '9') {
        e.preventDefault();
        handleDigit(key);
      } else if (key === '.') {
        e.preventDefault();
        handleDot();
      } else if (key === '+') {
        e.preventDefault();
        handleOperator('+');
      } else if (key === '-') {
        e.preventDefault();
        handleOperator('-');
      } else if (key === '*' || key.toLowerCase() === 'x') {
        e.preventDefault();
        handleOperator('×');
      } else if (key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (key === '%') {
        e.preventDefault();
        handleOperator('%');
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleCalculate();
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (key === 'Escape' || key.toLowerCase() === 'c') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isMinimized, display, equation, isCalculated]);

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <motion.div 
        drag
        dragMomentum={false}
        onClick={onMinimize}
        className="fixed top-20 left-6 z-[9999] bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 rounded-2xl shadow-xl flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all hover:scale-105 active:scale-95 border border-emerald-400/40"
        title="ماشین‌حساب (کوچک شده - قابل جابجایی با کشیدن)"
      >
        <Calculator size={18} />
        <span className="text-xs font-bold font-mono dir-ltr">{formatCurrency(parseFloat(display.replace(/,/g, '')) || 0)}</span>
      </motion.div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(display.replace(/,/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed top-24 left-8 z-[9999] w-72 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden text-zinc-800 dark:text-zinc-100 flex flex-col"
    >
      {/* Header (Draggable) */}
      <div className="bg-zinc-100/80 dark:bg-zinc-900/80 px-3.5 py-2.5 flex items-center justify-between border-b border-zinc-200/50 dark:border-zinc-800/50 cursor-move select-none">
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-emerald-500" />
          <span className="text-xs font-bold">ماشین‌حساب مالی (قابل کشیدن)</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            type="button" 
            onClick={handleCopy} 
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md text-zinc-500 transition-colors cursor-pointer" 
            title="کپی نتیجه"
          >
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
          </button>
          <button 
            type="button" 
            onClick={onMinimize} 
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-md text-zinc-500 transition-colors cursor-pointer" 
            title="کوچک کردن"
          >
            <Minus size={14} />
          </button>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-500 rounded-md transition-colors cursor-pointer" 
            title="بستن"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Screen */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 flex flex-col items-end justify-end min-h-[76px] border-b border-zinc-200/40 dark:border-zinc-800/40">
        <div className="text-[11px] text-zinc-400 font-mono h-4 truncate dir-ltr">{equation}</div>
        <div className="text-2xl font-black font-mono tracking-tight text-zinc-900 dark:text-white truncate max-w-full dir-ltr">
          {display}
        </div>
      </div>

      {/* Keypad */}
      <div className="p-3 grid grid-cols-4 gap-1.5 text-xs font-bold">
        <button type="button" onClick={handleClear} className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 transition-colors">C</button>
        <button type="button" onClick={() => handleOperator('%')} className="p-2.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl hover:bg-zinc-200 transition-colors">%</button>
        <button type="button" onClick={() => handleOperator('÷')} className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-colors">÷</button>
        <button type="button" onClick={() => handleOperator('×')} className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-colors">×</button>

        <button type="button" onClick={() => handleDigit('7')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">7</button>
        <button type="button" onClick={() => handleDigit('8')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">8</button>
        <button type="button" onClick={() => handleDigit('9')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">9</button>
        <button type="button" onClick={() => handleOperator('-')} className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-colors">-</button>

        <button type="button" onClick={() => handleDigit('4')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">4</button>
        <button type="button" onClick={() => handleDigit('5')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">5</button>
        <button type="button" onClick={() => handleDigit('6')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">6</button>
        <button type="button" onClick={() => handleOperator('+')} className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 transition-colors">+</button>

        <button type="button" onClick={() => handleDigit('1')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">1</button>
        <button type="button" onClick={() => handleDigit('2')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">2</button>
        <button type="button" onClick={() => handleDigit('3')} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">3</button>
        <button type="button" onClick={handleCalculate} className="row-span-2 p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center font-black text-base shadow-md transition-colors">=</button>

        <button type="button" onClick={() => handleDigit('0')} className="col-span-2 p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">0</button>
        <button type="button" onClick={handleDot} className="p-2.5 bg-zinc-100/80 dark:bg-zinc-900/60 rounded-xl hover:bg-zinc-200 transition-colors">.</button>
      </div>
    </motion.div>
  );
};
