import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CustomerTicket } from '../types';
import { Send, Search, UserIcon, RefreshCw, ArrowRight, MessageSquare } from 'lucide-react';
import { apiCall } from '../services/apiService';

export const Tickets: React.FC = () => {
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<CustomerTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pendingTicketIdRef = useRef<string | null>(null);

  const sortTicketsNewest = (list: CustomerTicket[]) =>
    [...list].sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

  const applyTicketSelection = useCallback((list: CustomerTicket[], targetId: string | null) => {
    if (!targetId) return;
    const match = list.find(t => String(t.id) === String(targetId));
    if (match) {
      setSelectedTicket(match);
      pendingTicketIdRef.current = null;
      try { sessionStorage.removeItem('pending_ticket_deep_link'); } catch {}
    }
  }, []);

  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const d = await apiCall<CustomerTicket[]>('/tickets');
      const sorted = sortTicketsNewest(Array.isArray(d) ? d : []);
      setTickets(sorted);
      setErrorMsg(null);
      setSelectedTicket(prev => {
        if (pendingTicketIdRef.current) {
          const deepMatch = sorted.find(t => String(t.id) === String(pendingTicketIdRef.current));
          if (deepMatch) {
            pendingTicketIdRef.current = null;
            try { sessionStorage.removeItem('pending_ticket_deep_link'); } catch {}
            return deepMatch;
          }
        }
        if (!prev) return null;
        return sorted.find(t => t.id === prev.id) || prev;
      });
    } catch (e: any) {
      setErrorMsg('خطا در دریافت تیکت‌ها از سرور.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pending_ticket_deep_link');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ticketId) pendingTicketIdRef.current = String(parsed.ticketId);
      }
    } catch {}

    fetchTickets();

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        fetchTickets(true);
      }
    }, 15000);

    const handleTicketUpdated = (e: any) => {
      if (e?.detail?.ticketId && pendingTicketIdRef.current === null && !selectedTicket) {
        // Keep current selection behavior natural; just refresh list
      }
      fetchTickets(true);
    };

    const handleRealtimeNotif = (e: any) => {
      const d = e?.detail || {};
      if (
        String(d.type || '').includes('ticket') ||
        String(d.url || '').includes('ticket') ||
        String(d.title || '').includes('تیکت')
      ) {
        fetchTickets(true);
      }
    };

    const handleOpenTicketDeepLink = (e: any) => {
      const tid = e?.detail?.ticketId ? String(e.detail.ticketId) : null;
      if (!tid) return;
      pendingTicketIdRef.current = tid;
      setTickets(prev => {
        applyTicketSelection(prev, tid);
        return prev;
      });
      fetchTickets(true);
    };

    window.addEventListener('TICKET_UPDATED_REALTIME', handleTicketUpdated);
    window.addEventListener('REALTIME_NOTIFICATION_RECEIVED', handleRealtimeNotif);
    window.addEventListener('OPEN_TICKET_RECORD', handleOpenTicketDeepLink);

    return () => {
      clearInterval(interval);
      window.removeEventListener('TICKET_UPDATED_REALTIME', handleTicketUpdated);
      window.removeEventListener('REALTIME_NOTIFICATION_RECEIVED', handleRealtimeNotif);
      window.removeEventListener('OPEN_TICKET_RECORD', handleOpenTicketDeepLink);
    };
  }, [fetchTickets, applyTicketSelection]);

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicket || sending) return;
    setSending(true);
    setErrorMsg(null);
    try {
      const data = await apiCall<CustomerTicket>(`/tickets/${selectedTicket.id}/reply`, 'POST', { text: replyText, senderName: 'پشتیبانی فروش' });
      setSelectedTicket(data);
      setTickets(prev => sortTicketsNewest(prev.map(t => t.id === data.id ? data : t)));
      setReplyText('');
    } catch (e: any) {
      setErrorMsg('خطا در ارسال پاسخ تیکت.');
    } finally {
      setSending(false);
    }
  };

  const handleStatus = async (id: string, status: 'OPEN' | 'CLOSED') => {
    try {
      const data = await apiCall<CustomerTicket>(`/tickets/${id}/status`, 'PUT', { status });
      setTickets(prev => sortTicketsNewest(prev.map(t => t.id === data.id ? data : t)));
      if (selectedTicket?.id === data.id) setSelectedTicket(data);
    } catch (e: any) {
      setErrorMsg('خطا در تغییر وضعیت تیکت.');
    }
  };

  const filtered = tickets.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(t.id || '').toLowerCase().includes(q) ||
      String(t.customerName || '').toLowerCase().includes(q) ||
      String(t.chatId || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="glass-panel p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-800 dark:text-gray-100">مدیریت تیکت‌های مشتریان</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {tickets.filter(t => t.status === 'OPEN').length} تیکت باز از {tickets.length} تیکت
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="جستجوی کد، نام..."
              className="w-full pl-8 pr-3 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 rounded-lg p-2 outline-none focus:border-blue-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <Search className="absolute left-2.5 top-2.5 text-gray-400" size={16} />
          </div>
          <button
            type="button"
            onClick={() => fetchTickets()}
            disabled={refreshing}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer disabled:opacity-50"
            title="بروزرسانی تیکت‌ها"
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-xs font-bold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="px-2">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`glass-panel p-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 h-[560px] md:h-[600px] overflow-y-auto space-y-2 ${selectedTicket ? 'hidden md:block' : 'block'}`}>
          {loading ? <div className="p-4 text-center text-sm text-gray-500">در حال بارگذاری...</div> : null}
          {!loading && filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">تیکتی یافت نشد.</div>
          ) : null}
          {filtered.map(t => (
            <div
              key={t.id}
              onClick={(e) => {
                const cur = e.currentTarget;
                setTimeout(() => cur.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
                setSelectedTicket(t);
              }}
              className={`p-3 rounded-lg cursor-pointer transition flex flex-col gap-1 border-r-4 ${
                selectedTicket?.id === t.id
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-r-blue-500'
                  : 'bg-gray-50 dark:bg-gray-900/40 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 border-r-gray-300 dark:border-r-gray-700'
              }`}
            >
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-700 dark:text-gray-200">#{t.id}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'OPEN' ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300' : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                  {t.status === 'OPEN' ? 'باز' : 'بسته'}
                </span>
              </div>
              <div className="text-xs font-bold text-gray-900 dark:text-gray-100">{t.customerName || 'مشتری نامشخص'}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{t.messages[t.messages.length - 1]?.text}</div>
            </div>
          ))}
        </div>

        <div className={`glass-panel rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 md:col-span-2 flex-col h-[560px] md:h-[600px] overflow-hidden ${selectedTicket ? 'flex' : 'hidden md:flex'}`}>
          {selectedTicket ? (
            <>
              <div className="bg-gray-50 dark:bg-gray-900/70 p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(null)}
                    className="md:hidden p-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    title="بازگشت به لیست"
                  >
                    <ArrowRight size={16} />
                  </button>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-gray-100">تیکت #{selectedTicket.id}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selectedTicket.customerName} - {selectedTicket.platform}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selectedTicket.status === 'OPEN' ? (
                    <button onClick={() => handleStatus(selectedTicket.id, 'CLOSED')} className="px-3 py-1.5 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold hover:bg-red-200 transition cursor-pointer">بستن تیکت</button>
                  ) : (
                    <button onClick={() => handleStatus(selectedTicket.id, 'OPEN')} className="px-3 py-1.5 bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold hover:bg-green-200 transition cursor-pointer">باز کردن تیکت</button>
                  )}
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {selectedTicket.messages.map(m => (
                  <div key={m.id} className={`flex ${m.sender === 'admin' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] md:max-w-[70%] p-3 rounded-xl border ${m.sender === 'admin' ? 'bg-blue-600 border-transparent rounded-tr-none text-white' : 'bg-gray-100 dark:bg-gray-800 border-gray-200/50 dark:border-white/10 rounded-tl-none text-gray-800 dark:text-gray-100'}`}>
                      <div className={`text-[10px] font-bold mb-1 ${m.sender === 'admin' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{m.sender === 'admin' ? 'شما' : 'مشتری'}</div>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed space-y-1">{m.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 md:p-4 border-t border-gray-100 dark:border-gray-800 glass-panel flex gap-2">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleReply();
                    }
                  }}
                  placeholder="پاسخ خود را بنویسید..."
                  className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 rounded-lg p-2 text-sm max-h-32 min-h-12 focus:ring-2 ring-blue-100 dark:ring-blue-900 outline-none transition"
                />
                <button
                  onClick={handleReply}
                  className="px-4 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center justify-center transition disabled:opacity-50 cursor-pointer"
                  disabled={!replyText.trim() || selectedTicket.status === 'CLOSED' || sending}
                >
                  <Send size={20} className="transform rotate-180" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col text-gray-400">
              <UserIcon size={48} className="mb-4 opacity-50" />
              <p>یک تیکت را برای مشاهده انتخاب کنید</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

