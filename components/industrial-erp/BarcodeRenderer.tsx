import React from 'react';
import { QrCode } from 'lucide-react';
import {
  ErpCartonLabel,
  ErpLabelTemplateConfig,
  DEFAULT_LABEL_TEMPLATE_CONFIG
} from './types';

// ISO/IEC 15417 Code 128 Pattern Table (0..106)
// Each digit represents width (1..4 modules) alternating Bar, Space, Bar, Space, Bar, Space
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', // 0-7
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', // 8-15
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', // 16-23
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', // 24-31
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 32-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', // 40-47
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', // 48-55
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', // 56-63
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', // 64-71
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 72-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', // 80-87
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', // 88-95
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', // 96-103
  '211214', '211232', '2331112'                                                    // 104(START B), 105(START C), 106(STOP)
];

export function encodeCode128B(rawText: string): { bars: { x: number; w: number }[]; totalWidth: number; cleanText: string } {
  const clean = (rawText || 'DLK-00000')
    .split('')
    .map(ch => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126 ? ch : '-';
    })
    .join('') || 'DLK-00000';

  const startCode = 104; // Code 128 Set B
  const codes: number[] = [startCode];
  let checksum = startCode;

  for (let i = 0; i < clean.length; i++) {
    const val = clean.charCodeAt(i) - 32;
    codes.push(val);
    checksum += (i + 1) * val;
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(106); // Stop pattern

  const quietZone = 10;
  let cursor = quietZone;
  const bars: { x: number; w: number }[] = [];

  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      if (j % 2 === 0) {
        // Even indices are dark bars
        bars.push({ x: cursor, w: width });
      }
      cursor += width;
    }
  }

  return {
    bars,
    totalWidth: cursor + quietZone,
    cleanText: clean
  };
}

interface LinearBarcode1DProps {
  value: string;
  heightPx?: number;
  showText?: boolean;
  className?: string;
}

export const LinearBarcode1D: React.FC<LinearBarcode1DProps> = ({
  value,
  heightPx = 44,
  showText = true,
  className = ''
}) => {
  const { bars, totalWidth, cleanText } = encodeCode128B(value);

  return (
    <div className={`flex flex-col items-center justify-center bg-white px-2 py-1 rounded ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${totalWidth} ${heightPx}`}
        preserveAspectRatio="none"
        className="w-full max-w-[260px]"
        height={heightPx}
        aria-label={`Barcode ${cleanText}`}
      >
        <rect x="0" y="0" width={totalWidth} height={heightPx} fill="#ffffff" />
        {bars.map((b, idx) => (
          <rect key={idx} x={b.x} y={0} width={b.w} height={heightPx} fill="#000000" />
        ))}
      </svg>
      {showText && (
        <span className="font-mono font-black text-[10px] tracking-[0.18em] text-slate-900 mt-0.5 select-all" dir="ltr">
          {cleanText}
        </span>
      )}
    </div>
  );
};

interface CartonLabelCardProps {
  carton: Partial<ErpCartonLabel> & {
    productName: string;
    productCode: string;
    yarnCount?: string;
    colorName?: string;
    machineCode: string;
    shift: string;
    lotNumber: string;
    conesCount: number;
    grade: 'A' | 'B' | 'C';
    grossWeightKg: number;
    totalTareKg: number;
    netWeightKg: number;
    referenceCode: string;
    serialNumber?: string;
    createdDateJalali: string;
    createdTimeExact?: string;
    createdBy?: string;
  };
  companyName: string;
  template?: ErpLabelTemplateConfig;
  qrDataUrl?: string;
  batchIndexLabel?: string;
}

export const CartonLabelCard: React.FC<CartonLabelCardProps> = ({
  carton,
  companyName,
  template = DEFAULT_LABEL_TEMPLATE_CONFIG,
  qrDataUrl,
  batchIndexLabel
}) => {
  const fields = template.fields || DEFAULT_LABEL_TEMPLATE_CONFIG.fields;
  const barcodeType = template.barcodeType || 'LINEAR_1D';

  const barcodeText =
    template.barcodeValueSource === 'serialNumber'
      ? carton.serialNumber || carton.referenceCode
      : template.barcodeValueSource === 'productCode'
      ? carton.productCode || carton.referenceCode
      : carton.referenceCode;

  const borderCls =
    template.borderStyle === 'NONE'
      ? 'border border-slate-300'
      : template.borderStyle === 'DOUBLE'
      ? 'border-4 border-double border-slate-900'
      : 'border-2 border-slate-800';

  const textScaleCls =
    template.fontSizeScale === 'SMALL'
      ? 'text-[10px]'
      : template.fontSizeScale === 'LARGE'
      ? 'text-xs'
      : 'text-[11px]';

  const showAnyBarcode1D = barcodeType === 'LINEAR_1D' || barcodeType === 'BOTH';
  const showAnyQr = barcodeType === 'QR_2D' || barcodeType === 'BOTH';

  const showWeightBar = fields.showGrossWeight || fields.showTareWeight || fields.showNetWeight;

  return (
    <div
      className={`label-card ${borderCls} rounded-xl p-3 bg-white text-slate-900 space-y-2 select-none shadow-sm ${textScaleCls}`}
      dir="rtl"
    >
      {/* Header */}
      {(fields.showCompanyName || fields.showHeaderSubtitle || batchIndexLabel) && (
        <div className="header text-center border-b border-slate-300 pb-1">
          {fields.showCompanyName && (
            <h4 className="font-black text-xs leading-tight">
              {template.headerTitle?.trim() || companyName || 'شرکت تولیدی و صنعتی'}
            </h4>
          )}
          {(fields.showHeaderSubtitle || batchIndexLabel) && (
            <span className="text-[9px] font-bold text-slate-500 block">
              {fields.showHeaderSubtitle ? (template.headerSubtitle || 'لیبل شناسنامه کارتن نخ صنعتی') : ''}
              {batchIndexLabel ? ` ${fields.showHeaderSubtitle ? '— ' : ''}${batchIndexLabel}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Body + 2D QR (Side by side if QR enabled) */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="space-y-0.5 flex-1 leading-snug">
          {fields.showProductName && (
            <div>
              کالا: <strong className="font-black text-xs">{carton.productName || '—'}</strong>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {fields.showProductCode && (
              <div>
                کد کالا: <span className="font-mono font-bold text-orange-700">{carton.productCode || '—'}</span>
              </div>
            )}
            {fields.showYarnCount && carton.yarnCount && (
              <div>
                نمره: <span className="font-mono font-bold">{carton.yarnCount}</span>
              </div>
            )}
            {fields.showColorName && carton.colorName && (
              <div>
                رنگ: <strong>{carton.colorName}</strong>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {fields.showMachineLine && (
              <div>
                خط/ماشین: <strong>{carton.machineCode || '—'}</strong>
              </div>
            )}
            {fields.showShift && (
              <div>
                شیفت: <strong>{carton.shift || '—'}</strong>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {fields.showLotNumber && (
              <div>
                لات: <span className="font-mono font-bold">{carton.lotNumber || '—'}</span>
              </div>
            )}
            {fields.showConesCount && (
              <div>
                تعداد دوک: <strong>{carton.conesCount} عدد</strong>
              </div>
            )}
            {fields.showGrade && (
              <div>
                گرید: <strong className="text-orange-700">{carton.grade}</strong>
              </div>
            )}
          </div>

          {fields.showOperator && carton.createdBy && (
            <div className="text-[10px] text-slate-600">
              اپراتور توزین: <strong>{carton.createdBy}</strong>
            </div>
          )}
        </div>

        {showAnyQr && (
          <div className="w-20 h-20 bg-slate-50 border border-slate-300 rounded flex items-center justify-center p-0.5 shrink-0">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" className="w-full h-full object-contain" />
            ) : (
              <QrCode size={64} className="text-slate-800" />
            )}
          </div>
        )}
      </div>

      {/* Linear 1D Barcode (Factory Classic / Sayan Compatible) */}
      {showAnyBarcode1D && (
        <div className="border border-slate-200 rounded-lg py-1 bg-white">
          <LinearBarcode1D
            value={barcodeText}
            heightPx={template.linearBarcodeHeightPx || 44}
            showText={template.showBarcodeHumanText !== false}
          />
        </div>
      )}

      {/* Weights Bar */}
      {showWeightBar && (
        <div className="weights-row bg-slate-100 p-1.5 rounded flex items-center justify-between font-mono font-bold text-[11px] border border-slate-300">
          {fields.showGrossWeight && <div>Gross: {Number(carton.grossWeightKg || 0).toFixed(2)} Kg</div>}
          {fields.showTareWeight && <div>Tare: {Number(carton.totalTareKg || 0).toFixed(3)} Kg</div>}
          {fields.showNetWeight && (
            <div className="text-emerald-800 font-black">Net: {Number(carton.netWeightKg || 0).toFixed(3)} Kg</div>
          )}
        </div>
      )}

      {/* Footer Metadata */}
      {(fields.showReferenceCode || fields.showSerialNumber || fields.showDate || fields.showTime) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-600 pt-1 border-t border-slate-200">
          <div className="flex items-center gap-2">
            {fields.showReferenceCode && (
              <div>
                کد ارجاع: <span className="font-mono font-black text-slate-900">{carton.referenceCode}</span>
              </div>
            )}
            {fields.showSerialNumber && carton.serialNumber && (
              <div>
                سریال: <span className="font-mono font-bold text-slate-800">{carton.serialNumber}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 font-mono">
            {fields.showTime && carton.createdTimeExact && <span>ساعت: {carton.createdTimeExact}</span>}
            {fields.showDate && <span>تاریخ: {carton.createdDateJalali}</span>}
          </div>
        </div>
      )}

      {/* Custom Footer Note */}
      {fields.showFooterNote && template.footerNote?.trim() && (
        <div className="text-center text-[9px] font-bold text-slate-600 border-t border-dashed border-slate-300 pt-1">
          {template.footerNote}
        </div>
      )}
    </div>
  );
};
