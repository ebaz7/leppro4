import React from 'react';
import { TrendingUp, TrendingDown, Clock, CheckCircle, Check, Activity, XCircle, Banknote, Calendar as CalendarIcon, ShieldCheck, ArrowUpRight, CheckSquare, Truck, Package, ListChecks, PieChart, BarChart, BookOpen, PenTool, Edit3, Plus, Trash2, Send, X, FileText, Users, ChevronLeft, ChevronRight, RotateCw, Copy, Flame, Sparkles, Zap, ChevronDown, ChevronUp, BellRing, CreditCard, Crown, Briefcase, Settings2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { PaymentOrder, OrderStatus, SystemSettings, User, ExitPermit, ExitPermitStatus, WarehouseTransaction, UserRole, SystemAnnouncement, Note, PurchaseRequest, PurchaseRequestStatus, GroupTask, TaskGroup } from '../types';
import { formatCurrency, getShamsiDateFromIso } from '../constants';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

// 1. WAREHOUSE ALERT WIDGET
interface WarehouseAlertProps {
  warehouseAlertData: any;
  onNavigate?: (tab: string) => void;
}
export const WarehouseAlertWidget: React.FC<WarehouseAlertProps> = ({ warehouseAlertData, onNavigate }) => {
  if (!warehouseAlertData) return null;
  return (
    <div 
      onClick={() => onNavigate && onNavigate('sayan')}
      className={`cursor-pointer border rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors group ${
        warehouseAlertData.diffAllWeight < 0 
          ? 'bg-red-50 hover:bg-red-100 border-red-200' 
          : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 text-white rounded-xl shadow-inner group-hover:scale-105 transition-transform ${
          warehouseAlertData.diffAllWeight < 0 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
        }`}>
          {warehouseAlertData.diffAllWeight < 0 ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
        </div>
        <div>
          <h4 className={`font-extrabold text-sm md:text-base mb-0.5 ${
            warehouseAlertData.diffAllWeight < 0 ? 'text-red-900' : 'text-emerald-900'
          }`}>
            {warehouseAlertData.diffAllWeight < 0 ? 'هشدار: افت تراز وزنی انبارها' : 'وضعیت مطلوب: رشد تراز وزنی انبارها'}
          </h4>
          <p className={`text-xs font-medium ${
            warehouseAlertData.diffAllWeight < 0 ? 'text-red-700' : 'text-emerald-700'
          }`}>
            موجودی انبار نسبت به سال گذشته <span className={`font-bold ${
              warehouseAlertData.diffAllWeight < 0 ? 'text-red-800' : 'text-emerald-800'
            }`} dir="ltr">{Math.abs(warehouseAlertData.diffAllWeight).toLocaleString('fa-IR', { maximumFractionDigits: 0 })} kg</span> 
            {' '}({(Math.abs(warehouseAlertData.ratioAllWeight)).toFixed(1)}٪) {warehouseAlertData.diffAllWeight < 0 ? 'کاهش' : 'افزایش'} یافته است.
          </p>
        </div>
      </div>
      <div className={`transition-colors hidden sm:block ${
        warehouseAlertData.diffAllWeight < 0 ? 'text-red-400 group-hover:text-red-600' : 'text-emerald-400 group-hover:text-emerald-600'
      }`}>
        <ChevronLeft size={24} />
      </div>
    </div>
  );
};

// 2. DATE CARD WIDGET
interface DateCardProps {
  formattedHijriDate: string;
  formattedShamsiDate: string;
  gregorianDate: string;
  shamsiDayName: string;
}
export const DateCardWidget: React.FC<DateCardProps> = ({ formattedHijriDate, formattedShamsiDate, gregorianDate, shamsiDayName }) => {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100/60 dark:border-indigo-900/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest font-mono">Today's Presence</span>
        <div className="bg-indigo-100 dark:bg-indigo-900/40 p-1.5 rounded-xl text-indigo-600 dark:text-indigo-400"><CalendarIcon size={16}/></div>
      </div>
      <div className="text-right">
        <span className="text-[11px] font-bold text-indigo-600/70 dark:text-indigo-400/70">{formattedHijriDate}</span>
        <h3 className="text-lg md:text-xl font-black text-gray-800 dark:text-gray-100 mt-0.5">{formattedShamsiDate}</h3>
        <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-indigo-100/40 dark:border-indigo-900/30">
          <span className="text-[11px] font-medium text-gray-500">{gregorianDate}</span>
          <span className="text-[10px] bg-indigo-100/60 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-full">{shamsiDayName}</span>
        </div>
      </div>
    </div>
  );
};

// 3. POETRY CARD WIDGET
interface PoetryCardProps {
  dailyPoem: any;
  isLoadingPoem: boolean;
  handleFetchNewPoem: () => void;
  handleNextPoem: () => void;
}
export const PoetryCardWidget: React.FC<PoetryCardProps> = ({ dailyPoem, isLoadingPoem, handleFetchNewPoem, handleNextPoem }) => {
  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-100/60 dark:border-emerald-900/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[160px]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-mono">Iranian Poem</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleFetchNewPoem}
            disabled={isLoadingPoem}
            className="p-1 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-emerald-500 hover:text-emerald-700 transition-all cursor-pointer inline-flex items-center justify-center gap-1"
            title="دریافت شعر آنلاین جدید"
          >
            <RotateCw size={11} className={`${isLoadingPoem ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="text-[8.5px] font-medium hidden sm:inline">آنلاین</span>
          </button>
        </div>
      </div>
      <div className="text-center py-1">
        <p className="text-gray-800 dark:text-gray-200 font-extrabold text-xs sm:text-[13px] leading-relaxed line-clamp-2">«{dailyPoem.verse1}»</p>
        <p className="text-gray-800 dark:text-gray-200 font-extrabold text-xs sm:text-[13px] leading-relaxed mt-1 line-clamp-2">«{dailyPoem.verse2}»</p>
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-emerald-100/40 dark:border-emerald-900/30">
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{dailyPoem.poet}</span>
        <button 
          onClick={handleNextPoem}
          className="text-[10px] text-emerald-600 hover:text-emerald-800 font-black flex items-center gap-0.5 cursor-pointer"
        >
          <span>بعدی</span>
          <ChevronLeft size={12} />
        </button>
      </div>
    </div>
  );
};

// 4. MOTIVATION CARD WIDGET
interface MotivationCardProps {
  dailyMotivational: any;
  isLoadingMotivational: boolean;
  handleFetchNewMotivational: () => void;
  handleNextMotivational: () => void;
}
export const MotivationCardWidget: React.FC<MotivationCardProps> = ({ dailyMotivational, isLoadingMotivational, handleFetchNewMotivational, handleNextMotivational }) => {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-100/60 dark:border-amber-900/40 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[160px]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest font-mono">Motivational Quote</span>
        <div className="flex items-center gap-1">
          <button 
            onClick={handleFetchNewMotivational}
            disabled={isLoadingMotivational}
            className="p-1 rounded-md hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-500 hover:text-amber-700 transition-all cursor-pointer inline-flex items-center justify-center gap-1"
            title="دریافت جمله انگیزشی آنلاین جدید"
          >
            <RotateCw size={11} className={`${isLoadingMotivational ? 'animate-spin text-amber-600' : ''}`} />
            <span className="text-[8.5px] font-medium hidden sm:inline">آنلاین</span>
          </button>
        </div>
      </div>
      <div className="text-center py-1">
        <p className="text-gray-800 dark:text-gray-200 font-bold text-xs sm:text-[13px] leading-relaxed line-clamp-3">«{dailyMotivational.text}»</p>
      </div>
      <div className="flex justify-between items-center pt-2 border-t border-amber-100/40 dark:border-amber-900/30">
        <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-medium">— {dailyMotivational.author || 'ناشناس'}</span>
        <button 
          onClick={handleNextMotivational}
          className="text-[10px] text-amber-600 hover:text-amber-800 font-black flex items-center gap-0.5 cursor-pointer"
        >
          <span>بعدی</span>
          <ChevronLeft size={12} />
        </button>
      </div>
    </div>
  );
};

// 5. ANNOUNCEMENTS WIDGET
interface AnnouncementsProps {
  visibleAnnouncements: SystemAnnouncement[];
  permissions: any;
  currentUser: User;
  setShowAnnounceModal: (show: boolean) => void;
  setAnnouncements: React.Dispatch<React.SetStateAction<SystemAnnouncement[]>>;
  handleToggleAnnouncementCompletion: (ann: SystemAnnouncement) => void;
}
export const AnnouncementsWidget: React.FC<AnnouncementsProps> = ({ visibleAnnouncements, permissions, currentUser, setShowAnnounceModal, setAnnouncements, handleToggleAnnouncementCompletion }) => {
  const showSection = visibleAnnouncements.length > 0 || permissions.canCreateAnnouncements || currentUser.role === UserRole.ADMIN;
  if (!showSection) return null;

  return (
    <div className={`rounded-2xl border border-blue-100 shadow-sm relative transition-all ${visibleAnnouncements.length === 0 ? 'bg-transparent p-2 border-dashed' : 'bg-blue-50/50 p-6'}`}>
      {visibleAnnouncements.length === 0 ? (
        <div className="flex justify-center items-center">
          <button onClick={() => setShowAnnounceModal(true)} className="text-xs text-blue-500 hover:text-blue-600 font-bold transition-colors flex items-center gap-1 py-2">
            <Plus size={14}/> ارسال اولین پیام / اعلامیه برای پرسنل
          </button>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600 animate-pulse">
                <Activity size={20} />
              </div>
              <h3 className="font-black text-gray-800">اعلانات مدیران</h3>
            </div>
            {(permissions.canCreateAnnouncements || currentUser.role === UserRole.ADMIN) && (
              <button onClick={() => setShowAnnounceModal(true)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1">
                <Plus size={14}/> اعلامیه جدید
              </button>
            )}
          </div>
          <div className="space-y-3">
            {visibleAnnouncements.map((ann, i) => (
              <div key={ann.id || i} className="glass-panel p-4 rounded-xl shadow-sm border border-blue-50 flex items-start gap-3 relative overflow-hidden group">
                <div className="absolute top-0 right-0 h-full w-1 bg-gradient-to-b from-blue-400 to-blue-600"></div>
                <div className="bg-blue-100/50 p-2 rounded-full text-blue-600 mt-1 cursor-pointer hover:bg-blue-200 transition-colors shadow-sm" onClick={() => handleToggleAnnouncementCompletion(ann)}>
                  {ann.type === 'task' ? (
                    ann.isCompleted ? <CheckCircle size={16} className="text-green-600" /> : <div className="w-4 h-4 rounded-full border-2 border-orange-500 bg-orange-100/50"></div>
                  ) : (
                    <BookOpen size={16} className="text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-black text-blue-800">{ann.createdBy}</span>
                    <div className="flex items-center gap-2">
                      {ann.isCompleted && <span className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0.5 rounded font-bold">تکمیل شده</span>}
                      {ann.targetUsers && ann.targetUsers.length > 0 && <span className="bg-blue-100 px-2 py-0.5 rounded text-[10px] text-blue-700 font-bold border border-blue-200">پیام اختصاصی</span>}
                      {(permissions.canCreateAnnouncements || currentUser.role === UserRole.ADMIN) && (
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          const mod = await import('../services/storageService');
                          await mod.deleteSystemAnnouncement(ann.id);
                          setAnnouncements(prev => prev.filter(a => a.id !== ann.id));
                        }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded transition-all"><Trash2 size={12}/></button>
                      )}
                    </div>
                  </div>
                  <p className={`text-sm font-bold transition-all ${ann.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`} style={{ whiteSpace: 'pre-wrap' }}>{ann.message}</p>
                  <div className="text-[10px] text-gray-400 mt-2 text-left">
                    {(() => { 
                      const d = getShamsiDateFromIso(new Date(ann.createdAt).toISOString()); 
                      const greg = new Date(ann.createdAt).toLocaleDateString('en-CA'); // YYYY-MM-DD
                      return `${d.year}/${d.month}/${d.day} | ${greg}`; 
                    })()} - {new Date(ann.createdAt).toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'})}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// 6. TASK GROUPS QUICK ACCESS WIDGET
interface TaskGroupsQuickAccessProps {
  showTasksInDashboard: boolean;
  setShowTasksInDashboard: (show: boolean) => void;
  taskGroups: TaskGroup[];
  tasks: GroupTask[];
  setTasks: React.Dispatch<React.SetStateAction<GroupTask[]>>;
  currentUser: User;
  onGoToTaskGroup?: (groupId: string, taskId?: string) => void;
}
export const TaskGroupsQuickAccessWidget: React.FC<TaskGroupsQuickAccessProps> = ({ showTasksInDashboard, setShowTasksInDashboard, taskGroups, tasks, setTasks, currentUser, onGoToTaskGroup }) => {
  if (!showTasksInDashboard) {
    return (
      <div className="flex justify-end my-3">
        <button 
          onClick={() => {
            setShowTasksInDashboard(true);
            localStorage.setItem('dashboard_show_chat_tasks', 'true');
          }}
          className="text-xs text-gray-400 hover:text-blue-600 font-bold transition flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-gray-100"
        >
          <ListChecks size={14}/> نمایش مجدد تسک‌های گفتگو در داشبورد
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-white/50 p-6 shadow-sm relative transition-all my-5">
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-2">
          <div className="bg-orange-100 p-1.5 rounded-lg text-orange-600">
            <ListChecks size={20} />
          </div>
          <h3 className="font-black text-gray-800">📌 دسترسی سریع به تسک‌های گفتگو</h3>
        </div>
        <button 
          onClick={() => {
            if (confirm('آیا مایل به لغو نمایش تسک‌های گفتگو در داشبورد هستید؟ (همواره می‌توانید از انتهای این بخش مجدداً آن را فعال کنید)')) {
              setShowTasksInDashboard(false);
              localStorage.setItem('dashboard_show_chat_tasks', 'false');
            }
          }}
          className="text-xs text-gray-400 hover:text-red-500 font-bold transition flex items-center gap-1 hover:bg-red-50 px-2.5 py-1.5 rounded-lg"
          title="لغو نمایش تسک‌ها در داشبورد"
        >
          <X size={14}/> عدم نمایش در داشبورد
        </button>
      </div>

      {taskGroups.length === 0 ? (
        <div className="text-center text-gray-400 py-10 bg-white/30 rounded-xl border border-dashed">
          <ListChecks size={36} className="mx-auto mb-2 opacity-20"/>
          <p className="text-xs font-bold">شما در هیچ گروه تسک فعالی عضو نیستید.</p>
          <p className="text-[10px] text-gray-400 mt-1">تسک‌ها پس از عضویت شما در گروه‌های تسک گفتگو در این بخش نمایش داده می‌شوند.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {taskGroups.map(group => {
            const groupTasks = tasks.filter(t => t.groupId === group.id);
            const pendingTasks = groupTasks.filter(t => t.status !== 'completed');
            const completedTasks = groupTasks.filter(t => t.status === 'completed');

            return (
              <div key={group.id} className="glass-panel p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between min-h-[220px]">
                <div>
                  <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
                    <h4 className="font-black text-sm text-gray-800 dark:text-gray-200">{group.name}</h4>
                    <span className="bg-orange-50 text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {pendingTasks.length} تسک فعال
                    </span>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pl-1">
                    {pendingTasks.length === 0 ? (
                      <div className="text-center py-6 text-gray-400">
                        <p className="text-xs">تسک فعال و معلقی در این گروه وجود ندارد ✨</p>
                      </div>
                    ) : (
                      pendingTasks.map(task => (
                        <div 
                          key={task.id} 
                          onClick={() => onGoToTaskGroup && onGoToTaskGroup(group.id, task.id)}
                          className="flex items-start gap-2.5 p-2 bg-white/60 dark:bg-gray-900/40 rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-950/20 hover:border-blue-200 border border-transparent transition cursor-pointer select-none"
                          title="کلیک برای انتقال به گفتگو و تسک‌های این گروه"
                        >
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const updatedTask = { 
                                ...task, 
                                status: 'completed' as const,
                                completedBy: currentUser.username,
                                completedAt: Date.now()
                              };
                              import('../services/storageService').then(mod => {
                                mod.updateTask(updatedTask).then(() => {
                                  setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t));
                                });
                              });
                            }}
                            className="mt-0.5 rounded-full border-2 border-gray-300 dark:border-gray-700 w-5 h-5 flex items-center justify-center hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/20 text-slate-400 hover:text-green-600 transition shrink-0 cursor-pointer"
                            title="علامت‌گذاری به عنوان انجام شده"
                          >
                            <Check size={11} className="stroke-[3]" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate" title={task.title}>{task.title}</p>
                              {task.recurringReminder && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800" title={`یادآور صوتی هر ${task.reminderIntervalMinutes || 10} دقیقه فعال است`}>
                                  <BellRing size={9} className="animate-bounce" />
                                  <span>{task.reminderIntervalMinutes || 10}دقیقه</span>
                                </span>
                              )}
                            </div>
                            {task.assignedTo && task.assignedTo.length > 0 && (
                              <span className="text-[9px] text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-1 py-0.5 rounded mt-1 inline-block font-semibold">ارجاع: @{task.assignedTo.join(', @')}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                  <span className="text-[10px] text-gray-400 font-medium">{completedTasks.length} تسک انجام‌شده</span>
                  {onGoToTaskGroup && (
                    <button 
                      onClick={() => onGoToTaskGroup(group.id)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline transition-all"
                    >
                      <span>ورود به گفتگو و تسک‌ها</span>
                      <ArrowUpRight size={14}/>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// 7. NOTES PREVIEW WIDGET
interface NotesPreviewProps {
  notes: Note[];
}
export const NotesPreviewWidget: React.FC<NotesPreviewProps> = ({ notes }) => {
  return (
    <div className="bg-yellow-50/50 rounded-2xl p-6 border border-yellow-100 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Edit3 size={20} className="text-yellow-600" />
          <h3 className="font-black text-gray-800">برنامه یادداشت و تسک</h3>
        </div>
        <button 
          onClick={() => {
            window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'knowledge' }));
          }}
          className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg font-black hover:bg-yellow-200 transition-colors shadow-sm border border-yellow-200"
        >
          بازکردن برنامه اصلی
        </button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {notes.length === 0 ? (
          <div className="col-span-full py-8 text-center text-gray-400 text-sm border-2 border-dashed border-yellow-200 rounded-xl">
            یادداشتی برای نمایش در پیشخوان وجود ندارد.
          </div>
        ) : (
          notes.slice(0, 4).map(note => (
            <div 
              key={note.id} 
              onClick={() => window.dispatchEvent(new CustomEvent('CHANGE_TAB', { detail: 'knowledge' }))}
              className={`${note.color || 'glass-panel'} p-4 rounded-xl border border-yellow-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative group`}
            >
              <h4 className="font-bold text-gray-800 text-sm mb-2 truncate">{note.title || 'بدون عنوان'}</h4>
              <div className="space-y-2">
                {note.content && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">{note.content}</p>}
                {note.tasks && note.tasks.length > 0 && (
                  <div className="space-y-1 my-1">
                    {note.tasks.slice(0, 3).map(task => (
                      <div key={task.id} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        {task.isCompleted ? <ListChecks size={10} className="text-blue-500"/> : <Clock size={10} className="text-gray-300"/>}
                        <span className={task.isCompleted ? 'line-through opacity-50' : ''}>{task.text}</span>
                      </div>
                    ))}
                    {note.tasks.length > 3 && <div className="text-[9px] text-gray-400">...</div>}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 8. QUICK ACCESS TILES WIDGET (WINDOWS DESKTOP STYLE)
interface QuickTilesProps {
  showQuickTiles: boolean;
  isCustomizingTiles: boolean;
  displayTiles: any[];
  visibleTiles: any[];
  hiddenTileIds: string[];
  toggleTileVisibility: (id: string) => void;
  moveTile: (from: number, to: number) => void;
  showGoogleWidget: boolean;
  toggleGoogleWidgetVisibility: () => void;
  saveTileOrder: (order: string[]) => void;
  setHiddenTileIds: React.Dispatch<React.SetStateAction<string[]>>;
  setShowGoogleWidget: (show: boolean) => void;
  setShowQuickTiles: (show: boolean) => void;
  setIsCustomizingTiles: (customizing: boolean) => void;
}
export const QuickTilesWidget: React.FC<QuickTilesProps> = ({
  showQuickTiles,
  isCustomizingTiles,
  displayTiles,
  visibleTiles,
  hiddenTileIds,
  toggleTileVisibility,
  moveTile,
  showGoogleWidget,
  toggleGoogleWidgetVisibility,
  saveTileOrder,
  setHiddenTileIds,
  setShowGoogleWidget,
  setShowQuickTiles,
  setIsCustomizingTiles,
}) => {
  return (
    <div className="bg-gradient-to-br from-white/80 to-zinc-50/80 dark:from-zinc-950/80 dark:to-zinc-900/80 rounded-3xl p-6 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm backdrop-blur-xl relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-500/20">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm sm:text-base text-zinc-900 dark:text-white">
                کاشی‌ها و دسترسی سریع برنامه‌ها
              </h3>
              <span className="text-[10px] bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                {visibleTiles.length} کاشی فعال
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              ترتیب کاشی‌ها را بر اساس سلیقه و نیاز خود تغییر داده یا برنامه‌های غیرضروری را مخفی نمایید
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {hiddenTileIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHiddenTileIds([]);
                try {
                  localStorage.removeItem('dashboard_hidden_tile_ids');
                } catch {}
              }}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 font-bold transition-all"
              title="نمایش مجدد همه کاشی‌های مخفی‌شده"
            >
              بازیابی همه ({hiddenTileIds.length} مخفی)
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCustomizingTiles(!isCustomizingTiles)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm ${
              isCustomizingTiles
                ? 'bg-amber-600 text-white shadow-amber-500/20 ring-2 ring-amber-400/40'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
            }`}
            title="شخصی‌سازی، حذف، نمایش و جابجایی کاشی‌ها"
          >
            <Settings2 size={14} />
            <span>{isCustomizingTiles ? 'اتمام چینش کاشی‌ها' : 'شخصی‌سازی کاشی‌ها'}</span>
          </button>
        </div>
      </div>

      {/* Tile Customizer Bar / Guide */}
      {isCustomizingTiles && (
        <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <GripVertical size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>می‌توانید با دکمه‌های چپ/راست جایگاه هر کاشی را تغییر دهید یا با کلیک روی چشم آن را پنهان/آشکار سازید.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleGoogleWidgetVisibility}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                showGoogleWidget 
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50'
              }`}
              title="نمایش یا پنهان‌سازی ویجت تقویم و کارهای گوگل"
            >
              {showGoogleWidget ? <Eye size={13} /> : <EyeOff size={13} />}
              <span>ویجت تقویم گوگل: {showGoogleWidget ? 'فعال' : 'پنهان'}</span>
            </button>
            <button
              onClick={() => {
                saveTileOrder([]);
                setHiddenTileIds([]);
                setShowGoogleWidget(true);
                try {
                  localStorage.removeItem('dashboard_show_google_widget');
                } catch {}
              }}
              className="text-[11px] font-bold text-amber-700 dark:text-amber-300 underline hover:text-amber-900 px-2 py-0.5"
            >
              بازنشانی پیش‌فرض
            </button>
          </div>
        </div>
      )}

      {showQuickTiles && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2.5 md:gap-3 mt-3 animate-fade-in">
          {(isCustomizingTiles ? displayTiles : visibleTiles).map((tile, idx) => {
            const isHidden = hiddenTileIds.includes(tile.id);
            return (
              <div
                key={tile.id}
                className={`group relative flex flex-col items-center justify-between p-2.5 sm:p-3 rounded-2xl bg-white dark:bg-gray-800/90 border shadow-sm transition-all aspect-square ${
                  isHidden 
                    ? 'opacity-40 border-dashed border-gray-300 dark:border-gray-600' 
                    : 'border-gray-100 dark:border-gray-700/60 hover:shadow-lg hover:border-blue-300'
                }`}
              >
                {/* Pending Count Badge */}
                {!isCustomizingTiles && tile.count !== undefined && tile.count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-bounce z-20">
                    {tile.count}
                  </span>
                )}

                {/* Top Bar in Customization Mode */}
                {isCustomizingTiles ? (
                  <div className="w-full flex items-center justify-between z-20">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTileVisibility(tile.id);
                      }}
                      className={`p-1 rounded-md transition-colors ${isHidden ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-700'}`}
                      title={isHidden ? 'نمایش کاشی' : 'پنهان کردن کاشی'}
                    >
                      {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTile(idx, idx - 1);
                        }}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-20 text-gray-600"
                        title="انتقال به راست"
                      >
                        <ChevronRight size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTile(idx, idx + 1);
                        }}
                        disabled={idx === displayTiles.length - 1}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-20 text-gray-600"
                        title="انتقال به چپ"
                      >
                        <ChevronLeft size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Top Category Badge / Pill */
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/40 truncate max-w-full">
                    {tile.badge}
                  </span>
                )}

                {/* Vibrant Gradient Icon Box */}
                <div 
                  onClick={() => !isCustomizingTiles && tile.onClick && tile.onClick()}
                  className={`w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br ${tile.gradient} text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform my-1 cursor-pointer`}
                >
                  <tile.icon size={20} className="sm:w-5 sm:h-5" />
                </div>

                {/* Title */}
                <span 
                  onClick={() => !isCustomizingTiles && tile.onClick && tile.onClick()}
                  className="text-[10px] sm:text-[11px] font-black text-gray-800 dark:text-gray-200 text-center leading-tight line-clamp-1 cursor-pointer"
                >
                  {tile.title}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
