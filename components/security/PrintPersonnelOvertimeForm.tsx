import React from 'react';
import { PersonnelOvertime, DailySecurityMeta } from '../../types';
import { formatDate } from '../../constants';

interface Props {
    overtimes: PersonnelOvertime[];
    date: string;
    meta?: DailySecurityMeta;
}

const PrintPersonnelOvertimeForm: React.FC<Props> = ({ overtimes, date, meta }) => {
    const displayOvertimes = [...overtimes];
    while (displayOvertimes.length < 12) displayOvertimes.push({} as any);

    const supervisorName = overtimes.find(d => d.approverSupervisor)?.approverSupervisor;
    const factoryName = overtimes.find(d => d.approverFactory)?.approverFactory;
    const ceoName = overtimes.find(d => d.approverCeo)?.approverCeo;

    const Stamp = ({ title, name, color = 'blue' }: { title: string, name: string, color?: string }) => (
        <div style={{ 
            border: `2px solid ${color === 'green' ? '#166534' : color === 'purple' ? '#581c87' : '#1e40af'}`, 
            color: color === 'green' ? '#166534' : color === 'purple' ? '#581c87' : '#1e40af',
            padding: '2px 8px',
            borderRadius: '6px',
            transform: 'rotate(-5deg)',
            display: 'inline-block',
            opacity: 0.9,
            backgroundColor: 'rgba(255,255,255,0.8)'
        }}>
            <div style={{ fontSize: '9px', fontWeight: 'bold', borderBottom: '1px solid currentColor', paddingBottom: '1px', marginBottom: '1px', textAlign: 'center' }}>{title}</div>
            <div style={{ fontSize: '10px', fontWeight: '900', textAlign: 'center' }}>{name}</div>
        </div>
    );

    return (
        <div 
            id="print-overtime-form"
            className="printable-content glass-panel text-black font-sans relative" 
            style={{ 
                width: '100%', 
                height: '100%',
                direction: 'rtl',
                margin: '0 auto', 
                boxSizing: 'border-box',
                padding: '0',
                textAlign: 'center'
            }}
        >
            <div style={{ border: '3px solid black', display: 'flex', flexDirection: 'column', height: '100%' }}>
                
                {/* 1. HEADER SECTION */}
                <div style={{ display: 'flex', height: '110px', borderBottom: '3px solid black' }}>
                    {/* Right: Meta */}
                    <div style={{ width: '160px', borderLeft: '2px solid black', padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>شماره:</span><span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>........</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>تاریخ:</span><span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px' }}>{formatDate(date)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>پیوست:</span><span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>........</span></div>
                    </div>
                    
                    {/* Center: Title */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
                        <h1 style={{ fontSize: '26px', fontWeight: '900', marginBottom: '10px', letterSpacing: '0px', textAlign: 'center' }}>گروه تولیدی</h1>
                        <div style={{ border: '2px solid black', backgroundColor: 'white', padding: '6px 25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>فرم مجوز اضافه کاری پرسنل</h2>
                        </div>
                    </div>

                    {/* Left: Logo */}
                    <div style={{ width: '160px', borderRight: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                        <div style={{ border: '2px dashed #d1d5db', width: '100%', height: '100%', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontWeight: 'bold', fontSize: '14px' }}>
                            محل درج لوگو
                        </div>
                    </div>
                </div>

                {/* 2. MAIN CONTENT (Overtimes Table) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px', tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '45px' }} />
                            <col />
                            <col style={{ width: '130px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '90px' }} />
                            <col style={{ width: '180px' }} />
                        </colgroup>
                        <thead>
                            <tr style={{ backgroundColor: '#e5e7eb', height: '42px' }}>
                                <th style={{ border: '1px solid black', padding: '4px' }}>ردیف</th>
                                <th style={{ border: '1px solid black', padding: '4px' }}>نام و نام خانوادگی</th>
                                <th style={{ border: '1px solid black', padding: '4px' }}>واحد / بخش</th>
                                <th style={{ border: '1px solid black', padding: '4px' }}>شروع</th>
                                <th style={{ border: '1px solid black', padding: '4px' }}>پایان</th>
                                <th style={{ border: '1px solid black', padding: '4px' }}>میزان ساعت</th>
                                <th style={{ border: '1px solid black', padding: '4px' }}>علت اضافه کاری</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayOvertimes.map((d, i) => (
                                <tr key={i} style={{ height: '36px', backgroundColor: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                    <td style={{ border: '1px solid black', fontWeight: 'bold' }}>{d.id ? i + 1 : ''}</td>
                                    <td style={{ border: '1px solid black', fontWeight: 'bold', textAlign: 'right', paddingRight: '12px' }}>{d.personnelName}</td>
                                    <td style={{ border: '1px solid black' }}>{d.unit}</td>
                                    <td style={{ border: '1px solid black', direction: 'ltr', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}>{d.startTime}</td>
                                    <td style={{ border: '1px solid black', direction: 'ltr', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '13px' }}>{d.endTime}</td>
                                    <td style={{ border: '1px solid black', fontWeight: 'bold', color: d.duration ? '#15803d' : 'black' }}>{d.duration}</td>
                                    <td style={{ border: '1px solid black', textAlign: 'right', paddingRight: '8px', fontSize: '12px' }}>{d.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Dedicated Management Directive Box */}
                    <div style={{ marginTop: 'auto', borderTop: '2px solid black', padding: '8px 12px', minHeight: '65px', backgroundColor: '#fdfcfe', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '11px', fontWeight: '900', color: '#1f2937', marginBottom: '4px', textAlign: 'right', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ backgroundColor: '#059669', color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>دستور اختصاصی مدیریت</span>
                            <span>دستور و تایید نهایی مدیریت در خصوص اضافه کاری:</span>
                        </div>
                        <div style={{ flex: 1, textAlign: 'right', fontSize: '12px', lineHeight: '1.6', color: '#111827', minHeight: '32px', whiteSpace: 'pre-wrap', padding: '2px 4px' }}>
                            {overtimes.find(d => d.managementInstruction)?.managementInstruction || '...................................................................................................................................................................................................'}
                        </div>
                    </div>
                </div>

                {/* 3. FOOTER SIGNATURES */}
                <div style={{ height: '115px', borderTop: '3px solid black', display: 'flex', fontSize: '12px' }}>
                    <div style={{ width: '25%', borderLeft: '2px solid black', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', textAlign: 'center', paddingBottom: '3px' }}>ثبت‌کننده / نگهبان</div>
                        <div style={{ fontWeight: 'bold', color: '#374151', textAlign: 'center', fontSize: '13px', height: '28px', display: 'flex', alignItems: 'center' }}>
                            {overtimes.length > 0 && overtimes[0].registrant ? overtimes[0].registrant : 'مقصود محمدی'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#9ca3af' }}>محل امضا</div>
                    </div>

                    <div style={{ width: '25%', borderLeft: '2px solid black', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(254, 252, 232, 0.3)' }}>
                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', textAlign: 'center', paddingBottom: '3px' }}>سرپرست انتظامات</div>
                        {supervisorName ? <Stamp title="تایید شد" name={supervisorName} color="blue" /> : <div style={{ color: '#d1d5db', fontSize: '10px', marginTop: '8px' }}>(امضاء)</div>}
                    </div>

                    <div style={{ width: '25%', borderLeft: '2px solid black', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(239, 246, 255, 0.3)' }}>
                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', textAlign: 'center', paddingBottom: '3px' }}>مدیر کارخانه</div>
                        {factoryName ? <Stamp title="تایید نهایی" name={factoryName} color="green" /> : <div style={{ color: '#d1d5db', fontSize: '10px', marginTop: '8px' }}>(امضاء)</div>}
                    </div>

                    <div style={{ width: '25%', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(250, 245, 255, 0.3)' }}>
                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', textAlign: 'center', paddingBottom: '3px' }}>مدیریت عامل</div>
                        {ceoName ? <Stamp title="ملاحظه شد" name={ceoName} color="purple" /> : <div style={{ color: '#d1d5db', fontSize: '10px', marginTop: '8px' }}>(امضاء)</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrintPersonnelOvertimeForm;
