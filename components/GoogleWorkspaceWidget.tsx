import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar as CalendarIcon, CheckSquare, RefreshCw, LogIn, LogOut, 
  ExternalLink, Clock, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Link2,
  Settings, Eye, EyeOff, LayoutGrid, ListFilter, Globe, CalendarDays, Maximize2,
  ChevronRight, ChevronLeft, MapPin, Plus, Check, CalendarCheck, X, Trash2, Edit3,
  Search, Bell, FileText, DollarSign, BookOpen, Layers, Pin, Copy, Square
} from 'lucide-react';
import * as jalaali from 'jalaali-js';
import { 
  signInWithGoogleWorkspace, logoutGoogleWorkspace, getGoogleAccessToken,
  fetchGoogleCalendarEvents, fetchGoogleTasks, fetchGoogleCalendarList, GoogleCalendarEvent, GoogleTaskItem,
  createGoogleCalendarEvent, getCustomCalendarItems, saveCustomCalendarItems, syncCalendarEventsWithServer,
  CustomCalendarItem, removeGoogleTokenForUser 
} from '../services/googleWorkspaceService';
import { getNotes, saveNote, updateNote, deleteNote } from '../services/storageService';
import { updateUser } from '../services/authService';
import { User, Note } from '../types';

interface GoogleWorkspaceWidgetProps {
  currentUser?: User;
  onEventCountChange?: (count: number) => void;
  onOpenProfile?: () => void;
  onToggleDateCard?: () => void;
  isDateCardVisible?: boolean;
}

const PERSIAN_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

const GREGORIAN_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const GREGORIAN_DAYS_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PERSIAN_DAYS_FULL = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

// Standard working hours 7 AM to 10 PM
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7 to 22

interface CalendarFilter {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  category: string;
  isOther?: boolean;
}

const getDefaultCalendarFilters = (primaryName: string): CalendarFilter[] => [
  { id: 'primary', name: primaryName || 'تقویم شخصی من', color: '#039be5', enabled: true, category: 'personal' },
  { id: 'tasks', name: 'وظایف گوگل و سیستم (Tasks)', color: '#eab308', enabled: true, category: 'tasks' },
  { id: 'loans', name: 'اقساط وام و چک‌ها', color: '#1d4ed8', enabled: true, category: 'loans' },
  { id: 'reminders', name: 'رویدادها و یادداشت‌ها', color: '#10b981', enabled: true, category: 'reminders' },
  { id: 'holidays', name: 'تعطیلات رسمی ایران (Holidays)', color: '#059669', enabled: true, category: 'holidays', isOther: true },
];

export const GoogleWorkspaceWidget: React.FC<GoogleWorkspaceWidgetProps> = ({ 
  currentUser, 
  onEventCountChange, 
  onOpenProfile,
  onToggleDateCard,
  isDateCardVisible = true
}) => {
  const currentUserId = currentUser?.id ? String(currentUser.id) : undefined;
  const userDisplayName = currentUser?.fullName || currentUser?.username || 'تقویم شخصی';
  const primaryCalendarName = currentUser?.googleLinkedEmail || userDisplayName;

  const [token, setToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [currentView, setCurrentView] = useState<'week' | 'month' | 'day' | 'agenda'>('week');
  
  // Real Google Calendar events & Tasks strictly for active user
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleTasks, setGoogleTasks] = useState<GoogleTaskItem[]>([]);
  
  // Custom user items strictly isolated per user ID
  const [customItems, setCustomItems] = useState<CustomCalendarItem[]>(() => {
    return getCustomCalendarItems(currentUserId);
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // Active viewing date (defaults to current date e.g. Sep 16, 2026)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Quick Event/Note Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDate, setModalDate] = useState('');
  const [modalStartHour, setModalStartHour] = useState(9);
  const [modalDuration, setModalDuration] = useState(1);
  const [modalCategory, setModalCategory] = useState<'personal' | 'tasks' | 'loans' | 'reminders' | 'english' | 'holidays' | 'other'>('loans');
  const [modalColor, setModalColor] = useState('#3b82f6');
  const [modalDescription, setModalDescription] = useState('');
  const [syncToGoogle, setSyncToGoogle] = useState(true);
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  // System Notes & Agenda states
  const [systemNotes, setSystemNotes] = useState<Note[]>([]);
  const [notesSearch, setNotesSearch] = useState('');
  const [notesCategoryFilter, setNotesCategoryFilter] = useState<'all' | 'notes' | 'loans' | 'tasks'>('all');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteDate, setNewNoteDate] = useState('');
  const [newNoteColor, setNewNoteColor] = useState('#10b981');
  const [newNoteTasks, setNewNoteTasks] = useState<string[]>([]);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);

  // Selected event popover
  const [selectedItem, setSelectedItem] = useState<{
    id: string;
    title: string;
    timeStr: string;
    dateStr: string;
    shamsiDateStr: string;
    color: string;
    category?: string;
    description?: string;
    isGoogle?: boolean;
    googleLink?: string;
  } | null>(null);

  // Collapsed state
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gw_widget_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Calendar Category Toggles (My Calendars & Other Calendars isolated per user)
  const [calendarFilters, setCalendarFilters] = useState<CalendarFilter[]>(() => {
    if (currentUserId) {
      try {
        const saved = localStorage.getItem(`gw_filters_${currentUserId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // If legacy mock filters exist (lepan, hengam, lian), purge them
            const hasLegacy = parsed.some((f: any) => f.id === 'lepan' || f.id === 'hengam' || f.id === 'lian' || f.id === 'english');
            if (hasLegacy) {
              localStorage.removeItem(`gw_filters_${currentUserId}`);
            } else {
              return parsed.map((f: CalendarFilter) => f.id === 'primary' ? { ...f, name: primaryCalendarName } : f);
            }
          }
        }
      } catch {}
    }
    return getDefaultCalendarFilters(primaryCalendarName);
  });

  // Update current time tick every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Save custom items strictly for active user
  const handleSaveCustomItems = (items: CustomCalendarItem[]) => {
    setCustomItems(items);
    saveCustomCalendarItems(items, currentUserId);
  };

  // Sync token state on mount & user change
  const checkTokenAndLoad = async (targetUid?: string) => {
    const uid = targetUid || currentUserId;
    if (!uid) {
      setToken(null);
      setGoogleEvents([]);
      setGoogleTasks([]);
      return;
    }
    const cached = await getGoogleAccessToken(uid);
    if (cached) {
      setToken(cached);
      loadGoogleData(cached, uid);
    } else {
      setToken(null);
      setGoogleEvents([]);
      setGoogleTasks([]);
    }
  };

  // Re-sync all user-specific calendar data whenever the logged-in user changes
  useEffect(() => {
    // 1. Reload isolated custom items for this user
    setCustomItems(getCustomCalendarItems(currentUserId));

    // 2. Reload isolated calendar filters for this user
    let userFilters: CalendarFilter[] = getDefaultCalendarFilters(primaryCalendarName);
    if (currentUserId) {
      try {
        const saved = localStorage.getItem(`gw_filters_${currentUserId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasLegacy = parsed.some((f: any) => f.id === 'lepan' || f.id === 'hengam' || f.id === 'lian' || f.id === 'english');
            if (hasLegacy) {
              localStorage.removeItem(`gw_filters_${currentUserId}`);
            } else {
              userFilters = parsed.map((f: CalendarFilter) => f.id === 'primary' ? { ...f, name: primaryCalendarName } : f);
            }
          }
        }
      } catch {}
    }
    setCalendarFilters(userFilters);

    // 3. Reset temporary modals and errors
    setError(null);
    setSelectedItem(null);
    setShowAddModal(false);

    // 4. Load Google token and calendar events for this user
    checkTokenAndLoad(currentUserId);

    // 5. Load System Notes & Server Events
    loadSystemNotes();
    syncCalendarEventsWithServer(currentUserId).then(items => {
      if (items && items.length > 0) {
        setCustomItems(items);
      }
    });

    const handleNotesUpdate = () => {
      loadSystemNotes();
    };

    const handleAuthSync = (e: any) => {
      // Strictly prevent cross-user token contamination
      if (e?.detail?.userId && currentUserId && String(e.detail.userId) !== currentUserId) {
        return;
      }
      if (e?.detail?.token) {
        setToken(e.detail.token);
        loadGoogleData(e.detail.token, currentUserId);
      } else if (e?.detail?.action === 'logout') {
        setToken(null);
        setGoogleEvents([]);
        setGoogleTasks([]);
      } else {
        checkTokenAndLoad(currentUserId);
      }
    };

    const handleCustomUpdate = (e: any) => {
      // Strictly prevent cross-user event contamination
      if (e?.detail?.userId && currentUserId && String(e.detail.userId) !== currentUserId) {
        return;
      }
      if (e?.detail?.items) {
        setCustomItems(e.detail.items);
      }
    };

    window.addEventListener('google-auth-sync', handleAuthSync);
    window.addEventListener('custom-calendar-events-updated', handleCustomUpdate);
    window.addEventListener('notes-updated', handleNotesUpdate);
    window.addEventListener('REFRESH_UI', handleNotesUpdate);

    return () => {
      window.removeEventListener('google-auth-sync', handleAuthSync);
      window.removeEventListener('custom-calendar-events-updated', handleCustomUpdate);
      window.removeEventListener('notes-updated', handleNotesUpdate);
      window.removeEventListener('REFRESH_UI', handleNotesUpdate);
    };
  }, [currentUserId, currentUser?.googleLinkedEmail]);

  const loadSystemNotes = async () => {
    try {
      const all = await getNotes();
      if (Array.isArray(all)) {
        const userNotes = all.filter(n => n && (!n.userId || String(n.userId) === String(currentUserId)));
        setSystemNotes(userNotes);
      }
    } catch (e) {
      console.debug('Failed to load notes in widget', e);
    }
  };

  const loadGoogleData = async (tok: string, forUserId?: string) => {
    // Abort if target user is no longer active
    if (forUserId && currentUserId && forUserId !== currentUserId) return;

    setIsLoading(true);
    setError(null);
    try {
      const [calEvents, taskItems, calList] = await Promise.allSettled([
        fetchGoogleCalendarEvents(tok),
        fetchGoogleTasks(tok),
        fetchGoogleCalendarList(tok)
      ]);

      let isExpired = false;
      if (calEvents.status === 'fulfilled') {
        setGoogleEvents(calEvents.value);
        if (onEventCountChange) onEventCountChange(calEvents.value.length);
      } else {
        const reason = calEvents.reason?.message || String(calEvents.reason);
        if (reason.includes('401') || reason.includes('403') || reason.includes('Unauthorized')) {
          isExpired = true;
        }
      }

      if (taskItems.status === 'fulfilled') {
        setGoogleTasks(taskItems.value);
      }

      // If user has real Google Calendars, dynamically map them to sidebar filters
      if (calList.status === 'fulfilled' && calList.value && calList.value.length > 0) {
        const dynamicFilters: CalendarFilter[] = calList.value.map((cal, idx) => ({
          id: cal.id,
          name: cal.summary || (cal.primary ? primaryCalendarName : `تقویم ${idx + 1}`),
          color: cal.backgroundColor || (cal.primary ? '#039be5' : '#8b5cf6'),
          enabled: true,
          category: cal.primary ? 'personal' : 'other',
          isOther: !cal.primary
        }));

        dynamicFilters.push(
          { id: 'tasks', name: 'وظایف گوگل و سیستم (Tasks)', color: '#eab308', enabled: true, category: 'tasks' },
          { id: 'loans', name: 'اقساط وام و چک‌ها', color: '#1d4ed8', enabled: true, category: 'loans' },
          { id: 'reminders', name: 'رویدادها و یادداشت‌ها', color: '#10b981', enabled: true, category: 'reminders' }
        );

        setCalendarFilters(dynamicFilters);
        if (currentUserId) {
          try {
            localStorage.setItem(`gw_filters_${currentUserId}`, JSON.stringify(dynamicFilters));
          } catch {}
        }
      }

      if (isExpired) {
        setToken(null);
        removeGoogleTokenForUser(currentUserId);
        setError('نشست حساب گوگل منقضی شده است. جهت اتصال مجدد کلیک کنید.');
      }
    } catch (err: any) {
      setError(err?.message || 'خطا در بارگیری اطلاعات تقویم گوگل');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (forceAccountSelection: boolean = true) => {
    setIsSigningIn(true);
    setError(null);
    try {
      const result = await signInWithGoogleWorkspace(currentUserId, { forceAccountSelection });
      if (result?.accessToken) {
        setToken(result.accessToken);
        await loadGoogleData(result.accessToken, currentUserId);
        if (currentUser && result.user?.email) {
          try {
            await updateUser({
              ...currentUser,
              googleLinkedEmail: result.user.email,
              googleLinkedAt: Date.now()
            });
          } catch (e) {
            console.debug('Failed to update user profile', e);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'اتصال به حساب گوگل برقرار نشد');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('آیا از قطع اتصال حساب گوگل اطمینان دارید؟')) return;
    await logoutGoogleWorkspace(currentUserId);
    setToken(null);
    setGoogleEvents([]);
    setGoogleTasks([]);
    const defaultFilters = getDefaultCalendarFilters(userDisplayName);
    setCalendarFilters(defaultFilters);
    if (currentUserId) {
      try {
        localStorage.removeItem(`gw_filters_${currentUserId}`);
      } catch {}
    }
    if (currentUser) {
      try {
        await updateUser({
          ...currentUser,
          googleLinkedEmail: '',
          googleLinkedAt: undefined
        });
      } catch (e) {
        console.debug('Failed to update user profile on disconnect', e);
      }
    }
  };

  const toggleCalendarFilter = (id: string) => {
    setCalendarFilters(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f);
      if (currentUserId) {
        try {
          localStorage.setItem(`gw_filters_${currentUserId}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
  };

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('gw_widget_collapsed', String(next)); } catch {}
      return next;
    });
  };

  // Helper: Get Sunday-to-Saturday days for the week containing `currentDate`
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Start on Sunday
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + i);

      const j = jalaali.toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
      const isToday = (
        date.getFullYear() === new Date().getFullYear() &&
        date.getMonth() === new Date().getMonth() &&
        date.getDate() === new Date().getDate()
      );

      const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      // Formatted Shamsi date string like in user image: "یکشنبه ۲۲ شهریور ۱۴۰۵"
      const shamsiRibbonText = `${PERSIAN_DAYS_FULL[i]} ${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${j.jy}`;

      days.push({
        date,
        isoDate,
        dayNumber: date.getDate(),
        dayNameShort: GREGORIAN_DAYS_SHORT[i],
        jalaali: j,
        shamsiRibbonText,
        isToday,
        dayIndex: i
      });
    }
    return days;
  }, [currentDate]);

  // Helper: Get Month grid days for the month containing `currentDate`
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDay = firstDay.getDay(); // 0 = Sunday
    const totalDays = lastDay.getDate();

    const days = [];
    const todayIso = new Date().toISOString().split('T')[0];

    // Leading days from previous month
    for (let i = 0; i < startingDay; i++) {
      const prevDate = new Date(year, month, 1 - (startingDay - i));
      const j = jalaali.toJalaali(prevDate.getFullYear(), prevDate.getMonth() + 1, prevDate.getDate());
      days.push({
        date: prevDate,
        dayNumber: prevDate.getDate(),
        isoDate: `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`,
        jalaali: j,
        shamsiDayStr: `${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]}`,
        isCurrentMonth: false,
        isToday: false
      });
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const j = jalaali.toJalaali(year, month + 1, day);
      days.push({
        date,
        dayNumber: day,
        isoDate,
        jalaali: j,
        shamsiDayStr: `${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]}`,
        isCurrentMonth: true,
        isToday: isoDate === todayIso
      });
    }

    // Trailing days to fill the 7-column grid
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const j = jalaali.toJalaali(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
      days.push({
        date: nextDate,
        dayNumber: nextDate.getDate(),
        isoDate: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`,
        jalaali: j,
        shamsiDayStr: `${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]}`,
        isCurrentMonth: false,
        isToday: false
      });
    }

    return days;
  }, [currentDate]);

  // Current header title (e.g. "September 2026 / شهریور ۱۴۰۵")
  const currentHeaderTitle = useMemo(() => {
    const gMonth = GREGORIAN_MONTH_NAMES[currentDate.getMonth()];
    const gYear = currentDate.getFullYear();
    const j = jalaali.toJalaali(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
    return {
      gregorian: `${gMonth} ${gYear}`,
      shamsi: `${PERSIAN_MONTH_NAMES[j.jm - 1]} ${j.jy}`
    };
  }, [currentDate]);

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (currentView === 'week') d.setDate(d.getDate() - 7);
    else if (currentView === 'month' || currentView === 'agenda') d.setMonth(d.getMonth() - 1);
    else if (currentView === 'day') d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (currentView === 'week') d.setDate(d.getDate() + 7);
    else if (currentView === 'month' || currentView === 'agenda') d.setMonth(d.getMonth() + 1);
    else if (currentView === 'day') d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Helper to normalize any date string (Gregorian or Shamsi) to standard YYYY-MM-DD
  const normalizeToIsoDate = (dStr?: string): string => {
    if (!dStr) return '';
    const clean = dStr.split('T')[0].trim().replace(/\//g, '-');
    const parts = clean.split('-').map(Number);
    if (parts.length === 3) {
      // Check if Shamsi year (1300 to 1500)
      if (parts[0] >= 1300 && parts[0] <= 1500) {
        try {
          const g = jalaali.toGregorian(parts[0], parts[1], parts[2]);
          return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
        } catch {}
      }
      return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    }
    return clean;
  };

  // Combined Active Events & Notes
  const allEventsForWeek = useMemo(() => {
    const enabledCategories = new Set(calendarFilters.filter(f => f.enabled).map(f => f.category));
    const isGoogleEnabled = calendarFilters.some(f => (f.category === 'personal' || f.id === 'primary' || f.id.includes('@')) && f.enabled);

    const list: Array<{
      id: string;
      title: string;
      isoDate: string;
      startHour: number;
      durationHours: number;
      color: string;
      category: string;
      description?: string;
      isGoogle?: boolean;
      googleLink?: string;
    }> = [];

    // 1. Custom items (loans, reminders, tasks, notes, etc.)
    customItems.forEach(item => {
      const cat = item.category || 'reminders';
      const isEnabled = enabledCategories.has(cat) || 
        (cat === 'english' && enabledCategories.has('reminders')) ||
        (cat === 'personal' && isGoogleEnabled) ||
        (cat === 'loans' && enabledCategories.has('loans')) ||
        enabledCategories.has('reminders');

      if (isEnabled) {
        const iso = normalizeToIsoDate(item.startDate);
        list.push({
          id: item.id,
          title: item.title,
          isoDate: iso,
          startHour: item.startHour ?? 9,
          durationHours: item.durationHours ?? 1,
          color: item.color || (cat === 'loans' ? '#1d4ed8' : '#3b82f6'),
          category: cat,
          description: item.description
        });
      }
    });

    // 2. Google Calendar items
    if (isGoogleEnabled && googleEvents.length > 0) {
      googleEvents.forEach(ev => {
        const startRaw = ev.start.dateTime || ev.start.date;
        if (!startRaw) return;
        const d = new Date(startRaw);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const startHour = ev.start.dateTime ? (d.getHours() + d.getMinutes() / 60) : 8;
        
        let duration = 1;
        if (ev.end?.dateTime && ev.start?.dateTime) {
          const endD = new Date(ev.end.dateTime);
          duration = Math.max(0.5, (endD.getTime() - d.getTime()) / (1000 * 60 * 60));
        }

        list.push({
          id: `g_${ev.id}`,
          title: ev.summary || 'بدون عنوان',
          isoDate: iso,
          startHour,
          durationHours: duration,
          color: '#0284c7', // Sky blue for Google events
          category: 'personal',
          description: ev.description || ev.location,
          isGoogle: true,
          googleLink: ev.htmlLink
        });
      });
    }

    // 3. Google Tasks (when tasks category is enabled)
    if (enabledCategories.has('tasks') && googleTasks.length > 0) {
      googleTasks.forEach((task, idx) => {
        if (!task.due) return;
        const iso = normalizeToIsoDate(task.due);
        list.push({
          id: `gtask_${task.id || idx}`,
          title: `✔ ${task.title || 'وظیفه گوگل'}`,
          isoDate: iso,
          startHour: 9 + (idx % 5),
          durationHours: 1,
          color: '#eab308',
          category: 'tasks',
          description: task.notes || 'وظیفه ثبت شده در Google Tasks',
          isGoogle: true
        });
      });
    }

    // 4. System Notes (یادداشت‌های کاربر و یادآوری‌ها)
    if (enabledCategories.has('reminders')) {
      systemNotes.forEach(note => {
        let iso = '';
        let startHour = 9;
        if (note.reminderTime) {
          const d = new Date(note.reminderTime);
          if (!isNaN(d.getTime())) {
            iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            startHour = d.getHours() + d.getMinutes() / 60;
          }
        } else if (note.createdAt) {
          const d = new Date(note.createdAt);
          if (!isNaN(d.getTime())) {
            iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            startHour = 9;
          }
        }

        if (iso) {
          list.push({
            id: note.id,
            title: note.title || 'یادداشت',
            isoDate: iso,
            startHour: Math.max(7, Math.min(21, startHour)),
            durationHours: 1,
            color: note.color || '#10b981',
            category: 'reminders',
            description: note.content || '',
            isGoogle: false
          });
        }
      });
    }

    return list;
  }, [customItems, googleEvents, googleTasks, calendarFilters, systemNotes]);

  // Open Quick Add Modal
  const openQuickAdd = (isoDate?: string, startHour?: number) => {
    const targetDate = isoDate || weekDays[3].isoDate;
    setModalDate(targetDate);
    setModalStartHour(startHour ?? 9);
    setModalDuration(1);
    setModalTitle('');
    setModalDescription('');
    setModalCategory('loans');
    setModalColor('#3b82f6');
    setShowAddModal(true);
  };

  // Submit Quick Add Event / Note / Loan Installment
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim()) return;

    setIsSavingEvent(true);
    try {
      const newItem: CustomCalendarItem = {
        id: `item_${Date.now()}`,
        title: modalTitle.trim(),
        category: modalCategory,
        color: modalColor,
        startDate: modalDate,
        startHour: Number(modalStartHour),
        durationHours: Number(modalDuration),
        description: modalDescription.trim()
      };

      // If user enabled sync with Google Calendar and token exists
      if (syncToGoogle && token) {
        try {
          const [y, m, d] = modalDate.split('-').map(Number);
          const startD = new Date(y, m - 1, d, Math.floor(modalStartHour), (modalStartHour % 1) * 60);
          const endD = new Date(startD.getTime() + modalDuration * 60 * 60 * 1000);

          const gRes = await createGoogleCalendarEvent(token, {
            summary: modalTitle.trim(),
            description: modalDescription.trim(),
            start: { dateTime: startD.toISOString(), timeZone: 'Asia/Tehran' },
            end: { dateTime: endD.toISOString(), timeZone: 'Asia/Tehran' }
          });
          newItem.googleEventId = gRes.id;
          newItem.syncedWithGoogle = true;
          // Refresh Google events
          loadGoogleData(token);
        } catch (gErr) {
          console.warn('Could not sync to Google Calendar API directly', gErr);
        }
      }

      // If category is reminder / note, also persist as Note
      if (modalCategory === 'reminders') {
        try {
          const newNote: Note = {
            id: newItem.id,
            userId: currentUserId || '',
            title: modalTitle.trim(),
            content: modalDescription.trim(),
            color: modalColor,
            reminderTime: new Date(modalDate).getTime(),
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          await saveNote(newNote);
          setSystemNotes(prev => [newNote, ...prev]);
        } catch (nErr) {
          console.debug('Failed to sync to system notes', nErr);
        }
      }

      handleSaveCustomItems([newItem, ...customItems]);
      setShowAddModal(false);
      setModalTitle('');
    } catch (err: any) {
      alert('خطا در ذخیره‌سازی رویداد: ' + err?.message);
    } finally {
      setIsSavingEvent(false);
    }
  };

  // Delete an item
  const handleDeleteItem = async (id: string) => {
    if (!confirm('آیا از حذف این یادداشت/رویداد اطمینان دارید؟')) return;
    if (id.startsWith('note_')) {
      try {
        await deleteNote(id);
        setSystemNotes(prev => prev.filter(n => n.id !== id));
      } catch (e) {
        console.error('Failed to delete note', e);
      }
    }
    const filtered = customItems.filter(item => item.id !== id);
    handleSaveCustomItems(filtered);
    setSelectedItem(null);
  };

  // Save / Update System Note
  const handleSaveSystemNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim() && !newNoteContent.trim()) return;

    try {
      const noteDate = newNoteDate ? new Date(newNoteDate).getTime() : Date.now();
      const taskObjects = newNoteTasks.filter(t => t.trim()).map((t, idx) => ({
        id: `task_${Date.now()}_${idx}`,
        text: t.trim(),
        isCompleted: false
      }));

      if (editingNote) {
        const updated: Note = {
          ...editingNote,
          title: newNoteTitle.trim() || 'یادداشت',
          content: newNoteContent.trim(),
          color: newNoteColor,
          reminderTime: noteDate,
          tasks: taskObjects.length > 0 ? taskObjects : editingNote.tasks,
          updatedAt: Date.now()
        };
        await updateNote(updated);
        setSystemNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      } else {
        const newNote: Note = {
          id: `note_${Date.now()}`,
          userId: currentUserId || '',
          title: newNoteTitle.trim() || 'یادداشت جدید',
          content: newNoteContent.trim(),
          color: newNoteColor,
          reminderTime: noteDate,
          tasks: taskObjects,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await saveNote(newNote);
        setSystemNotes(prev => [newNote, ...prev]);

        // Also add to customItems for calendar time slot
        const iso = newNoteDate || new Date().toISOString().split('T')[0];
        const calItem: CustomCalendarItem = {
          id: newNote.id,
          title: newNote.title,
          category: 'reminders',
          color: newNote.color || '#10b981',
          startDate: iso,
          startHour: 9,
          durationHours: 1,
          description: newNote.content
        };
        handleSaveCustomItems([calItem, ...customItems]);
      }

      setShowNewNoteModal(false);
      setEditingNote(null);
      setNewNoteTitle('');
      setNewNoteContent('');
      setNewNoteDate('');
      setNewNoteTasks([]);
      setNewTaskInput('');
    } catch (err: any) {
      alert('خطا در ثبت یادداشت: ' + err?.message);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm('آیا از حذف این یادداشت اطمینان دارید؟')) return;
    try {
      await deleteNote(id);
      setSystemNotes(prev => prev.filter(n => n.id !== id));
      const filtered = customItems.filter(item => item.id !== id);
      handleSaveCustomItems(filtered);
      if (selectedItem?.id === id) setSelectedItem(null);
    } catch (e) {
      console.error('Failed to delete note', e);
    }
  };

  const handleToggleNoteTask = async (noteId: string, taskId: string) => {
    const note = systemNotes.find(n => n.id === noteId);
    if (!note || !note.tasks) return;
    const updatedTasks = note.tasks.map(t => t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t);
    const updatedNote = { ...note, tasks: updatedTasks, updatedAt: Date.now() };
    setSystemNotes(prev => prev.map(n => n.id === noteId ? updatedNote : n));
    try {
      await updateNote(updatedNote);
    } catch (e) {
      console.error('Failed to update note task', e);
    }
  };

  const handleToggleNotePin = async (noteId: string) => {
    const note = systemNotes.find(n => n.id === noteId);
    if (!note) return;
    const updatedNote = { ...note, isPinned: !note.isPinned, updatedAt: Date.now() };
    setSystemNotes(prev => prev.map(n => n.id === noteId ? updatedNote : n));
    try {
      await updateNote(updatedNote);
    } catch (e) {
      console.error('Failed to update note pin', e);
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setNewNoteTitle(note.title);
    setNewNoteContent(note.content || '');
    setNewNoteColor(note.color || '#10b981');
    if (note.reminderTime) {
      const d = new Date(note.reminderTime);
      setNewNoteDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    } else {
      setNewNoteDate('');
    }
    setNewNoteTasks((note.tasks || []).map(t => t.text));
    setShowNewNoteModal(true);
  };

  // Today summary for collapsed banner
  const todayShamsi = useMemo(() => {
    const now = new Date();
    const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const dayOfWeek = now.getDay();
    return `${PERSIAN_DAYS_FULL[dayOfWeek]} ${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${j.jy}`;
  }, []);

  const todayNotesCount = useMemo(() => {
    const todayIso = new Date().toISOString().split('T')[0];
    return allEventsForWeek.filter(e => e.isoDate === todayIso).length;
  }, [allEventsForWeek]);

  // Filtered system notes for Agenda view
  const filteredSystemNotes = useMemo(() => {
    let list = [...systemNotes];
    if (notesSearch.trim()) {
      const q = notesSearch.trim().toLowerCase();
      list = list.filter(n => 
        (n.title && n.title.toLowerCase().includes(q)) || 
        (n.content && n.content.toLowerCase().includes(q)) ||
        (n.tasks && n.tasks.some(t => t.text.toLowerCase().includes(q)))
      );
    }
    // Sort: pinned first, then latest
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });
    return list;
  }, [systemNotes, notesSearch]);

  // Filtered timeline of events and tasks for Agenda view
  const filteredAgendaTimeline = useMemo(() => {
    let list = allEventsForWeek.map(ev => {
      const parts = ev.isoDate.split('-').map(Number);
      let shamsiDateStr = '';
      if (parts.length === 3) {
        try {
          const j = jalaali.toJalaali(parts[0], parts[1], parts[2]);
          shamsiDateStr = `${j.jd} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${j.jy}`;
        } catch {}
      }
      return { ...ev, shamsiDateStr };
    });

    if (notesSearch.trim()) {
      const q = notesSearch.trim().toLowerCase();
      list = list.filter(e => (e.title && e.title.toLowerCase().includes(q)) || (e.description && e.description.toLowerCase().includes(q)));
    }

    if (notesCategoryFilter === 'loans') {
      list = list.filter(e => e.category === 'loans');
    } else if (notesCategoryFilter === 'tasks') {
      list = list.filter(e => e.category === 'tasks');
    }

    list.sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.startHour - b.startHour);
    return list;
  }, [allEventsForWeek, notesSearch, notesCategoryFilter]);

  return (
    <div className="glass-panel rounded-2xl border border-gray-200/90 dark:border-zinc-800 p-2.5 sm:p-4 shadow-md relative overflow-hidden transition-all bg-white dark:bg-zinc-950 font-sans">
      
      {/* 1. TOP HEADER (GOOGLE CALENDAR TOOLBAR) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-gray-200 dark:border-zinc-800">
        
        {/* Left Side: Logo, Today Button, Arrows, Title */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
          
          {/* Calendar App Brand */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-blue-500/30">
              <span>16</span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-1.5">
              <span>Calendar</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900">
                تقویم گوگل و یادداشت‌ها
              </span>
            </h2>
          </div>

          <div className="h-5 w-px bg-gray-300 dark:bg-zinc-700 hidden sm:block" />

          {/* Today Button & Navigation */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToday}
              className="px-3 py-1 rounded-lg border border-gray-300 dark:border-zinc-700 hover:bg-gray-100 dark:hover:bg-zinc-800 text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors cursor-pointer shadow-2xs"
            >
              Today (امروز)
            </button>

            <div className="flex items-center">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                title="قبلی"
              >
                <ChevronRight size={17} />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-colors cursor-pointer"
                title="بعدی"
              >
                <ChevronLeft size={17} />
              </button>
            </div>

            {/* Month & Year Title Display */}
            <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-gray-800 dark:text-gray-100 mr-1">
              <span>{currentHeaderTitle.gregorian}</span>
              <span className="text-gray-400 font-normal">/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">{currentHeaderTitle.shamsi}</span>
            </div>
          </div>
        </div>

        {/* Right Side: View Selector, Search, Google Connect & Action Controls */}
        <div className="flex items-center gap-2 self-end md:self-center flex-wrap shrink-0">
          
          {/* Create Event Button */}
          <button
            onClick={() => openQuickAdd()}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>ثبت رویداد / قسط وام</span>
          </button>

          {/* Add Note Button */}
          <button
            onClick={() => {
              setEditingNote(null);
              setNewNoteTitle('');
              setNewNoteContent('');
              setNewNoteDate(new Date().toISOString().split('T')[0]);
              setNewNoteColor('#10b981');
              setNewNoteTasks([]);
              setNewTaskInput('');
              setShowNewNoteModal(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
            title="ثبت سریع یادداشت یا چک‌لیست جدید"
          >
            <Edit3 size={14} />
            <span>ثبت یادداشت</span>
          </button>

          {/* View Dropdown */}
          <div className="flex items-center bg-gray-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-gray-200 dark:border-zinc-700">
            <button
              onClick={() => setCurrentView('week')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                currentView === 'week'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Week (هفتگی)
            </button>
            <button
              onClick={() => setCurrentView('month')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                currentView === 'month'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Month (ماهانه)
            </button>
            <button
              onClick={() => setCurrentView('agenda')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                currentView === 'agenda'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Agenda (یادداشت‌ها)
            </button>
          </div>

          {/* Google Sync Status / Button */}
          {!token ? (
            <button
              onClick={() => handleConnect(true)}
              disabled={isSigningIn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all cursor-pointer shadow-2xs"
              title={`اتصال حساب گوگل مجزا برای کاربر: ${userDisplayName}`}
            >
              <RefreshCw size={13} className={isSigningIn ? 'animate-spin' : ''} />
              <span>{isSigningIn ? 'در حال اتصال...' : 'اتصال به حساب گوگل'}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 pl-1 pr-2.5 py-1 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span 
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 max-w-[130px] truncate dir-ltr" 
                title={`حساب گوگل متصل برای ${userDisplayName}: ${currentUser?.googleLinkedEmail || userDisplayName}`}
              >
                {currentUser?.googleLinkedEmail ? currentUser.googleLinkedEmail.split('@')[0] : 'گوگل متصل'}
              </span>
              <button
                onClick={() => handleConnect(true)}
                disabled={isSigningIn}
                className="px-2 py-0.5 rounded-lg bg-white/80 dark:bg-zinc-800 text-[10px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer border border-gray-200 dark:border-zinc-700 shrink-0"
                title="تغییر یا اتصال حساب دیگر گوگل برای این کاربر"
              >
                تغییر حساب
              </button>
              <button
                onClick={() => loadGoogleData(token, currentUserId)}
                disabled={isLoading}
                className="p-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer"
                title="بروزرسانی تقویم گوگل"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin text-emerald-600' : ''} />
              </button>
              <button
                onClick={handleDisconnect}
                className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/60 text-rose-500 transition-colors cursor-pointer"
                title="قطع اتصال حساب گوگل این کاربر"
              >
                <LogOut size={12} />
              </button>
            </div>
          )}

          {/* Toggle Top Simple Date Card in Dashboard */}
          {onToggleDateCard && (
            <button
              onClick={onToggleDateCard}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all border ${
                isDateCardVisible 
                  ? 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300 border-gray-200 dark:border-zinc-700' 
                  : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200'
              }`}
              title={isDateCardVisible ? 'مخفی‌سازی کارت تقویم ساده بالای صفحه' : 'نمایش کارت تقویم ساده بالای صفحه'}
            >
              {isDateCardVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}

          {/* Minimize / Expand Widget */}
          <button
            onClick={toggleCollapse}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-300 rounded-lg transition-colors cursor-pointer"
            title={isCollapsed ? 'بزرگ‌نمایی تقویم' : 'کوچک‌نمایی'}
          >
            {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </div>

      {/* COLLAPSED SUMMARY VIEW */}
      {isCollapsed ? (
        <div className="py-2 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span className="bg-red-600 text-white font-black px-3 py-1 rounded-lg text-xs shadow-sm">
              {todayShamsi}
            </span>
            <span className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">
              ({new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-700 dark:text-gray-300 font-bold">
              {todayNotesCount > 0 ? `🔔 ${todayNotesCount} رویداد و یادداشت برای امروز ثبت شده است` : 'امروز رویداد خاصی ثبت نشده است'}
            </span>
            <button
              onClick={toggleCollapse}
              className="text-blue-600 hover:underline font-bold text-xs mr-2"
            >
              مشاهده کامل تقویم هفتگی
            </button>
          </div>
        </div>
      ) : (
        
        /* 2. MAIN EXPANDED GOOGLE CALENDAR LAYOUT */
        <div className="mt-3 flex flex-col lg:flex-row gap-3">
          
          {/* LEFT SIDEBAR: Mini Month Picker & Calendar Filters (Matching Google Calendar Image) */}
          {showSidebar && (
            <div className="w-full lg:w-60 xl:w-64 shrink-0 space-y-4 border-b lg:border-b-0 lg:border-l border-gray-200 dark:border-zinc-800 pl-0 lg:pl-3 pb-3 lg:pb-0">
              
              {/* Mini Calendar Month Picker */}
              <div className="bg-gray-50/80 dark:bg-zinc-900/80 rounded-xl p-3 border border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-gray-800 dark:text-gray-200">
                    {currentHeaderTitle.gregorian}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={handlePrev} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded">
                      <ChevronRight size={14} />
                    </button>
                    <button onClick={handleNext} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded">
                      <ChevronLeft size={14} />
                    </button>
                  </div>
                </div>

                {/* Weekday abbreviations */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
                  <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                </div>

                {/* Days of Current Week Highlighted */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {weekDays.map(d => (
                    <button
                      key={d.isoDate}
                      onClick={() => setCurrentDate(d.date)}
                      className={`h-7 rounded-lg font-bold transition-all ${
                        d.isToday
                          ? 'bg-blue-600 text-white shadow-2xs font-black'
                          : 'hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {d.dayNumber}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search People / Events */}
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="جستجو در رویدادها..."
                  className="w-full pr-8 pl-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-xs font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* MY CALENDARS (تقویم‌های من) */}
              <div>
                <h4 className="text-xs font-black text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between">
                  <span>تقویم‌های من (My calendars)</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </h4>
                <div className="space-y-1.5 text-xs">
                  {calendarFilters.filter(f => !f.isOther).map(filter => (
                    <label key={filter.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900/60 p-1 rounded-md transition-colors">
                      <input
                        type="checkbox"
                        checked={filter.enabled}
                        onChange={() => toggleCalendarFilter(filter.id)}
                        className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                        style={{ accentColor: filter.color }}
                      />
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: filter.color }} />
                      <span className="text-gray-700 dark:text-gray-300 truncate font-medium">{filter.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* OTHER CALENDARS (سایر تقویم‌ها) */}
              <div>
                <h4 className="text-xs font-black text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between">
                  <span>سایر تقویم‌ها (Other calendars)</span>
                  <Plus size={14} className="text-gray-400 cursor-pointer" onClick={() => openQuickAdd()} />
                </h4>
                <div className="space-y-1.5 text-xs">
                  {calendarFilters.filter(f => f.isOther).map(filter => (
                    <label key={filter.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900/60 p-1 rounded-md transition-colors">
                      <input
                        type="checkbox"
                        checked={filter.enabled}
                        onChange={() => toggleCalendarFilter(filter.id)}
                        className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                        style={{ accentColor: filter.color }}
                      />
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: filter.color }} />
                      <span className="text-gray-700 dark:text-gray-300 truncate font-medium">{filter.name}</span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* 2. MAIN VIEW AREA (SWITCH BETWEEN WEEK, MONTH, AND AGENDA/NOTES) */}
          {currentView === 'agenda' ? (
            /* AGENDA / NOTES VIEW (بخش اختصاصی یادداشت‌ها، چک‌لیست‌ها و اقساط وام) */
            <div className="flex-1 min-w-0 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-inner p-3 sm:p-5 flex flex-col gap-4 overflow-y-auto max-h-[640px]">
              {/* Agenda Top Controls: Search, Tabs, Add Note */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-zinc-800">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={notesSearch}
                    onChange={(e) => setNotesSearch(e.target.value)}
                    placeholder="جستجو در متن یا عنوان یادداشت‌ها و رویدادها..."
                    className="w-full pr-9 pl-8 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-xs text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {notesSearch && (
                    <button
                      onClick={() => setNotesSearch('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl text-xs font-bold overflow-x-auto">
                  <button
                    onClick={() => setNotesCategoryFilter('all')}
                    className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      notesCategoryFilter === 'all'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    همه موارد ({systemNotes.length + customItems.length})
                  </button>
                  <button
                    onClick={() => setNotesCategoryFilter('notes')}
                    className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      notesCategoryFilter === 'notes'
                        ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    یادداشت‌ها ({systemNotes.length})
                  </button>
                  <button
                    onClick={() => setNotesCategoryFilter('loans')}
                    className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      notesCategoryFilter === 'loans'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    اقساط وام ({customItems.filter(i => i.category === 'loans').length})
                  </button>
                  <button
                    onClick={() => setNotesCategoryFilter('tasks')}
                    className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap ${
                      notesCategoryFilter === 'tasks'
                        ? 'bg-white dark:bg-zinc-900 text-amber-600 dark:text-amber-400 shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    وظایف ({googleTasks.length})
                  </button>
                </div>

                {/* New Note Button */}
                <button
                  onClick={() => {
                    setEditingNote(null);
                    setNewNoteTitle('');
                    setNewNoteContent('');
                    setNewNoteDate(new Date().toISOString().split('T')[0]);
                    setNewNoteColor('#10b981');
                    setNewNoteTasks([]);
                    setNewTaskInput('');
                    setShowNewNoteModal(true);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>یادداشت جدید</span>
                </button>
              </div>

              {/* Section 1: Notes Cards */}
              {(notesCategoryFilter === 'all' || notesCategoryFilter === 'notes') && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      <BookOpen size={14} className="text-emerald-600" />
                      <span>یادداشت‌ها و چک‌لیست‌های من ({filteredSystemNotes.length})</span>
                    </h3>
                  </div>

                  {filteredSystemNotes.length === 0 ? (
                    <div className="text-center py-8 px-4 bg-gray-50/60 dark:bg-zinc-800/40 rounded-xl border border-dashed border-gray-200 dark:border-zinc-700">
                      <FileText size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">یادداشتی وجود ندارد</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">برای ثبت اولین یادداشت یا چک‌لیست روی دکمه «یادداشت جدید» کلیک کنید.</p>
                      <button
                        onClick={() => {
                          setEditingNote(null);
                          setNewNoteTitle('');
                          setNewNoteContent('');
                          setNewNoteDate(new Date().toISOString().split('T')[0]);
                          setNewNoteColor('#10b981');
                          setNewNoteTasks([]);
                          setShowNewNoteModal(true);
                        }}
                        className="mt-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>ایجاد اولین یادداشت</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredSystemNotes.map(note => {
                        const noteDateStr = note.reminderTime 
                          ? (() => {
                              const d = new Date(note.reminderTime);
                              const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
                              return `${j.jy}/${j.jm}/${j.jd}`;
                            })()
                          : note.createdAt
                          ? (() => {
                              const d = new Date(note.createdAt);
                              const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
                              return `${j.jy}/${j.jm}/${j.jd}`;
                            })()
                          : '';

                        return (
                          <div
                            key={note.id}
                            className="rounded-xl border border-gray-200 dark:border-zinc-800 p-3.5 bg-white dark:bg-zinc-900/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                            style={{ borderTopWidth: '4px', borderTopColor: note.color || '#10b981' }}
                          >
                            {/* Note Card Header */}
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: note.color || '#10b981' }} />
                                  <h4 className="text-xs font-black text-gray-900 dark:text-gray-100 truncate">
                                    {note.title || 'یادداشت'}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleToggleNotePin(note.id)}
                                    className={`p-1 rounded-md transition-colors cursor-pointer ${
                                      note.isPinned 
                                        ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50' 
                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                                    }`}
                                    title={note.isPinned ? 'برداشتن پین' : 'پین کردن در بالا'}
                                  >
                                    <Pin size={12} className={note.isPinned ? 'fill-current' : ''} />
                                  </button>
                                </div>
                              </div>

                              {/* Date badge */}
                              {noteDateStr && (
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono flex items-center gap-1 mb-2">
                                  <Clock size={10} />
                                  <span>{noteDateStr}</span>
                                </div>
                              )}

                              {/* Note Content */}
                              {note.content && (
                                <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed mb-3 line-clamp-6">
                                  {note.content}
                                </p>
                              )}

                              {/* Tasks Checklist */}
                              {Array.isArray(note.tasks) && note.tasks.length > 0 && (
                                <div className="space-y-1 my-2 pt-2 border-t border-gray-100 dark:border-zinc-800/80">
                                  <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                                    <CheckSquare size={11} />
                                    <span>چک‌لیست ({note.tasks.filter(t => t.isCompleted).length}/{note.tasks.length})</span>
                                  </div>
                                  {note.tasks.map(task => (
                                    <div
                                      key={task.id}
                                      onClick={() => handleToggleNoteTask(note.id, task.id)}
                                      className="flex items-center gap-1.5 p-1 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer text-[11px] select-none transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={task.isCompleted}
                                        onChange={() => {}}
                                        className="rounded text-emerald-600 focus:ring-0 cursor-pointer pointer-events-none"
                                      />
                                      <span className={`truncate ${task.isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                        {task.text}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Note Card Footer Actions */}
                            <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-gray-100 dark:border-zinc-800 text-gray-400">
                              <button
                                onClick={() => {
                                  const txt = `${note.title}\n\n${note.content || ''}`;
                                  navigator.clipboard.writeText(txt);
                                  alert('متن یادداشت در کلیپ‌بورد کپی شد.');
                                }}
                                className="p-1 rounded-md hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                                title="کپی متن یادداشت"
                              >
                                <Copy size={13} />
                              </button>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleEditNote(note)}
                                  className="p-1 rounded-md text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                                  title="ویرایش یادداشت"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteNote(note.id)}
                                  className="p-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                  title="حذف یادداشت"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Section 2: Timeline of Events, Loans & Tasks */}
              {(notesCategoryFilter === 'all' || notesCategoryFilter === 'loans' || notesCategoryFilter === 'tasks') && (
                <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-zinc-800">
                  <h3 className="text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <CalendarCheck size={14} className="text-blue-600" />
                    <span>رویدادها، اقساط وام و وظایف ({filteredAgendaTimeline.length})</span>
                  </h3>
                  {filteredAgendaTimeline.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">موردی برای نمایش یافت نشد.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredAgendaTimeline.map(item => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItem({
                            id: item.id,
                            title: item.title,
                            timeStr: `ساعت ${Math.floor(item.startHour)}:00`,
                            dateStr: item.isoDate,
                            shamsiDateStr: item.shamsiDateStr || item.isoDate,
                            color: item.color,
                            category: item.category,
                            description: item.description,
                            isGoogle: item.isGoogle,
                            googleLink: item.googleLink
                          })}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-800/40 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <div className="min-w-0">
                              <div className="font-bold text-gray-900 dark:text-gray-100 truncate">{item.title}</div>
                              {item.description && (
                                <div className="text-[11px] text-gray-500 truncate">{item.description}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[11px] text-gray-500 font-mono">
                            <span>{item.shamsiDateStr || item.isoDate}</span>
                            <span className="text-gray-300">•</span>
                            <span>{Math.floor(item.startHour)}:00</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : currentView === 'month' ? (
            /* MONTH VIEW (نمای ماهانه با تقویم کامل شمسی) */
            <div className="flex-1 min-w-0 overflow-x-auto bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-inner p-2 sm:p-3">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/80 dark:bg-zinc-900/80 pb-2 mb-1">
                  {GREGORIAN_DAYS_SHORT.map((name, i) => (
                    <div key={name} className="text-center">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block">{name}</span>
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 block">{PERSIAN_DAYS_FULL[i]}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((day, idx) => {
                    const dayEvents = allEventsForWeek.filter(e => e.isoDate === day.isoDate);
                    return (
                      <div
                        key={`${day.isoDate}-${idx}`}
                        onClick={() => openQuickAdd(day.isoDate, 9)}
                        className={`min-h-[85px] p-1.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between group ${
                          day.isToday
                            ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-400 dark:border-blue-700'
                            : day.isCurrentMonth
                            ? 'bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-zinc-700'
                            : 'bg-gray-50/40 dark:bg-zinc-950/40 border-gray-100/50 dark:border-zinc-800/40 opacity-40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${day.isToday ? 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {day.dayNumber}
                          </span>
                          <span className="text-[10px] font-mono text-red-600 dark:text-red-400 font-bold truncate max-w-[65px]">
                            {day.shamsiDayStr}
                          </span>
                        </div>

                        <div className="space-y-1 my-1 flex-1 overflow-hidden">
                          {dayEvents.slice(0, 3).map(ev => (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem({
                                  id: ev.id,
                                  title: ev.title,
                                  timeStr: `ساعت ${Math.floor(ev.startHour)}:00`,
                                  dateStr: ev.isoDate,
                                  shamsiDateStr: day.shamsiDayStr,
                                  color: ev.color,
                                  category: ev.category,
                                  description: ev.description,
                                  isGoogle: ev.isGoogle,
                                  googleLink: ev.googleLink
                                });
                              }}
                              className="text-[9px] px-1 py-0.5 rounded truncate font-bold text-white shadow-2xs cursor-pointer hover:opacity-90"
                              style={{ backgroundColor: ev.color }}
                              title={ev.title}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-bold block">
                              +{dayEvents.length - 3} مورد دیگر
                            </span>
                          )}
                        </div>

                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold flex items-center gap-0.5">
                            <Plus size={10} />
                            <span>ثبت</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* MAIN WEEK TIME GRID (دقیقاً مطابق با تصویر با روبان‌های قرمز شمسی و ساعت‌ها) */
            <div className="flex-1 min-w-0 overflow-x-auto bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-inner">
            
            {/* 2.1 WEEK HEADER (Day Names + Day Numbers + RED SHAMSI EXTENSION BANNER) */}
            <div className="min-w-[760px]">
              
              {/* Top Row: Timezone Label & 7 Day Headers */}
              <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-gray-200 dark:border-zinc-800 bg-gray-50/90 dark:bg-zinc-900/90 sticky top-0 z-20">
                
                {/* Timezone label */}
                <div className="p-2 text-[10px] font-bold text-gray-400 border-l border-gray-200 dark:border-zinc-800 flex items-end justify-center pb-1.5">
                  GMT+03:30
                </div>

                {/* 7 Columns: SUN 13, MON 14, TUE 15, WED 16, THU 17, FRI 18, SAT 19 */}
                {weekDays.map((col, idx) => (
                  <div 
                    key={col.isoDate} 
                    className={`border-l border-gray-200 dark:border-zinc-800 p-1.5 flex flex-col items-center justify-between text-center transition-colors ${
                      col.isToday ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    {/* Day Name (SUN, MON, ...) */}
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      {col.dayNameShort}
                    </span>

                    {/* Day Number (13, 14, 15, 16 with blue badge if today) */}
                    <div className="my-0.5">
                      {col.isToday ? (
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
                          {col.dayNumber}
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                          {col.dayNumber}
                        </span>
                      )}
                    </div>

                    {/* RED SHAMSI BANNER (افزونه تقویم شمسی دقیقاً مانند عکس کاربر) */}
                    <div className="w-full mt-1">
                      <div className="w-full bg-red-600 hover:bg-red-700 text-white text-[10px] sm:text-[11px] font-black py-0.5 px-1 rounded-md text-center shadow-xs truncate tracking-tight transition-colors">
                        {col.shamsiRibbonText}
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* 2.2 HOURLY TIME GRID (7 AM to 10 PM) */}
              <div className="relative min-h-[560px]">
                
                {/* Hourly Horizontal Background Lines */}
                {HOURS.map((hour) => {
                  const hourLabel = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                  return (
                    <div 
                      key={hour} 
                      className="grid grid-cols-[64px_repeat(7,1fr)] h-12 border-b border-gray-100 dark:border-zinc-800/80 group"
                    >
                      {/* Time Label Column */}
                      <div className="text-[10px] font-mono text-gray-400 dark:text-gray-500 text-center -translate-y-2.5 pr-1 select-none">
                        {hourLabel}
                      </div>

                      {/* 7 Day Slot Cells */}
                      {weekDays.map((col) => (
                        <div
                          key={`${col.isoDate}-${hour}`}
                          onClick={() => openQuickAdd(col.isoDate, hour)}
                          className="border-l border-gray-100 dark:border-zinc-800/80 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors cursor-pointer relative"
                          title={`کلیک برای ثبت رویداد در ${col.shamsiRibbonText} ساعت ${hour}:00`}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* LIVE CURRENT TIME RED INDICATOR (خط قرمز ساعت جاری دقیقاً مانند عکس) */}
                {currentTimeMinutes >= 7 * 60 && currentTimeMinutes <= 22 * 60 && (
                  (() => {
                    const topPixels = ((currentTimeMinutes - 7 * 60) / 60) * 48; // 48px per hour
                    return (
                      <div 
                        className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
                        style={{ top: `${topPixels}px` }}
                      >
                        {/* Left red dot */}
                        <div className="w-2.5 h-2.5 rounded-full bg-red-600 shadow-sm -ml-1 border-2 border-white dark:border-zinc-900" />
                        {/* Red Line across all columns */}
                        <div className="flex-1 h-[2px] bg-red-600 shadow-xs" />
                      </div>
                    );
                  })()
                )}

                {/* RENDERED EVENT PILLS / LOANS / NOTES (جایگذاری دقیق روی ساعت و روز) */}
                {allEventsForWeek.map((ev) => {
                  const colIndex = weekDays.findIndex(d => d.isoDate === ev.isoDate);
                  if (colIndex === -1) return null;

                  // Vertical bounds calculation
                  const clampedStart = Math.max(7, Math.min(22, ev.startHour));
                  const topPos = (clampedStart - 7) * 48;
                  const heightPos = Math.max(24, ev.durationHours * 48 - 4);
                  
                  // Left position: column width is (100% - 64px) / 7
                  const leftPercentage = `calc(64px + (${colIndex} * ((100% - 64px) / 7)))`;
                  const widthPercentage = `calc((100% - 64px) / 7 - 6px)`;

                  const isLoan = ev.category === 'loans';
                  const isEnglish = ev.category === 'english';

                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem({
                          id: ev.id,
                          title: ev.title,
                          timeStr: `ساعت ${Math.floor(ev.startHour)}:${(ev.startHour % 1) * 60 === 0 ? '00' : '30'}`,
                          dateStr: ev.isoDate,
                          shamsiDateStr: weekDays[colIndex]?.shamsiRibbonText || '',
                          color: ev.color,
                          category: ev.category,
                          description: ev.description,
                          isGoogle: ev.isGoogle,
                          googleLink: ev.googleLink
                        });
                      }}
                      className="absolute z-10 rounded-lg px-2 py-1 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-start text-white overflow-hidden group border border-white/20 active:scale-[0.98]"
                      style={{
                        top: `${topPos}px`,
                        height: `${heightPos}px`,
                        left: leftPercentage,
                        width: widthPercentage,
                        backgroundColor: ev.color
                      }}
                      title={`${ev.title} (${ev.startHour}:00)`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        {isEnglish ? (
                          <div className="w-2 h-2 rounded-full bg-white shrink-0" />
                        ) : isLoan ? (
                          <DollarSign size={11} className="shrink-0 text-white/90" />
                        ) : (
                          <Clock size={11} className="shrink-0 text-white/90" />
                        )}
                        <span className="font-bold text-[11px] truncate leading-tight">
                          {ev.title}
                        </span>
                      </div>

                      {heightPos > 32 && (
                        <span className="text-[9px] text-white/80 font-mono mt-0.5">
                          {Math.floor(ev.startHour)}:00 - {Math.floor(ev.startHour + ev.durationHours)}:00
                        </span>
                      )}
                    </div>
                  );
                })}

              </div>
            </div>

          </div>
          )}

        </div>
      )}

      {/* 3. QUICK ADD EVENT / LOAN INSTALLMENT MODAL */}
      {showAddModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-6 flex justify-center items-start sm:items-center animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div 
            className="relative bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-lg shadow-2xl flex flex-col my-auto max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="sticky top-0 z-10 px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-white dark:bg-zinc-900">
              <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Plus size={17} className="text-blue-600" />
                <span>ثبت رویداد، یادداشت یا قسط وام</span>
              </h3>
              <button 
                type="button"
                onClick={() => setShowAddModal(false)} 
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs overscroll-y-auto min-h-0">
                {/* Title */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                    عنوان رویداد یا یادداشت *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: قسط وام صنعت و معدن، یادگیری لغات، جلسه..."
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Category & Color */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      دسته‌بندی تقویم
                    </label>
                    <select
                      value={modalCategory}
                      onChange={(e) => {
                        const cat = e.target.value as any;
                        setModalCategory(cat);
                        if (cat === 'loans') setModalColor('#1d4ed8');
                        else if (cat === 'english') setModalColor('#84cc16');
                        else if (cat === 'tasks') setModalColor('#eab308');
                        else if (cat === 'personal') setModalColor('#039be5');
                        else setModalColor('#dc2626');
                      }}
                      className="w-full p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium"
                    >
                      <option value="loans">اقساط وام و چک‌ها (آبی تیره)</option>
                      <option value="english">یادگیری لغات انگلیسی (سبز زیتونی)</option>
                      <option value="tasks">وظایف و تسک‌ها (زرد)</option>
                      <option value="personal">تقویم شخصی (آبی)</option>
                      <option value="reminders">یادآور / تولدها (سبز زمردی)</option>
                      <option value="other">سایر (قرمز/بنفش)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      رنگ برچسب
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={modalColor}
                        onChange={(e) => setModalColor(e.target.value)}
                        className="w-12 h-8.5 rounded-xl border border-gray-300 dark:border-zinc-700 cursor-pointer p-0.5"
                      />
                      <span className="text-[11px] font-mono text-gray-500">{modalColor}</span>
                    </div>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      تاریخ
                    </label>
                    <input
                      type="date"
                      value={modalDate}
                      onChange={(e) => setModalDate(e.target.value)}
                      className="w-full p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono"
                    />
                    {modalDate && (() => {
                      try {
                        const [y, m, d] = modalDate.split('-').map(Number);
                        if (y && m && d) {
                          const j = jalaali.toJalaali(y, m, d);
                          const dayOfWeek = new Date(y, m - 1, d).getDay();
                          return (
                            <div className="mt-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                              📅 {PERSIAN_DAYS_FULL[dayOfWeek]} {j.jd} {PERSIAN_MONTH_NAMES[j.jm - 1]} {j.jy}
                            </div>
                          );
                        }
                      } catch {}
                      return null;
                    })()}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      ساعت شروع
                    </label>
                    <select
                      value={modalStartHour}
                      onChange={(e) => setModalStartHour(Number(e.target.value))}
                      className="w-full p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono"
                    >
                      {HOURS.map(h => (
                        <option key={h} value={h}>{h}:00</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      مدت (ساعت)
                    </label>
                    <select
                      value={modalDuration}
                      onChange={(e) => setModalDuration(Number(e.target.value))}
                      className="w-full p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono"
                    >
                      <option value={0.5}>۳۰ دقیقه</option>
                      <option value={1}>۱ ساعت</option>
                      <option value={2}>۲ ساعت</option>
                      <option value={3}>۳ ساعت</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                    توضیحات یا مبلغ و شماره حساب
                  </label>
                  <textarea
                    rows={3}
                    placeholder="یادداشت، شماره چک، جزئیات قسط..."
                    value={modalDescription}
                    onChange={(e) => setModalDescription(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                  />
                </div>

                {/* Google Sync Checkbox */}
                {token && (
                  <label className="flex items-center gap-2 p-2.5 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncToGoogle}
                      onChange={(e) => setSyncToGoogle(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-0"
                    />
                    <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">
                      همگام‌سازی و ارسال مستقیم به تقویم گوگل (Google Calendar)
                    </span>
                  </label>
                )}
              </div>

              {/* Modal Buttons */}
              <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-end gap-2 shrink-0 bg-gray-50 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSavingEvent}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSavingEvent ? 'در حال ذخیره...' : 'ذخیره در تقویم'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 3.1 DEDICATED NEW / EDIT NOTE MODAL */}
      {showNewNoteModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-6 flex justify-center items-start sm:items-center animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNewNoteModal(false);
              setEditingNote(null);
            }
          }}
        >
          <div 
            className="relative bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-lg shadow-2xl flex flex-col my-auto max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 px-5 py-3.5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-white dark:bg-zinc-900">
              <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Edit3 size={17} className="text-emerald-600" />
                <span>{editingNote ? 'ویرایش یادداشت' : 'ثبت یادداشت یا چک‌لیست جدید'}</span>
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setShowNewNoteModal(false);
                  setEditingNote(null);
                }} 
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleSaveSystemNote} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs overscroll-y-auto min-h-0">
                {/* Title */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                    عنوان یادداشت
                  </label>
                  <input
                    type="text"
                    required
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                    placeholder="مثال: پیگیری تسویه‌حساب مشتری، یادداشت جلسه، لیست کارها..."
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Content */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                    متن توضیحات یادداشت
                  </label>
                  <textarea
                    rows={4}
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="متن کامل یادداشت یا شرح جزئیات را در اینجا بنویسید..."
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                  />
                </div>

                {/* Date & Color */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      تاریخ یادآوری / تقویم (اختیاری)
                    </label>
                    <input
                      type="date"
                      value={newNoteDate}
                      onChange={(e) => setNewNoteDate(e.target.value)}
                      className="w-full p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-mono"
                    />
                    {newNoteDate && (() => {
                      try {
                        const [y, m, d] = newNoteDate.split('-').map(Number);
                        if (y && m && d) {
                          const j = jalaali.toJalaali(y, m, d);
                          const dayOfWeek = new Date(y, m - 1, d).getDay();
                          return (
                            <div className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              📅 {PERSIAN_DAYS_FULL[dayOfWeek]} {j.jd} {PERSIAN_MONTH_NAMES[j.jm - 1]} {j.jy}
                            </div>
                          );
                        }
                      } catch {}
                      return null;
                    })()}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                      برچسب رنگی
                    </label>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {[
                        { color: '#10b981', label: 'سبز' },
                        { color: '#3b82f6', label: 'آبی' },
                        { color: '#f59e0b', label: 'نارنجی' },
                        { color: '#ef4444', label: 'قرمز' },
                        { color: '#8b5cf6', label: 'بنفش' },
                        { color: '#ec4899', label: 'صورتی' }
                      ].map(c => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => setNewNoteColor(c.color)}
                          className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                            newNoteColor === c.color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: c.color }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Checklist items */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                    افزودن گزینه‌های چک‌لیست (اختیاری)
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={newTaskInput}
                      onChange={(e) => setNewTaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newTaskInput.trim()) {
                            setNewNoteTasks(prev => [...prev, newTaskInput.trim()]);
                            setNewTaskInput('');
                          }
                        }
                      }}
                      placeholder="عنوان کار یا مورد را تایپ کنید..."
                      className="flex-1 p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newTaskInput.trim()) {
                          setNewNoteTasks(prev => [...prev, newTaskInput.trim()]);
                          setNewTaskInput('');
                        }
                      }}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-bold rounded-xl text-xs transition-colors shrink-0 cursor-pointer"
                    >
                      + افزودن
                    </button>
                  </div>

                  {newNoteTasks.length > 0 && (
                    <div className="space-y-1.5 p-2 bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-200 dark:border-zinc-700 max-h-36 overflow-y-auto">
                      {newNoteTasks.map((taskText, idx) => (
                        <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 text-xs">
                          <span className="truncate text-gray-800 dark:text-gray-200">{taskText}</span>
                          <button
                            type="button"
                            onClick={() => setNewNoteTasks(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700 p-0.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-end gap-2 shrink-0 bg-gray-50 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewNoteModal(false);
                    setEditingNote(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-500/20 transition-colors cursor-pointer"
                >
                  {editingNote ? 'بروزرسانی یادداشت' : 'ثبت و ذخیره یادداشت'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 4. EVENT DETAILS POPOVER */}
      {selectedItem && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItem(null);
          }}
        >
          <div 
            className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-5 w-full max-w-sm shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-md shrink-0" style={{ backgroundColor: selectedItem.color }} />
                <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">
                  {selectedItem.title}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedItem(null)} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400">
                <span>📅 {selectedItem.shamsiDateStr}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 font-mono text-[11px]">
                <span>{selectedItem.dateStr}</span>
                <span>•</span>
                <span>{selectedItem.timeStr}</span>
              </div>
              {selectedItem.description && (
                <div className="mt-2 p-2.5 bg-gray-50 dark:bg-zinc-800 rounded-lg text-xs leading-relaxed">
                  {selectedItem.description}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-zinc-800">
              {!selectedItem.isGoogle ? (
                <button
                  type="button"
                  onClick={() => handleDeleteItem(selectedItem.id)}
                  className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>حذف یادداشت</span>
                </button>
              ) : (
                <a
                  href={selectedItem.googleLink || 'https://calendar.google.com'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                >
                  <span>مشاهده در سایت گوگل</span>
                  <ExternalLink size={13} />
                </a>
              )}

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-3.5 py-1.5 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                بستن
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default GoogleWorkspaceWidget;
