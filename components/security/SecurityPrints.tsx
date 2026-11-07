
import React from 'react';
import { SecurityLog, PersonnelDelay, SecurityIncident, DailySecurityMeta, PersonnelOvertime, DriverPayment } from '../../types';
import { formatDate } from '../../constants';
import PrintPersonnelDelayForm from './PrintPersonnelDelayForm';
import PrintPersonnelOvertimeForm from './PrintPersonnelOvertimeForm';
import { IranianPlateDisplay } from '../IranianPlate';

interface DailyLogProps {
    date: string;
    logs: SecurityLog[];
    meta?: DailySecurityMeta; 
}

export const PrintSecurityDailyLog: React.FC<DailyLogProps> = ({ date, logs, meta }) => {
    // Fill empty rows to maintain A4 structure without overflowing (13-14 rows fits comfortably)
    const displayLogs = [...logs];
    while (displayLogs.length < 14) {
        displayLogs.push({} as any);
    }

    // Extract Approver Names
    const supervisorName = logs.find(l => l.approverSupervisor)?.approverSupervisor;
    const factoryName = logs.find(l => l.approverFactory)?.approverFactory;
    const ceoName = logs.find(l => l.approverCeo)?.approverCeo;

    const Stamp = ({ title, name, color = 'blue' }: { title: string, name: string, color?: string }) => (
        <div style={{ 
            border: `2px solid ${color === 'green' ? '#166534' : color === 'purple' ? '#581c87' : '#1e40af'}`, 
            color: color === 'green' ? '#166534' : color === 'purple' ? '#581c87' : '#1e40af',
            padding: '3px 10px',
            borderRadius: '6px',
            transform: 'rotate(-4deg)',
            display: 'inline-block',
            opacity: 0.9,
            backgroundColor: 'rgba(255,255,255,0.9)'
        }}>
            <div style={{ fontSize: '8px', fontWeight: 'bold', borderBottom: '1px solid currentColor', paddingBottom: '1px', marginBottom: '1px', textAlign: 'center' }}>{title}</div>
            <div style={{ fontSize: '10px', fontWeight: '900', textAlign: 'center' }}>{name}</div>
        </div>
    );

    return (
        <div className="printable-content glass-panel text-black font-sans relative" 
            style={{ 
                // A4 Landscape fixed dims
                width: '296mm', 
                minHeight: '208mm', 
                direction: 'rtl',
                margin: '0 auto',
                boxSizing: 'border-box',
                // Internal padding to prevent cutting edges
                padding: '4mm',
            }}
        >
            <div style={{ border: '2px solid black', display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
                
                {/* 1. Header Table */}
                <div style={{ borderBottom: '2px solid black', height: '78px', display: 'flex' }}>
                    
                    {/* Right: Meta */}
                    <div style={{ width: '180px', borderLeft: '2px solid black', padding: '6px 10px', fontSize: '11px', fontWeight: 'bold', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>شماره:</span><span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>........</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>تاریخ:</span><span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{formatDate(date)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>پیوست:</span><span style={{ fontFamily: 'monospace', color: '#9ca3af' }}>........</span></div>
                    </div>

                    {/* Center: Title */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
                        <h1 style={{ fontSize: '20px', fontWeight: '900', marginBottom: '4px' }}>گروه تولیدی</h1>
                        <div style={{ border: '1.5px solid black', backgroundColor: 'white', padding: '3px 24px', borderRadius: '6px' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>فرم گزارش روزانه نگهبانی</h2>
                        </div>
                    </div>

                    {/* Left: Logo Placeholder */}
                    <div style={{ width: '180px', borderRight: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px' }}>
                        <div style={{ border: '1px dashed #9ca3af', width: '100%', height: '100%', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '12px', fontWeight: 'bold' }}>
                            محل درج لوگو
                        </div>
                    </div>
                </div>

                {/* 2. Main Data Table */}
                <div style={{ overflow: 'visible' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', textAlign: 'center', tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '32px' }} /> {/* Row */}
                            <col style={{ width: '85px' }} /> {/* Origin */}
                            <col style={{ width: '48px' }} /> {/* Entry */}
                            <col style={{ width: '48px' }} /> {/* Exit */}
                            <col style={{ width: '85px' }} /> {/* Driver */}
                            <col style={{ width: '85px' }} /> {/* Plate */}
                            <col style={{ width: '85px' }} /> {/* Permit */}
                            <col />                           {/* Goods */}
                            <col style={{ width: '50px' }} /> {/* Qty */}
                            <col style={{ width: '85px' }} /> {/* Dest */}
                            <col style={{ width: '85px' }} /> {/* Receiver */}
                            <col style={{ width: '140px' }} /> {/* Desc */}
                        </colgroup>
                        <thead>
                            <tr style={{ backgroundColor: '#e5e7eb', height: '28px' }}>
                                <th rowSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', width: '32px', textAlign: 'center' }}>ردیف</th>
                                <th rowSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', width: '85px', textAlign: 'center' }}>مبدا</th>
                                <th colSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', textAlign: 'center' }}>ساعت</th>
                                <th colSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', textAlign: 'center' }}>مشخصات خودرو / راننده</th>
                                <th rowSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', width: '85px', textAlign: 'center' }}>مجوز دهنده</th>
                                <th colSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', textAlign: 'center' }}>مشخصات کالا</th>
                                <th rowSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', width: '85px', textAlign: 'center' }}>مقصد</th>
                                <th rowSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', width: '85px', textAlign: 'center' }}>تحویل گیرنده</th>
                                <th rowSpan={2} style={{ border: '1px solid black', verticalAlign: 'middle', width: '140px', textAlign: 'center' }}>توضیحات</th>
                            </tr>
                            <tr style={{ backgroundColor: '#e5e7eb', height: '24px' }}>
                                <th style={{ border: '1px solid black', verticalAlign: 'middle', width: '48px', textAlign: 'center' }}>ورود</th>
                                <th style={{ border: '1px solid black', verticalAlign: 'middle', width: '48px', textAlign: 'center' }}>خروج</th>
                                <th style={{ border: '1px solid black', verticalAlign: 'middle', width: '85px', textAlign: 'center' }}>نام راننده</th>
                                <th style={{ border: '1px solid black', verticalAlign: 'middle', width: '85px', textAlign: 'center' }}>پلاک</th>
                                <th style={{ border: '1px solid black', verticalAlign: 'middle', textAlign: 'center' }}>نام کالا</th>
                                <th style={{ border: '1px solid black', verticalAlign: 'middle', width: '50px', textAlign: 'center' }}>تعداد</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayLogs.map((log, index) => (
                                <tr key={index} style={{ height: '24px' }}>
                                    <td style={{ border: '1px solid black', fontWeight: 'bold' }}>{log.id ? index + 1 : ''}</td>
                                    <td style={{ border: '1px solid black', fontWeight: 'bold', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.origin}</td>
                                    <td style={{ border: '1px solid black', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '10px' }}>{log.entryTime}</td>
                                    <td style={{ border: '1px solid black', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '10px' }}>{log.exitTime}</td>
                                    <td style={{ border: '1px solid black', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.driverName}</td>
                                    <td style={{ border: '1px solid black', padding: '1px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        {log.plateNumber ? (
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                                <IranianPlateDisplay value={log.plateNumber} size="nano" />
                                            </div>
                                        ) : ''}
                                    </td>
                                    <td style={{ border: '1px solid black', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.permitProvider}</td>
                                    <td style={{ border: '1px solid black', textAlign: 'right', paddingRight: '4px', fontWeight: '500', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.goodsName}</td>
                                    <td style={{ border: '1px solid black', fontFamily: 'monospace', fontWeight: 'bold' }}>{log.quantity}</td>
                                    <td style={{ border: '1px solid black', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.destination}</td>
                                    <td style={{ border: '1px solid black', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.receiver}</td>
                                    <td style={{ border: '1px solid black', textAlign: 'right', padding: '2px 4px', fontSize: '9px', lineHeight: '1.2', wordBreak: 'break-word', whiteSpace: 'normal' }}>{log.workDescription}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 3. Footer Section */}
                <div style={{ minHeight: '115px', borderTop: '2px solid black', display: 'flex', flexDirection: 'column' }}>
                    
                    {/* Shift Description */}
                    <div style={{ minHeight: '36px', borderBottom: '1px solid black', display: 'flex', alignItems: 'flex-start', backgroundColor: '#f9fafb', padding: '4px 8px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', textDecoration: 'underline', flexShrink: 0, marginLeft: '6px', marginTop: '1px' }}>توضیحات شیفت:</span>
                        <div style={{ fontSize: '10px', flex: 1, textAlign: 'right', fontWeight: '500', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                            {meta?.dailyDescription || '—'}
                        </div>
                    </div>

                    {/* Signatures */}
                    <div style={{ height: '76px', display: 'flex', fontSize: '10px' }}>
                        
                        {/* Guards */}
                        <div style={{ width: '25%', borderLeft: '1px solid black', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <span style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', paddingBottom: '2px', marginBottom: '3px' }}>نگهبانان شیفت</span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', width: '100%', height: '100%', gap: '4px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderLeft: '1px solid #e5e7eb' }}>
                                    <div style={{ color: '#6b7280', fontSize: '8px', marginBottom: 'auto' }}>صبح</div>
                                    <div style={{ fontWeight: 'bold', fontSize: '9px' }}>{meta?.morningGuard?.name}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderLeft: '1px solid #e5e7eb' }}>
                                    <div style={{ color: '#6b7280', fontSize: '8px', marginBottom: 'auto' }}>عصر</div>
                                    <div style={{ fontWeight: 'bold', fontSize: '9px' }}>{meta?.eveningGuard?.name}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                    <div style={{ color: '#6b7280', fontSize: '8px', marginBottom: 'auto' }}>شب</div>
                                    <div style={{ fontWeight: 'bold', fontSize: '9px' }}>{meta?.nightGuard?.name}</div>
                                </div>
                            </div>
                        </div>

                        {/* Supervisor */}
                        <div style={{ width: '25%', borderLeft: '1px solid black', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(254, 252, 232, 0.3)' }}>
                            <span style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', paddingBottom: '2px', textAlign: 'center' }}>سرپرست انتظامات</span>
                            {supervisorName ? <Stamp title="تایید شد" name={supervisorName} color="blue" /> : <div style={{ color: '#d1d5db', fontSize: '9px' }}>(امضاء)</div>}
                        </div>

                        {/* Factory Manager */}
                        <div style={{ width: '25%', borderLeft: '1px solid black', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(239, 246, 255, 0.3)' }}>
                            <span style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', paddingBottom: '2px', textAlign: 'center' }}>مدیر کارخانه</span>
                            {factoryName ? <Stamp title="تایید نهایی" name={factoryName} color="green" /> : <div style={{ color: '#d1d5db', fontSize: '9px' }}>(امضاء)</div>}
                        </div>

                        {/* CEO */}
                        <div style={{ width: '25%', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(250, 245, 255, 0.3)' }}>
                            <span style={{ fontWeight: 'bold', borderBottom: '1px solid #9ca3af', width: '100%', paddingBottom: '2px', textAlign: 'center' }}>مدیر عامل</span>
                            {ceoName ? <Stamp title="ملاحظه شد" name={ceoName} color="purple" /> : <div style={{ color: '#d1d5db', fontSize: '9px' }}>(امضاء)</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const PrintPersonnelDelay: React.FC<{ delays: PersonnelDelay[], meta?: DailySecurityMeta }> = ({ delays, meta }) => {
    const safeDelays = delays.length > 0 ? delays : [{ date: new Date().toISOString() } as PersonnelDelay];
    return <PrintPersonnelDelayForm delays={delays} date={safeDelays[0].date} meta={meta} />;
};

export const PrintIncidentReport: React.FC<{ incident: SecurityIncident }> = ({ incident }) => {
    // Signature component for cleaner reuse
    const SignatureBox = ({ title, name, type }: { title: string, name?: string, type?: 'supervisor' | 'manager' | 'ceo' }) => {
        let borderColor = 'black';
        let textColor = 'black';
        let label = 'امضاء';
        
        if (name) {
            if (type === 'supervisor') { borderColor = 'blue'; textColor = 'blue'; label = 'تایید شد'; }
            else if (type === 'manager') { borderColor = 'green'; textColor = 'green'; label = 'تایید اولیه'; }
            else if (type === 'ceo') { borderColor = 'purple'; textColor = 'purple'; label = 'تایید نهایی'; }
        }

        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{title}</span>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    {name ? (
                        <div style={{ 
                            border: `2px solid ${borderColor}`, 
                            color: textColor, 
                            padding: '4px 8px', 
                            borderRadius: '5px', 
                            transform: 'rotate(-3deg)',
                            fontWeight: 'bold',
                            fontSize: '10px',
                            textAlign: 'center'
                        }}>
                            <div style={{ borderBottom: `1px solid ${borderColor}`, marginBottom: '2px', fontSize: '8px' }}>{label}</div>
                            {name}
                        </div>
                    ) : (
                        <span style={{ color: '#d1d5db', fontSize: '9px' }}>........</span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="printable-content glass-panel text-black font-sans relative" 
            style={{ 
                // A4 Portrait
                width: '210mm', 
                height: '296mm', 
                direction: 'rtl', 
                margin: '0 auto',
                boxSizing: 'border-box',
                padding: '10mm',
                maxHeight: '296mm',
                overflow: 'hidden'
            }}
        >
            <div style={{ border: '3px solid black', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', borderBottom: '2px solid black', height: '100px' }}>
                    
                    {/* Right: Meta */}
                    <div style={{ width: '150px', borderLeft: '2px solid black', padding: '10px', fontSize: '12px', fontWeight: 'bold', textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '5px' }}>
                        <div>شماره: <span style={{ fontFamily: 'monospace' }}>{incident.reportNumber || '735'}</span></div>
                        <div>تاریخ: <span style={{ fontFamily: 'monospace' }}>{formatDate(incident.date)}</span></div>
                        <div>روز / تاریخ: <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{new Date(incident.date).toLocaleDateString('fa-IR', {weekday:'long'})}</span></div>
                        <div>شیفت / ساعت: <span style={{ fontFamily: 'monospace' }}>{incident.shift} / {new Date(incident.createdAt).toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'})}</span></div>
                    </div>

                    {/* Center: Title */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <h2 style={{ fontSize: '22px', fontWeight: '900', margin: '0 0 5px 0' }}>فرم گزارش واحد انتظامات</h2>
                        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#4b5563' }}>گروه تولیدی</h1>
                    </div>

                    {/* Left: Logo */}
                    <div style={{ width: '150px', borderRight: '2px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', color: '#ccc', fontWeight: 'bold' }}>
                            لوگو
                        </div>
                    </div>
                </div>

                {/* Reporter Info Row */}
                <div style={{ display: 'flex', borderBottom: '2px solid black', padding: '8px 10px', fontSize: '12px', alignItems: 'center', backgroundColor: '#f9fafb' }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 'bold' }}>گزارش کننده: </span>
                        <span style={{ fontFamily: 'Tahoma' }}>{incident.registrant}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 'bold' }}>موضوع گزارش: </span>
                        <span style={{ fontFamily: 'Tahoma' }}>{incident.subject}</span>
                    </div>
                    <div style={{ width: '150px' }}>
                        <span style={{ fontWeight: 'bold' }}>شماره گزارش: </span>
                        <span style={{ fontFamily: 'monospace' }}>{incident.reportNumber}</span>
                    </div>
                </div>

                {/* Main Body */}
                <div style={{ flex: 1, padding: '15px', position: 'relative' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '10px', textDecoration: 'underline' }}>شرح دقیق موضوع :</div>
                    <div style={{ 
                        textAlign: 'justify', 
                        lineHeight: '2.2', 
                        fontSize: '13px', 
                        whiteSpace: 'pre-wrap', 
                        backgroundImage: 'linear-gradient(to bottom, transparent 95%, #e5e7eb 95%)',
                        backgroundSize: '100% 30px',
                        minHeight: '300px'
                    }}>
                        {incident.description}
                    </div>
                </div>

                {/* Witnesses */}
                <div style={{ borderTop: '2px solid black', padding: '10px 15px', display: 'flex', alignItems: 'center', height: '60px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', width: '60px' }}>شهود :</span>
                    <div style={{ flex: 1, borderBottom: '1px dotted black', height: '30px', display: 'flex', alignItems: 'center', paddingRight: '10px', fontSize: '12px' }}>
                        {incident.witnesses || '...................................................'}
                    </div>
                    <div style={{ width: '200px', fontSize: '11px', textAlign: 'center', paddingTop: '15px' }}>
                        نام و نام خانوادگی و امضاء گزارش کننده
                    </div>
                </div>

                {/* Shift Head Opinion */}
                <div style={{ borderTop: '2px solid black', height: '50px', padding: '5px 15px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '12px' }}>نظر سر شیفت :</span>
                    <div style={{ flex: 1, marginRight: '10px', fontSize: '12px' }}>{incident.shiftManagerOpinion}</div>
                </div>

                {/* Approvals Grid - REVISED FOR 3 STAGES */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '2px solid black', height: '90px' }}>
                    
                    {/* Supervisor */}
                    <div style={{ borderLeft: '1px solid black', padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: '100%', height: '100%' }}><SignatureBox title="سرپرست انتظامات :" name={incident.approverSupervisor} type="supervisor"/></div>
                    </div>

                    {/* Manager */}
                    <div style={{ borderLeft: '1px solid black', padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(240, 253, 244, 0.3)' }}>
                        <div style={{ width: '100%', height: '100%' }}><SignatureBox title="مدیر کارخانه :" name={incident.approverFactory} type="manager"/></div>
                    </div>

                    {/* CEO */}
                    <div style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(250, 245, 255, 0.3)' }}>
                        <div style={{ width: '100%', height: '100%' }}><SignatureBox title="مدیرعامل (نهایی) :" name={incident.approverCeo} type="ceo"/></div>
                    </div>
                </div>

                {/* HR & Safety Row (Optional/Additional Info) */}
                {(incident.hrAction || incident.safetyAction) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '60px', borderTop: '1px solid black' }}>
                        <div style={{ borderLeft: '1px solid black', padding: '5px 15px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>اقدام کارگزینی :</div>
                            <div style={{ fontSize: '10px' }}>{incident.hrAction}</div>
                        </div>
                        <div style={{ padding: '5px 15px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>اقدام ایمنی و بهداشت :</div>
                            <div style={{ fontSize: '10px' }}>{incident.safetyAction}</div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export const PrintPersonnelOvertime: React.FC<{ overtimes: PersonnelOvertime[], meta?: DailySecurityMeta }> = ({ overtimes, meta }) => {
    const safeOvertimes = overtimes.length > 0 ? overtimes : [{ date: new Date().toISOString() } as PersonnelOvertime];
    return <PrintPersonnelOvertimeForm overtimes={overtimes} date={safeOvertimes[0].date} meta={meta} />;
};

export const PrintDriverPayment: React.FC<{ payment: DriverPayment }> = ({ payment }) => {
    const formattedAmount = payment.amount ? Number(payment.amount).toLocaleString('fa-IR') + ' ریال' : '—';
    const entryTime = payment.createdAt ? new Date(payment.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—';
    
    return (
        <div className="printable-content glass-panel text-black font-sans relative" 
            style={{ 
                width: '210mm', 
                minHeight: '296mm', 
                direction: 'rtl', 
                margin: '0 auto',
                boxSizing: 'border-box',
                padding: '10mm',
                backgroundColor: 'white'
            }}
        >
            <div style={{ border: '3px solid black', width: '100%', minHeight: '270mm', display: 'flex', flexDirection: 'column', padding: '15px' }}>
                {/* Header */}
                <div style={{ display: 'flex', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '15px' }}>
                    {/* Right: Meta */}
                    <div style={{ width: '180px', borderLeft: '2px solid black', paddingLeft: '10px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>تاریخ:</span><span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{payment.date || '—'}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>شماره:</span><span style={{ fontFamily: 'monospace' }}>{payment.id?.substring(0, 8) || '—'}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ساعت ورود:</span><span style={{ fontFamily: 'monospace' }}>{entryTime}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ساعت خروج:</span><span style={{ fontFamily: 'monospace' }}>—</span></div>
                    </div>
                    {/* Center: Title */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '900', margin: '0 0 5px 0' }}>فرم واریزی رانندگان</h2>
                        <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: 0, color: '#4b5563' }}>گروه تولیدی اسپان بافت</h3>
                    </div>
                    {/* Left: Logo */}
                    <div style={{ width: '180px', borderRight: '2px solid black', paddingRight: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '900', border: '2px solid black', padding: '5px 15px', borderRadius: '4px', transform: 'rotate(-2deg)' }}>اسپان بافت</div>
                    </div>
                </div>

                {/* Info Block 1 (5 Column Table as in preprinted scan) */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '11px', textAlign: 'center' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6', height: '35px' }}>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '22%' }}>مشخصات راننده</th>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '22%' }}>شماره شهربانی خودرو</th>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '18%' }}>هزینه حمل و نقل</th>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '18%' }}>جنس وارده</th>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '20%' }}>فروشنده</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ height: '55px' }}>
                            <td style={{ border: '2px solid black', fontWeight: 'bold' }}>
                                {payment.driverName || '—'}
                                {payment.driverPhone && <div style={{ fontSize: '9px', color: '#4b5563', marginTop: '4px' }}>تلفن: {payment.driverPhone}</div>}
                            </td>
                            <td style={{ border: '2px solid black', padding: '5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                    {payment.plateNumber ? <IranianPlateDisplay value={payment.plateNumber} size="sm" /> : '—'}
                                </div>
                            </td>
                            <td style={{ border: '2px solid black', fontWeight: 'bold', fontSize: '12px' }}>{formattedAmount}</td>
                            <td style={{ border: '2px solid black' }}>{payment.goodsName || '—'}</td>
                            <td style={{ border: '2px solid black' }}>{payment.permitProvider || '—'}</td>
                        </tr>
                    </tbody>
                </table>

                {/* Info Block 2 (3 Columns for Financial Details) */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px', textAlign: 'center' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f3f4f6', height: '35px' }}>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '33%' }}>شماره کارت</th>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '34%' }}>شماره شبا</th>
                            <th style={{ border: '2px solid black', fontWeight: 'bold', width: '33%' }}>شماره ملی / حساب</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ height: '50px' }}>
                            <td style={{ border: '2px solid black', fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold' }}>
                                {payment.cardNumber ? payment.cardNumber.replace(/(\d{4})/g, '$1-').replace(/-$/, '') : '—'}
                            </td>
                            <td style={{ border: '2px solid black', fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold', direction: 'ltr' }}>
                                {payment.shebaNumber ? (payment.shebaNumber.startsWith('IR') ? payment.shebaNumber : 'IR' + payment.shebaNumber) : '—'}
                            </td>
                            <td style={{ border: '2px solid black', fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold' }}>
                                {payment.accountNumber || '—'}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Route Info & Details */}
                <div style={{ border: '2px solid black', padding: '10px', fontSize: '11px', marginBottom: '20px', backgroundColor: '#fafafa', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div><strong>مسیر حمل:</strong> از {payment.origin || '—'} به {payment.destination || '—'}</div>
                        <div><strong>مقدار / تعداد:</strong> {payment.quantity || '—'}</div>
                    </div>
                    {payment.description && (
                        <div style={{ borderTop: '1px solid #ddd', paddingTop: '8px', marginTop: '4px' }}>
                            <strong>توضیحات:</strong> {payment.description}
                        </div>
                    )}
                </div>

                {/* Signature/Approval Stamps (Bottom Area) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', height: '120px', borderTop: '2.5px solid black', paddingTop: '10px' }}>
                        {/* Driver Signature */}
                        <div style={{ border: '1px solid black', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafafa' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '11px' }}>امضاء راننده</span>
                            <span style={{ color: '#ccc', fontSize: '10px' }}>اثر انگشت / امضا</span>
                        </div>

                        {/* Security Signature (Supervisor Approved) */}
                        <div style={{ border: '1px solid black', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '11px' }}>امضاء انتظامات</span>
                            {payment.supervisorApproved ? (
                                <div style={{ 
                                    border: '2px solid blue', 
                                    color: 'blue', 
                                    padding: '4px 8px', 
                                    borderRadius: '4px', 
                                    transform: 'rotate(-5deg)',
                                    fontWeight: 'bold',
                                    fontSize: '10px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ borderBottom: '1px solid blue', fontSize: '8px', paddingBottom: '2px', marginBottom: '2px' }}>تایید سرپرست</div>
                                    {payment.supervisorApproverName || 'انتظامات'}
                                </div>
                            ) : (
                                <span style={{ color: '#ccc', fontSize: '10px' }}>در انتظار تایید</span>
                            )}
                        </div>

                        {/* Accounting Signature */}
                        <div style={{ border: '1px solid black', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafafa' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '11px' }}>امضاء حسابداری</span>
                            <span style={{ color: '#ccc', fontSize: '10px' }}>بررسی و پرداخت</span>
                        </div>

                        {/* Management Signature (Factory Approved) */}
                        <div style={{ border: '1px solid black', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '11px' }}>امضاء مدیریت</span>
                            {payment.factoryApproved ? (
                                <div style={{ 
                                    border: '2px solid green', 
                                    color: 'green', 
                                    padding: '4px 8px', 
                                    borderRadius: '4px', 
                                    transform: 'rotate(-5deg)',
                                    fontWeight: 'bold',
                                    fontSize: '10px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ borderBottom: '1px solid green', fontSize: '8px', paddingBottom: '2px', marginBottom: '2px' }}>تایید و بایگانی</div>
                                    {payment.factoryApproverName || 'مدیر کارخانه'}
                                </div>
                            ) : (
                                <span style={{ color: '#ccc', fontSize: '10px' }}>در انتظار تایید</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
