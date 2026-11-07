import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

// Register custom fonts and sizes in Quill using style attributors for 100% universal compatibility
if (typeof window !== "undefined" && ReactQuill) {
  try {
    const Quill = (ReactQuill as any).Quill;
    if (Quill && typeof Quill.import === "function") {
      // 1. Register Font family style attributor (uses inline style instead of class)
      try {
        const Font = Quill.import("attributors/style/font") as any;
        const fontList = [
          "Vazirmatn",
          "Sahel",
          "Samim",
          "Tanha",
          "Nahid",
          "Lalezar",
          "Noto Naskh Arabic",
          "Noto Sans Arabic",
          "Amiri",
          "Markazi Text",
          "Scheherazade New",
          "Cairo",
          "B Nazanin",
          "B Titr",
          "B Yekan",
          "Tahoma",
          "Arial",
          "Times New Roman",
          "Courier New",
        ];
        if (Font) {
          Font.whitelist = fontList;
          Quill.register(Font, true);
        }
        try {
          const ClassFont = Quill.import("formats/font") as any;
          if (ClassFont) {
            ClassFont.whitelist = fontList;
            Quill.register(ClassFont, true);
          }
        } catch (e2) {}
      } catch (e) {
        console.warn("Quill font attributor init skipped:", e);
      }

      // 2. Register Font size style attributor (uses inline style instead of class)
      try {
        const Size = Quill.import("attributors/style/size") as any;
        if (Size) {
          Size.whitelist = [
            "9px",
            "10px",
            "11px",
            "12px",
            "13px",
            "14px",
            "15px",
            "16px",
            "17px",
            "18px",
            "19px",
            "20px",
            "22px",
            "24px",
            "28px",
            "32px",
            "36px",
            "48px",
          ];
          Quill.register(Size, true);
        }
      } catch (e) {
        console.warn("Quill size attributor init skipped:", e);
      }

      // 3. Register align and direction style attributors (including 'left' for RTL editors)
      try {
        const alignList = ["right", "center", "left", "justify"];
        const Align = Quill.import("attributors/style/align") as any;
        if (Align) {
          Align.whitelist = alignList;
          Quill.register(Align, true);
        }
        try {
          const ClassAlign = Quill.import("formats/align") as any;
          if (ClassAlign) {
            ClassAlign.whitelist = alignList;
            Quill.register(ClassAlign, true);
          }
        } catch (e2) {}
      } catch (e) {}

      try {
        const Direction = Quill.import("attributors/style/direction") as any;
        if (Direction) {
          Quill.register(Direction, true);
        }
      } catch (e) {}

      // 4. Register Line Height if Parchment constructor is available
      try {
        const Parchment = Quill.import("parchment");
        const StyleAttributor =
          Parchment?.Attributor?.Style ||
          Parchment?.StyleAttributor ||
          (typeof Parchment?.Attributor === "function" ? Parchment.Attributor : null);
        if (typeof StyleAttributor === "function") {
          const LineHeightStyle = new StyleAttributor(
            "lineHeight",
            "line-height",
            {
              scope: Parchment.Scope?.BLOCK || 3,
              whitelist: ["1.0", "1.5", "2.0", "2.5", "3.0"],
            },
          );
          Quill.register(LineHeightStyle, true);
        }
      } catch (e) {
        console.warn("LineHeight attributor skipped:", e);
      }

      // 5. Register Custom Image blot to preserve style, width, height, blend mode, and all layout styles
      try {
        const BaseImage = Quill.import("formats/image") as any;
        if (BaseImage) {
          class CustomImageBlot extends BaseImage {
            static create(value: any) {
              const src = typeof value === "object" && value !== null ? value.src : value;
              const node = super.create(src);
              if (typeof value === "object" && value !== null) {
                if (value.style) node.setAttribute("style", value.style);
                if (value.width) node.setAttribute("width", value.width);
                if (value.height) node.setAttribute("height", value.height);
                if (value.alt) node.setAttribute("alt", value.alt);
                if (value.className) node.setAttribute("class", value.className);
              }
              return node;
            }

            static formats(domNode: HTMLElement) {
              const formats: Record<string, any> = {};
              if (domNode.hasAttribute("style")) {
                formats.style = domNode.getAttribute("style");
              }
              if (domNode.hasAttribute("width")) {
                formats.width = domNode.getAttribute("width");
              }
              if (domNode.hasAttribute("height")) {
                formats.height = domNode.getAttribute("height");
              }
              if (domNode.hasAttribute("alt")) {
                formats.alt = domNode.getAttribute("alt");
              }
              return formats;
            }

            static value(domNode: HTMLElement) {
              return {
                src: domNode.getAttribute("src"),
                style: domNode.getAttribute("style") || "",
                width: domNode.getAttribute("width") || "",
                height: domNode.getAttribute("height") || "",
                alt: domNode.getAttribute("alt") || "",
              };
            }

            format(name: string, value: any) {
              if (["style", "width", "height", "alt"].includes(name)) {
                if (value) {
                  this.domNode.setAttribute(name, value);
                } else {
                  this.domNode.removeAttribute(name);
                }
              } else {
                super.format(name, value);
              }
            }
          }
          Quill.register(CustomImageBlot, true);
        }
      } catch (imgErr) {
        console.warn("CustomImageBlot registration skipped:", imgErr);
      }
    }
  } catch (err) {
    console.warn("ReactQuill configuration caught gracefully:", err);
  }
}

import { motion, AnimatePresence } from "motion/react";
import { executeCrossPlatformPrint } from "../utils/mobilePrintService";
import {
  Building,
  Building2,
  AlertTriangle,
  Lock,
  Unlock,
  FileText,
  Archive,
  Settings2,
  Plus,
  Search,
  FileDown,
  Upload,
  Check,
  UserPlus,
  MessageSquare,
  Trash2,
  Printer,
  UserCheck,
  X,
  Share2,
  Calendar,
  ArrowRight,
  CornerDownLeft,
  CheckCircle,
  CheckCircle2,
  Clock,
  GitBranch,
  Activity,
  Send,
  Edit3,
  ArrowLeft,
  ArrowUpRight,
  Image as ImageIcon,
  ChevronLeft,
  Loader2,
  FileCheck,
  Save,
  Award,
  Edit,
  Eye,
  Volume2,
  Sliders,
  Shield,
  BookOpen,
  Stamp,
  Move,
  Ruler,
  RefreshCw,
  Hash,
  Copy,
  CheckSquare,
  Square,
  Users,
  Layers,
  LayoutTemplate,
  HelpCircle,
  Sparkles,
  Filter,
  CheckCheck,
  XSquare,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Paperclip,
  Columns,
  Smartphone,
  Monitor,
  Undo,
  Redo,
  AlignRight,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Palette,
  Highlighter,
  Type,
  ListOrdered,
  List,
  Indent,
  Outdent,
  Link as LinkIcon,
  Tag,
  PlusCircle,
  Paintbrush,
  SlidersHorizontal,
  Table,
  Minus,
  FileSignature,
  FileSpreadsheet,
  ExternalLink,
  FileUp,
  Split,
  Globe,
  Layout,
} from "lucide-react";

import { DocumentEditor } from "@onlyoffice/document-editor-react";

import {
  type User,
  UserRole,
  type SystemSettings,
  type Company,
  type SecretariatLetter,
  SecretariatLetterStatus,
  type SecretariatLetterComment,
  type SecretariatLetterAttachment,
  type SecretariatCompanySettings,
  type SecretariatTemplate,
  type CompanyStampItem,
} from "../types";

import {
  getSecretariatLetters,
  saveSecretariatLetter,
  updateSecretariatLetter,
  deleteSecretariatLetter,
  getSecretariatSettings,
  saveSecretariatSettings,
  getSettings,
  uploadFile,
  getSecretariatTemplates,
  saveSecretariatTemplate,
  deleteSecretariatTemplate,
  importDocx,
} from "../services/storageService";

import { getUsers } from "../services/authService";
import { generateUUID, getCurrentShamsiDate } from "../constants";
import { shareElementToChat, openSendToChat } from "../services/chatShareService";
import { getServerHost, resolveImageUrl } from "../services/apiService";

const getRoleTitleInPersian = (role?: string): string => {
  if (!role) return "کاربر سیستم";
  switch (role.toUpperCase()) {
    case "ADMIN": return "مدیر سیستم";
    case "CEO": return "مدیر عامل";
    case "MANAGER": return "مدیر ارشد";
    case "COMMERCIAL": return "مدیر بازرگانی و فروش";
    case "WAREHOUSE": return "مدیریت انبار";
    case "FACTORY": return "مدیر کارخانه";
    case "SECURITY": return "مدیریت حراست";
    case "ACCOUNTING": return "مدیریت حسابداری";
    case "USER": return "پرسنل اداری";
    default: return role;
  }
};


class SafeEditorErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode; onReset?: () => void },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.warn('Caught error in editor boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-slate-300 gap-3 bg-slate-900/90 rounded-2xl border border-slate-700">
            <p className="text-amber-400 font-bold">عدم امکان برقراری ارتباط پایدار با افزونه ویرایشگر اسناد</p>
            <p className="text-slate-400 text-[11px]">می‌توانید به راحتی از ویرایشگر اداری داخلی (آفلاین) بدون نیاز به سرور جانبی استفاده کنید.</p>
            {this.props.onReset && (
              <button
                type="button"
                onClick={this.props.onReset}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md"
              >
                بازگشت به ویرایشگر اداری داخلی
              </button>
            )}
          </div>
        )
      );
    }
    return this.props.children;
  }
}

interface SafeOnlyOfficeEditorProps {
  id: string;
  documentServerUrl: string;
  config: any;
  events_onDocumentReady?: () => void;
  events_onError?: (event: any) => void;
  onLoadComponentError?: (errorCode: number, description: string) => void;
}

const SafeOnlyOfficeEditor: React.FC<SafeOnlyOfficeEditorProps> = ({
  id,
  documentServerUrl,
  config,
  events_onDocumentReady,
  events_onError,
  onLoadComponentError,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const editorInstanceRef = React.useRef<any>(null);
  const holderIdRef = React.useRef<string>('');

  React.useEffect(() => {
    let isMounted = true;
    const cleanUrl = (documentServerUrl || '').trim().replace(/\/+$/, '');
    const scriptUrl = cleanUrl + '/web-apps/apps/api/documents/api.js';
    const holderId = id + '_' + Math.random().toString(36).substring(2, 9);
    holderIdRef.current = holderId;

    const cleanupEditor = () => {
      if (editorInstanceRef.current && typeof editorInstanceRef.current.destroyEditor === 'function') {
        try {
          // Provide a dummy holder if element was unmounted so DocsAPI doesn't crash on null.innerHTML
          const existingEl = document.getElementById(holderId);
          if (!existingEl) {
            const dummy = document.createElement('div');
            dummy.id = holderId;
            dummy.style.display = 'none';
            document.body.appendChild(dummy);
            try {
              editorInstanceRef.current.destroyEditor();
            } finally {
              if (dummy.parentNode) dummy.parentNode.removeChild(dummy);
            }
          } else {
            editorInstanceRef.current.destroyEditor();
          }
        } catch (e) {
          console.warn('Silent destroyEditor catch:', e);
        }
        editorInstanceRef.current = null;
      }
    };

    const initEditor = () => {
      if (!isMounted || !containerRef.current) return;
      cleanupEditor();

      try {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          const holder = document.createElement('div');
          holder.id = holderId;
          holder.style.width = '100%';
          holder.style.height = '100%';
          containerRef.current.appendChild(holder);

          const DocsAPI = (window as any).DocsAPI;
          if (DocsAPI && typeof DocsAPI.DocEditor === 'function') {
            const fullConfig = {
              ...config,
              events: {
                ...config.events,
                onDocumentReady: () => {
                  if (isMounted) events_onDocumentReady?.();
                },
                onError: (err: any) => {
                  if (isMounted) events_onError?.(err);
                },
              },
            };
            editorInstanceRef.current = new DocsAPI.DocEditor(holder.id, fullConfig);
          } else {
            onLoadComponentError?.(-1, 'DocsAPI not initialized');
          }
        }
      } catch (err: any) {
        console.error('Failed to init DocsAPI.DocEditor:', err);
        onLoadComponentError?.(-2, err?.message || 'Error creating DocsAPI');
      }
    };

    let timeoutTimer: any = null;

    const existingScript = document.querySelector('script[src="' + scriptUrl + '"]');
    if (existingScript && (window as any).DocsAPI) {
      initEditor();
    } else {
      if (existingScript && existingScript.parentNode) {
        existingScript.parentNode.removeChild(existingScript);
      }
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => {
        if (!isMounted) return;
        if ((window as any).__ONLYOFFICE_PROXY_OFFLINE__) {
          onLoadComponentError?.(-5, 'سرور محلی ONLYOFFICE روی پورت 8088 در دسترس نیست.');
          return;
        }
        initEditor();
      };
      script.onerror = () => {
        if (isMounted) onLoadComponentError?.(-3, 'خطا در برقراری ارتباط با سرور ONLYOFFICE');
      };
      document.body.appendChild(script);

      // 7-second safeguard timeout to prevent infinite spinner
      timeoutTimer = setTimeout(() => {
        if (isMounted && !editorInstanceRef.current && !(window as any).DocsAPI) {
          onLoadComponentError?.(-4, 'پاسخی از سرور ONLYOFFICE دریافت نشد. لطفاً از ویرایشگر آفلاین استفاده کنید یا وضعیت سرور را بررسی نمایید.');
        }
      }, 7000);
    }

    return () => {
      isMounted = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      cleanupEditor();
      if (containerRef.current) {
        try {
          containerRef.current.innerHTML = '';
        } catch (e) {}
      }
    };
  }, [id, documentServerUrl, config?.document?.key]);

  return <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: '500px' }} />;
};

const toPersianDigits = (str: string | number | undefined | null): string => {
  if (str === undefined || str === null) return "";
  const englishDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  let result = String(str);
  for (let i = 0; i < 10; i++) {
    result = result.replace(
      new RegExp(englishDigits[i], "g"),
      persianDigits[i],
    );
  }
  return result;
};

const getAttachmentDisplay = (letter?: { hasAttachment?: boolean; attachmentDescription?: string; attachments?: any[] } | null): string => {
  if (!letter) return "ندارد";
  if (letter.hasAttachment) {
    if (letter.attachmentDescription && letter.attachmentDescription.trim()) {
      return `دارد (${letter.attachmentDescription.trim()})`;
    }
    if (letter.attachments && letter.attachments.length > 0) {
      return `دارد (${toPersianDigits(letter.attachments.length)} برگ)`;
    }
    return "دارد";
  }
  if (letter.attachments && letter.attachments.length > 0) {
    return `دارد (${toPersianDigits(letter.attachments.length)} برگ)`;
  }
  return "ندارد";
};

const getEffectiveLetterheadDisplayUrl = (settings?: SecretariatCompanySettings | null) => {
  if (!settings) return "";
  const rawImg = settings.letterheadUrl || "";
  const pdfUrl = settings.pdfLetterheadUrl || (rawImg.toLowerCase().endsWith(".pdf") ? rawImg : "");

  let url = "";
  if (rawImg && !rawImg.toLowerCase().endsWith(".pdf")) {
    url = rawImg;
  } else if (pdfUrl) {
    url = `/api/secretariat/pdf-preview?url=${encodeURIComponent(pdfUrl)}`;
  }
  if (!url) return "";
  return resolveImageUrl(url);
};

interface SecretariatModuleProps {
  currentUser: User;
}

const SecretariatModule: React.FC<SecretariatModuleProps> = ({
  currentUser,
}) => {
  // --- Data Loading & States ---
  const [letters, setLetters] = useState<SecretariatLetter[]>([]);
  const [secSettings, setSecSettings] = useState<SecretariatCompanySettings[]>(
    [],
  );
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(
    null,
  );
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Nav / UI Control ---
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [activeSection, setActiveSection] = useState<
    "headquarters" | "factory" | null
  >(null);
  const [activeTab, setActiveTab] = useState<
    "cartable" | "archive" | "templates" | "settings"
  >("cartable");
  const [settingsSubTab, setSettingsSubTab] = useState<
    "permissions" | "numbering" | "letterhead" | "stamp" | "word"
  >("permissions");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("all");

  // --- Search & Filters ---
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<
    "all" | "internal" | "incoming" | "outgoing"
  >("all");

  // --- Modals & Forms ---
  const [showNewLetterModal, setShowNewLetterModal] = useState(false);
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [editingLetterId, setEditingLetterId] = useState<string | null>(null);
  const [selectedLetterForView, setSelectedLetterForView] =
    useState<SecretariatLetter | null>(null);
  const [viewingWorkflowLetter, setViewingWorkflowLetter] =
    useState<SecretariatLetter | null>(null);
  const [letterViewZoom, setLetterViewZoom] = useState<number>(() =>
    typeof window !== "undefined" && window.innerWidth < 768
      ? Math.min(100, Math.max(35, Math.floor(((window.innerWidth - 24) / 794) * 100)))
      : 100
  );
  const [letterViewFullscreen, setLetterViewFullscreen] = useState(false);
  const [letterViewMobileTab, setLetterViewMobileTab] = useState<"preview" | "actions">("preview");
  const [letterViewWideMode, setLetterViewWideMode] = useState(false);

  const [isPrintMode, setIsPrintMode] = useState<SecretariatLetter | null>(
    null,
  );
  const [printPreviewZoom, setPrintPreviewZoom] = useState<number>(() =>
    typeof window !== "undefined" && window.innerWidth < 768
      ? Math.min(100, Math.max(35, Math.floor(((window.innerWidth - 24) / 794) * 100)))
      : 100
  );
  const [printPreviewFullscreen, setPrintPreviewFullscreen] = useState(false);
  const [isSharingLetter, setIsSharingLetter] = useState(false);

  const handleShareSecretariatLetterToChat = async (targetLetter?: SecretariatLetter | null) => {
    const letterToShare = targetLetter || isPrintMode || selectedLetterForView;
    if (!letterToShare) return;
    setIsSharingLetter(true);
    try {
      let el = document.getElementById("print-content-section");
      if (!el) {
        setIsPrintMode(letterToShare);
        await new Promise((r) => setTimeout(r, 450));
        el = document.getElementById("print-content-section");
      }
      if (!el) throw new Error("المان بخش چاپ نامه یافت نشد");
      await shareElementToChat(
        el,
        `Letter_${letterToShare.letterNumber || letterToShare.id}.jpg`,
        {
          defaultMessage: `📄 نامه اداری شماره ${letterToShare.letterNumber || '-'}: ${letterToShare.subject || ''}`,
          title: "ارسال نامه اداری به گفتگو"
        }
      );
    } catch (e) {
      console.error(e);
      alert("خطا در آماده‌سازی نامه اداری جهت ارسال به گفتگو");
    } finally {
      setIsSharingLetter(false);
    }
  };

  // --- New Letter Form State ---
  const initialFormState = {
    date: "",
    subject: "",
    content: "",
    sender: "",
    receiver: "",
    type: "internal" as "internal" | "incoming" | "outgoing",
    referredTo: [] as string[],
    attachments: [] as SecretariatLetterAttachment[],
    hasAttachment: false,
    attachmentDescription: "",
    addCompanyStamp: false,
    selectedStampIds: [] as string[],
    selectedStampId: "" as string,
    isPrivate: false,
    signOffText: "",
    signers: [] as { name: string; title: string; userId?: string }[],
    paperSize: "A4" as "A4" | "A5",
    orientation: "portrait" as "portrait" | "landscape",
    signaturePosition: "bottom_left" as
      "bottom_left" | "bottom_center" | "bottom_right",
    hideSubjectInLetter: true,
    hideSalutationInLetter: true,
  };
  const [newLetterForm, setNewLetterForm] = useState(initialFormState);

  // Format Painter (قلم‌موی استایل / کپی فرمت) state
  const [copiedFormats, setCopiedFormats] = useState<any | null>(null);
  const [isFormatPainterActive, setIsFormatPainterActive] = useState<boolean>(false);

  // Live Page Estimate helper
  const calculateEstimatedPages = (contentHtml: string, paperSize: string = "A4", orientation: string = "portrait") => {
    if (!contentHtml) return 1;
    const plainText = contentHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = plainText ? plainText.split(" ").length : 0;
    const imageCount = (contentHtml.match(/<img /gi) || []).length;
    const tableRowCount = (contentHtml.match(/<tr/gi) || []).length;
    const paragraphCount = (contentHtml.match(/<p/gi) || []).length;
    
    const wordsPerPage = paperSize === "A5" 
      ? (orientation === "landscape" ? 180 : 160) 
      : (orientation === "landscape" ? 300 : 380);
    const equivalentWordsFromImages = imageCount * 120;
    const equivalentWordsFromTables = tableRowCount * 18;
    const equivalentWordsFromParas = paragraphCount * 8;
    
    const totalEquivalentWords = wordCount + equivalentWordsFromImages + equivalentWordsFromTables + equivalentWordsFromParas;
    return Math.max(1, Math.ceil(totalEquivalentWords / wordsPerPage));
  };

  const resetForm = () => {
    const activeSettings = secSettings.find(
      (s) => s.companyId === selectedCompany?.id,
    );
    const defaultSignOff = activeSettings?.defaultSignOffText || "";
    setNewLetterForm({
      ...initialFormState,
      signOffText: defaultSignOff,
    });
    setEditingLetterId(null);
  };
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Auto-fit zoom for mobile web, Android & small screens
  // Auto-fit zoom for mobile web, Android & small screens (Safe standalone function)
  const getAutoFitZoom = () => {
    if (typeof window === "undefined") return 100;
    const screenW = window.innerWidth;
    if (screenW < 768) {
      // Standard A4 is 210mm (~794px). With 20px padding on mobile:
      return Math.min(100, Math.max(35, Math.floor(((screenW - 24) / 794) * 100)));
    }
    return 100;
  };

  const [editorZoom, setEditorZoom] = useState<number>(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return Math.min(100, Math.max(35, Math.floor(((window.innerWidth - 24) / 794) * 100)));
    }
    return 100;
  });
  const [commentText, setCommentText] = useState("");
  const [selectedReferrals, setSelectedReferrals] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Templates & Import States ---
  const [templates, setTemplates] = useState<SecretariatTemplate[]>([]);
  const [templateSearchTerm, setTemplateSearchTerm] = useState("");
  const [editingTemplate, setEditingTemplate] =
    useState<Partial<SecretariatTemplate> | null>(null);
  const [uploadingWordLetterhead, setUploadingWordLetterhead] = useState(false);
  const wordLetterheadInputRef = useRef<HTMLInputElement>(null);
  const [importingDocxFile, setImportingDocxFile] = useState(false);
  const docxImportInputRef = useRef<HTMLInputElement>(null);

  // --- Image Upload in Editor Ref ---
  const editorImageInputRef = useRef<HTMLInputElement>(null);

  // --- Workspace View Mode: Office Virtual Paper (Primary/Default - Zero Config & Offline), ONLYOFFICE Docs, or Split View ---
  const [editorViewMode, setEditorViewMode] = useState<"office" | "onlyoffice" | "split">(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("SECRETARIAT_PREFERRED_EDITOR_MODE") : null;
    if (saved === "office" || saved === "onlyoffice" || saved === "split") {
      return saved;
    }
    return "office";
  });

  const changeEditorViewMode = (mode: "office" | "onlyoffice" | "split") => {
    setEditorViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("SECRETARIAT_PREFERRED_EDITOR_MODE", mode);
    }
  };
  const [onlyOfficeDocServerUrl, setOnlyOfficeDocServerUrl] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("ONLYOFFICE_DOC_SERVER_URL") : null;
    if (saved && saved.trim()) {
      const clean = saved.trim();
      if (typeof window !== "undefined" && window.location.protocol === "https:" && clean.startsWith("http://") && !clean.includes("localhost") && !clean.includes("127.0.0.1")) {
        return `${window.location.origin}/onlyoffice-proxy`;
      }
      return clean;
    }
    if (typeof window !== "undefined" && window.location.origin) {
      return `${window.location.origin}/onlyoffice-proxy`;
    }
    return "/onlyoffice-proxy";
  });
  const [onlyOfficeDocKey, setOnlyOfficeDocKey] = useState<string>("");
  const [onlyOfficeFileUrl, setOnlyOfficeFileUrl] = useState<string>("");
  const [onlyOfficeTitle, setOnlyOfficeTitle] = useState<string>("نامه_اداری.docx");
  const [onlyOfficeCallbackUrl, setOnlyOfficeCallbackUrl] = useState<string>("");
  const [onlyOfficeLoading, setOnlyOfficeLoading] = useState<boolean>(false);
  const [onlyOfficeSyncing, setOnlyOfficeSyncing] = useState<boolean>(false);
  const [onlyOfficeInitialized, setOnlyOfficeInitialized] = useState<boolean>(false);
  const [onlyOfficeLoadError, setOnlyOfficeLoadError] = useState<string | null>(null);
  const [showOnlyOfficeSettingsModal, setShowOnlyOfficeSettingsModal] = useState<boolean>(false);
  const [customDocServerInput, setCustomDocServerInput] = useState<string>("");
  const [onlyOfficeHealthStatus, setOnlyOfficeHealthStatus] = useState<any>(null);
  const [checkingOnlyOfficeHealth, setCheckingOnlyOfficeHealth] = useState<boolean>(false);

  const [syncNotificationText, setSyncNotificationText] = useState<string | null>(null);

  // --- Word-Style Picture Formatting & 8-Handle Interactive Overlay ---
  const paperRef = useRef<HTMLDivElement>(null);
  const [selectedImgEl, setSelectedImgEl] = useState<HTMLImageElement | null>(null);
  const [selectedImgWidth, setSelectedImgWidth] = useState<string>("100%");
  const [selectedImgAlign, setSelectedImgAlign] = useState<"right" | "center" | "left" | "float-right" | "float-left">("center");
  const [selectedImgBorder, setSelectedImgBorder] = useState<"none" | "bordered" | "rounded" | "oval" | "shadow" | "double">("rounded");
  const [selectedImgBorderColor, setSelectedImgBorderColor] = useState<string>("#334155");
  const [selectedImgBorderWidth, setSelectedImgBorderWidth] = useState<number>(1);
  const [selectedImgWrap, setSelectedImgWrap] = useState<"inline" | "float-right" | "float-left" | "behind" | "in-front">("inline");
  const [selectedImgOpacity, setSelectedImgOpacity] = useState<number>(100);
  const [selectedImgIsWatermark, setSelectedImgIsWatermark] = useState<boolean>(false);
  const [selectedImgMultiply, setSelectedImgMultiply] = useState<boolean>(false);
  const [selectedImgPixelWidth, setSelectedImgPixelWidth] = useState<number>(350);
  const [showImageLayoutPopover, setShowImageLayoutPopover] = useState<boolean>(false);
  const [imgOverlayBox, setImgOverlayBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // --- Word-Style Table Management & Designer ---
  const [selectedTableEl, setSelectedTableEl] = useState<HTMLTableElement | null>(null);
  const [selectedCellEl, setSelectedCellEl] = useState<HTMLTableCellElement | null>(null);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableModalTab, setTableModalTab] = useState<"grid" | "custom" | "templates" | "paste">("grid");
  const [tableHoverGrid, setTableHoverGrid] = useState<{ r: number; c: number }>({ r: 3, c: 3 });
  const [customTableRows, setCustomTableRows] = useState(3);
  const [customTableCols, setCustomTableCols] = useState(3);
  const [sheetDataText, setSheetDataText] = useState("");
  const [quickWordDownloading, setQuickWordDownloading] = useState(false);

  // --- Color & Highlight Pickers ---
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showBgColorPicker, setShowBgColorPicker] = useState(false);
  const [activeTextColor, setActiveTextColor] = useState("#000000");
  const [activeBgColor, setActiveBgColor] = useState("#fef08a");

  // --- Editor References & Toolbar States ---
  const quillRef = useRef<any>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [activeMenu, setActiveMenu] = useState<
    | "file"
    | "edit"
    | "insert"
    | "format"
    | "tools"
    | "help"
    | "templates"
    | "office"
    | null
  >(null);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [showAdvancedOptionsModal, setShowAdvancedOptionsModal] = useState(false);

  const handleFindReplace = () => {
    if (!findText) return;
    const updated = newLetterForm.content.split(findText).join(replaceText);
    setNewLetterForm({ ...newLetterForm, content: updated });
  };

  const insertHTML = (html: string) => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      const range = quill.getSelection();
      const index = range ? range.index : quill.getLength();
      quill.clipboard.dangerouslyPasteHTML(index, html);
    }
  };

  const handleTTS = () => {
    if (typeof window === "undefined") return;
    if (isReadingAloud) {
      window.speechSynthesis.cancel();
      setIsReadingAloud(false);
    } else {
      const cleanText = newLetterForm.content.replace(/<[^>]*>/g, "").trim();
      if (!cleanText) return;
      setIsReadingAloud(true);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "fa-IR";
      utterance.onend = () => {
        setIsReadingAloud(false);
      };
      utterance.onerror = () => {
        setIsReadingAloud(false);
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleUndo = () => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      quill.history.undo();
    }
  };

  const handleRedo = () => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      quill.history.redo();
    }
  };

  const handleSelectAll = () => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      quill.setSelection(0, quill.getLength());
    }
  };

  const handleClearFormatting = () => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      const range = quill.getSelection();
      if (range) {
        quill.removeFormat(range.index, range.length);
      }
    }
  };

  const handleToggleFormatPainter = () => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    if (isFormatPainterActive) {
      setIsFormatPainterActive(false);
      setCopiedFormats(null);
      return;
    }

    const range = quill.getSelection();
    let formats = {};
    if (range && range.length > 0) {
      formats = quill.getFormat(range);
    } else if (range) {
      formats = quill.getFormat(range.index);
    } else {
      formats = quill.getFormat();
    }
    setCopiedFormats(formats);
    setIsFormatPainterActive(true);
  };

  useEffect(() => {
    if (!isFormatPainterActive || !copiedFormats) return;
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const handleSelectionChange = (range: any) => {
      if (range && range.length > 0 && isFormatPainterActive && copiedFormats) {
        Object.keys(copiedFormats).forEach((formatKey) => {
          quill.formatText(range.index, range.length, formatKey, copiedFormats[formatKey]);
        });
        setIsFormatPainterActive(false);
        setCopiedFormats(null);
      }
    };

    quill.on("selection-change", handleSelectionChange);
    return () => {
      quill.off("selection-change", handleSelectionChange);
    };
  }, [isFormatPainterActive, copiedFormats]);

  const applyCustomColor = (color: string) => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      quill.format("color", color);
      setActiveTextColor(color);
    }
    setShowTextColorPicker(false);
  };

  const applyCustomBackground = (color: string) => {
    const quill = quillRef.current?.getEditor();
    if (quill) {
      quill.format("background", color);
      setActiveBgColor(color);
    }
    setShowBgColorPicker(false);
  };

  // Image manipulation in editor
  // Helper: preserve consecutive and leading spaces inside HTML text nodes so Quill never collapses manual spacing
  const preserveLetterHtmlSpaces = (html: string): string => {
    if (!html || typeof html !== "string") return "";
    return html.replace(/>([^<]+)</g, (fullMatch, textContent: string) => {
      if (!textContent) return fullMatch;
      const preserved = textContent
        .replace(/^ +/gm, (m) => "\u00a0".repeat(m.length))
        .replace(/ {2,}/g, (m) => "\u00a0".repeat(m.length));
      return `>${preserved}<`;
    });
  };

  // Synchronize editor content with form state
  const syncEditorContent = (): string => {
    try {
      const quill = quillRef.current?.getEditor();
      if (quill && quill.root && typeof quill.root.innerHTML === "string") {
        const rawHtml = preserveLetterHtmlSpaces(quill.root.innerHTML);
        setNewLetterForm((prev) => ({
          ...prev,
          content: rawHtml,
        }));
        return rawHtml;
      }
    } catch (e) {
      console.warn("syncEditorContent guard:", e);
    }
    return preserveLetterHtmlSpaces(newLetterForm.content || "");
  };

  // Update bounding rect for image overlay handles
  const updateImgOverlayRect = () => {
    if (!selectedImgEl || !paperRef.current) {
      setImgOverlayBox(null);
      return;
    }
    try {
      const paperRect = paperRef.current.getBoundingClientRect();
      const imgRect = selectedImgEl.getBoundingClientRect();
      const scale = (editorZoom || 100) / 100;
      setImgOverlayBox({
        top: (imgRect.top - paperRect.top) / scale,
        left: (imgRect.left - paperRect.left) / scale,
        width: imgRect.width / scale,
        height: imgRect.height / scale,
      });
    } catch (e) {
      setImgOverlayBox(null);
    }
  };

  // Listen to Quill Editor clicks: detect Image or Table selection
  useEffect(() => {
    try {
      const quill = quillRef.current?.getEditor();
      if (!quill || !quill.root) return;

      const handleEditorClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.tagName === "IMG") {
          const img = target as HTMLImageElement;
          setSelectedImgEl(img);
          setSelectedTableEl(null);
          setSelectedCellEl(null);

          const opVal = img.style.opacity ? Math.round(parseFloat(img.style.opacity) * 100) : 100;
          setSelectedImgOpacity(opVal);
          setSelectedImgIsWatermark(img.style.position === "absolute");
          setSelectedImgMultiply(img.style.mixBlendMode === "multiply");
          setSelectedImgPixelWidth(img.offsetWidth || 350);

          if (img.style.borderRadius === "50%" || img.style.borderRadius === "9999px") {
            setSelectedImgBorder("oval");
          } else if (img.style.borderRadius === "14px" || img.style.borderRadius === "12px") {
            setSelectedImgBorder("rounded");
          } else if (img.style.boxShadow && img.style.boxShadow !== "none") {
            setSelectedImgBorder("shadow");
          } else if (img.style.border && img.style.border.includes("double")) {
            setSelectedImgBorder("double");
          } else if (img.style.border && img.style.border !== "none") {
            setSelectedImgBorder("bordered");
          } else {
            setSelectedImgBorder("none");
          }

          if (img.style.float === "right") setSelectedImgWrap("float-right");
          else if (img.style.float === "left") setSelectedImgWrap("float-left");
          else if (img.style.position === "absolute") setSelectedImgWrap("behind");
          else setSelectedImgWrap("inline");

          setTimeout(updateImgOverlayRect, 30);
        } else if (target && (target.tagName === "TD" || target.tagName === "TH" || target.closest("table"))) {
          const table = target.closest("table") as HTMLTableElement;
          const cell = (target.tagName === "TD" || target.tagName === "TH") ? (target as HTMLTableCellElement) : (target.closest("td, th") as HTMLTableCellElement);
          setSelectedTableEl(table);
          setSelectedCellEl(cell);
          setSelectedImgEl(null);
          setImgOverlayBox(null);
        } else if (
          !target.closest("#picture-format-ribbon") &&
          !target.closest("#table-management-ribbon") &&
          !target.closest(".img-interactive-overlay") &&
          !target.closest("#image-layout-popover")
        ) {
          setSelectedImgEl(null);
          setImgOverlayBox(null);
          setSelectedTableEl(null);
          setSelectedCellEl(null);
        }
      };

      const root = quill.root;
      if (root && typeof root.addEventListener === "function") {
        root.addEventListener("click", handleEditorClick);
        return () => {
          root.removeEventListener("click", handleEditorClick);
        };
      }
    } catch (e) {
      console.warn("quill click listener guard:", e);
    }
  }, [quillRef.current, newLetterForm.content, editorViewMode]);

  // Synchronize overlay box on scroll or resize
  useEffect(() => {
    if (!selectedImgEl) {
      setImgOverlayBox(null);
      return;
    }
    updateImgOverlayRect();
    const handleScrollOrResize = () => updateImgOverlayRect();
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [selectedImgEl, newLetterForm.content]);

  // Free Drag-to-Move handler for Floating & Overlay Images (Word Style) - Supports Touch & Mouse
  const startImageDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImgEl || !paperRef.current) return;

    const scale = (editorZoom || 100) / 100;
    const editorContainer =
      (selectedImgEl.closest(".ql-editor") as HTMLElement) || paperRef.current;
    const containerRect = editorContainer.getBoundingClientRect();
    const imgRect = selectedImgEl.getBoundingClientRect();
    const initialLeft = (imgRect.left - containerRect.left) / scale;
    const initialTop = (imgRect.top - containerRect.top) / scale;

    const isTouch = "touches" in e;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;

    // Convert to absolute positioning relative to .ql-editor so coordinates match 1:1 in Preview, Print & PDF
    if (selectedImgEl.style.position !== "absolute") {
      selectedImgEl.style.position = "absolute";
      selectedImgEl.style.left = `${Math.round(initialLeft)}px`;
      selectedImgEl.style.top = `${Math.round(initialTop)}px`;
      selectedImgEl.style.transform = "none";
      selectedImgEl.style.margin = "0";
      selectedImgEl.style.float = "none";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.zIndex = "20";
      setSelectedImgWrap("in-front");
    }

    const onPointerMove = (currX: number, currY: number) => {
      const deltaX = (currX - startX) / scale;
      const deltaY = (currY - startY) / scale;
      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;
      const maxW = containerRect.width / scale;
      const maxH = Math.max(containerRect.height / scale, 650);
      const imgW = imgRect.width / scale || 80;
      const imgH = imgRect.height / scale || 40;
      newLeft = Math.max(-40, Math.min(maxW - imgW + 40, newLeft));
      newTop = Math.max(-40, Math.min(maxH - imgH + 120, newTop));

      selectedImgEl.style.left = `${Math.round(newLeft)}px`;
      selectedImgEl.style.top = `${Math.round(newTop)}px`;
      selectedImgEl.style.transform = "none";
      selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
      updateImgOverlayRect();
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onPointerMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length > 0) {
        moveEvent.preventDefault();
        onPointerMove(moveEvent.touches[0].clientX, moveEvent.touches[0].clientY);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerUp);
      window.removeEventListener("touchcancel", handlePointerUp);
      if (selectedImgEl) {
        selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
      }
      updateImgOverlayRect();
      syncEditorContent();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);
    window.addEventListener("touchcancel", handlePointerUp);
  };

  // Interactive 8-Handle Drag Resizing (Word Style) - Supports Touch & Mouse
  const startImageInteractiveResize = (e: React.MouseEvent | React.TouchEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImgEl) return;

    const isTouch = "touches" in e;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;
    const rect = selectedImgEl.getBoundingClientRect();
    const startWidth = rect.width;
    const startHeight = rect.height;
    const aspectRatio = startHeight / (startWidth || 1);

    const onPointerMove = (currX: number, currY: number) => {
      const deltaX = currX - startX;
      const deltaY = currY - startY;
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (handle === "se") {
        newWidth = Math.max(40, startWidth + deltaX);
        newHeight = Math.round(newWidth * aspectRatio);
      } else if (handle === "sw") {
        newWidth = Math.max(40, startWidth - deltaX);
        newHeight = Math.round(newWidth * aspectRatio);
      } else if (handle === "ne") {
        newWidth = Math.max(40, startWidth + deltaX);
        newHeight = Math.round(newWidth * aspectRatio);
      } else if (handle === "nw") {
        newWidth = Math.max(40, startWidth - deltaX);
        newHeight = Math.round(newWidth * aspectRatio);
      } else if (handle === "e") {
        newWidth = Math.max(40, startWidth + deltaX);
      } else if (handle === "w") {
        newWidth = Math.max(40, startWidth - deltaX);
      } else if (handle === "s") {
        newHeight = Math.max(25, startHeight + deltaY);
        selectedImgEl.style.height = `${newHeight}px`;
        selectedImgEl.setAttribute("height", `${newHeight}`);
      } else if (handle === "n") {
        newHeight = Math.max(25, startHeight - deltaY);
        selectedImgEl.style.height = `${newHeight}px`;
        selectedImgEl.setAttribute("height", `${newHeight}`);
      }

      newWidth = Math.min(850, Math.round(newWidth));
      selectedImgEl.style.width = `${newWidth}px`;
      selectedImgEl.setAttribute("width", `${newWidth}`);
      if (handle !== "s" && handle !== "n") {
        selectedImgEl.style.height = "auto";
        selectedImgEl.removeAttribute("height");
      }
      selectedImgEl.style.maxWidth = "100%";
      selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
      setSelectedImgPixelWidth(newWidth);
      updateImgOverlayRect();
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onPointerMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length > 0) {
        moveEvent.preventDefault();
        onPointerMove(moveEvent.touches[0].clientX, moveEvent.touches[0].clientY);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handlePointerUp);
      window.removeEventListener("touchcancel", handlePointerUp);
      if (selectedImgEl) {
        selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
        selectedImgEl.setAttribute("width", `${selectedImgEl.offsetWidth || selectedImgPixelWidth}`);
      }
      updateImgOverlayRect();
      syncEditorContent();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handlePointerUp);
    window.addEventListener("touchcancel", handlePointerUp);
  };

  // Image manipulation in editor
  const updateSelectedImageWidth = (widthPercent: string) => {
    if (!selectedImgEl) return;
    selectedImgEl.style.width = widthPercent;
    selectedImgEl.style.maxWidth = "100%";
    selectedImgEl.style.height = "auto";
    selectedImgEl.setAttribute("width", widthPercent);
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgWidth(widthPercent);
    if (selectedImgEl.offsetWidth) {
      setSelectedImgPixelWidth(selectedImgEl.offsetWidth);
    }
    updateImgOverlayRect();
    syncEditorContent();
  };

  const updateSelectedImageWidthPx = (px: number) => {
    if (!selectedImgEl) return;
    selectedImgEl.style.width = `${px}px`;
    selectedImgEl.style.maxWidth = "100%";
    selectedImgEl.style.height = "auto";
    selectedImgEl.setAttribute("width", `${px}`);
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgPixelWidth(px);
    updateImgOverlayRect();
    syncEditorContent();
  };

  const updateSelectedImageOpacity = (opacityPercent: number) => {
    if (!selectedImgEl) return;
    const decimal = Math.max(0.05, Math.min(1, opacityPercent / 100));
    selectedImgEl.style.opacity = String(decimal);
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgOpacity(opacityPercent);
    syncEditorContent();
  };

  const toggleSelectedImageWatermark = () => {
    if (!selectedImgEl) return;
    const nextVal = !selectedImgIsWatermark;
    if (nextVal) {
      selectedImgEl.style.position = "absolute";
      selectedImgEl.style.top = "50%";
      selectedImgEl.style.left = "50%";
      selectedImgEl.style.transform = "translate(-50%, -50%)";
      selectedImgEl.style.zIndex = "0";
      selectedImgEl.style.opacity = selectedImgEl.style.opacity || "0.15";
      selectedImgEl.style.pointerEvents = "auto";
      selectedImgEl.style.margin = "0";
      selectedImgEl.style.float = "none";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.cursor = "move";
      setSelectedImgOpacity(Math.round(parseFloat(selectedImgEl.style.opacity || "0.15") * 100));
      setSelectedImgWrap("behind");
    } else {
      selectedImgEl.style.position = "relative";
      selectedImgEl.style.top = "auto";
      selectedImgEl.style.left = "auto";
      selectedImgEl.style.transform = "none";
      selectedImgEl.style.zIndex = "auto";
      selectedImgEl.style.opacity = "1";
      selectedImgEl.style.display = "block";
      selectedImgEl.style.margin = "12px auto";
      selectedImgEl.style.cursor = "default";
      setSelectedImgOpacity(100);
      setSelectedImgWrap("inline");
    }
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgIsWatermark(nextVal);
    updateImgOverlayRect();
    syncEditorContent();
  };

  const toggleSelectedImageMultiply = () => {
    if (!selectedImgEl) return;
    const nextVal = !selectedImgMultiply;
    selectedImgEl.style.mixBlendMode = nextVal ? "multiply" : "normal";
    
    // When activating transparent background (e.g. stamp/signature), place it in front of text relative to .ql-editor
    if (nextVal && selectedImgWrap === "inline") {
      const scale = (editorZoom || 100) / 100;
      const editorContainer =
        (selectedImgEl.closest(".ql-editor") as HTMLElement) || paperRef.current;
      if (editorContainer) {
        const containerRect = editorContainer.getBoundingClientRect();
        const imgRect = selectedImgEl.getBoundingClientRect();
        const curLeft = Math.round(Math.max(0, (imgRect.left - containerRect.left) / scale));
        const curTop = Math.round(Math.max(0, (imgRect.top - containerRect.top) / scale));
        selectedImgEl.style.position = "absolute";
        selectedImgEl.style.left = `${curLeft}px`;
        selectedImgEl.style.top = `${curTop}px`;
        selectedImgEl.style.transform = "none";
        selectedImgEl.style.margin = "0";
        selectedImgEl.style.float = "none";
        selectedImgEl.style.display = "inline-block";
        selectedImgEl.style.zIndex = "20";
        selectedImgEl.style.cursor = "move";
        setSelectedImgWrap("in-front");
      }
    }
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgMultiply(nextVal);
    updateImgOverlayRect();
    syncEditorContent();
  };

  const updateSelectedImageAlign = (align: "right" | "center" | "left" | "float-right" | "float-left") => {
    if (!selectedImgEl) return;
    if (align === "float-right") {
      selectedImgEl.style.position = "relative";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.float = "right";
      selectedImgEl.style.margin = "8px 0 8px 16px";
      selectedImgEl.style.zIndex = "auto";
      selectedImgEl.style.top = "auto";
      selectedImgEl.style.left = "auto";
      selectedImgEl.style.transform = "none";
      setSelectedImgWrap("float-right");
      setSelectedImgIsWatermark(false);
    } else if (align === "float-left") {
      selectedImgEl.style.position = "relative";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.float = "left";
      selectedImgEl.style.margin = "8px 16px 8px 0";
      selectedImgEl.style.zIndex = "auto";
      selectedImgEl.style.top = "auto";
      selectedImgEl.style.left = "auto";
      selectedImgEl.style.transform = "none";
      setSelectedImgWrap("float-left");
      setSelectedImgIsWatermark(false);
    } else {
      selectedImgEl.style.float = "none";
      selectedImgEl.style.display = "block";
      if (align === "right") {
        selectedImgEl.style.marginLeft = "auto";
        selectedImgEl.style.marginRight = "0";
      } else if (align === "center") {
        selectedImgEl.style.marginLeft = "auto";
        selectedImgEl.style.marginRight = "auto";
      } else {
        selectedImgEl.style.marginLeft = "0";
        selectedImgEl.style.marginRight = "auto";
      }
    }
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgAlign(align);
    updateImgOverlayRect();
    syncEditorContent();
  };

  const updateSelectedImageWrap = (wrap: "inline" | "float-right" | "float-left" | "behind" | "in-front") => {
    if (!selectedImgEl) return;
    if (wrap === "inline") {
      selectedImgEl.style.position = "relative";
      selectedImgEl.style.float = "none";
      selectedImgEl.style.display = "block";
      selectedImgEl.style.margin = "12px auto";
      selectedImgEl.style.zIndex = "auto";
      selectedImgEl.style.top = "auto";
      selectedImgEl.style.left = "auto";
      selectedImgEl.style.transform = "none";
      selectedImgEl.style.cursor = "default";
      setSelectedImgIsWatermark(false);
    } else if (wrap === "float-right") {
      selectedImgEl.style.position = "relative";
      selectedImgEl.style.float = "right";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.margin = "8px 0 8px 16px";
      selectedImgEl.style.zIndex = "auto";
      selectedImgEl.style.top = "auto";
      selectedImgEl.style.left = "auto";
      selectedImgEl.style.transform = "none";
      selectedImgEl.style.cursor = "default";
      setSelectedImgIsWatermark(false);
    } else if (wrap === "float-left") {
      selectedImgEl.style.position = "relative";
      selectedImgEl.style.float = "left";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.margin = "8px 16px 8px 0";
      selectedImgEl.style.zIndex = "auto";
      selectedImgEl.style.top = "auto";
      selectedImgEl.style.left = "auto";
      selectedImgEl.style.transform = "none";
      selectedImgEl.style.cursor = "default";
      setSelectedImgIsWatermark(false);
    } else if (wrap === "behind") {
      const scale = (editorZoom || 100) / 100;
      const editorContainer =
        (selectedImgEl.closest(".ql-editor") as HTMLElement) || paperRef.current;
      if (editorContainer && selectedImgEl.style.position !== "absolute") {
        const containerRect = editorContainer.getBoundingClientRect();
        const imgRect = selectedImgEl.getBoundingClientRect();
        const curLeft = Math.round(Math.max(0, (imgRect.left - containerRect.left) / scale));
        const curTop = Math.round(Math.max(0, (imgRect.top - containerRect.top) / scale));
        selectedImgEl.style.left = `${curLeft}px`;
        selectedImgEl.style.top = `${curTop}px`;
      } else if (!selectedImgEl.style.top) {
        selectedImgEl.style.top = "50%";
        selectedImgEl.style.left = "50%";
        selectedImgEl.style.transform = "translate(-50%, -50%)";
      }
      selectedImgEl.style.position = "absolute";
      selectedImgEl.style.zIndex = "0";
      selectedImgEl.style.float = "none";
      selectedImgEl.style.margin = "0";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.cursor = "move";
      selectedImgEl.style.opacity = selectedImgEl.style.opacity || "0.15";
      setSelectedImgIsWatermark(true);
      setSelectedImgOpacity(Math.round(parseFloat(selectedImgEl.style.opacity || "0.15") * 100));
    } else if (wrap === "in-front") {
      const scale = (editorZoom || 100) / 100;
      const editorContainer =
        (selectedImgEl.closest(".ql-editor") as HTMLElement) || paperRef.current;
      if (editorContainer && selectedImgEl.style.position !== "absolute") {
        const containerRect = editorContainer.getBoundingClientRect();
        const imgRect = selectedImgEl.getBoundingClientRect();
        const curLeft = Math.round(Math.max(0, (imgRect.left - containerRect.left) / scale));
        const curTop = Math.round(Math.max(0, (imgRect.top - containerRect.top) / scale));
        selectedImgEl.style.left = `${curLeft}px`;
        selectedImgEl.style.top = `${curTop}px`;
      } else if (!selectedImgEl.style.top) {
        selectedImgEl.style.top = "100px";
        selectedImgEl.style.left = "100px";
      }
      selectedImgEl.style.position = "absolute";
      selectedImgEl.style.float = "none";
      selectedImgEl.style.display = "inline-block";
      selectedImgEl.style.margin = "0";
      selectedImgEl.style.zIndex = "20";
      selectedImgEl.style.transform = "none";
      selectedImgEl.style.cursor = "move";
      selectedImgEl.style.pointerEvents = "auto";
      setSelectedImgIsWatermark(false);
    }
    selectedImgEl.setAttribute("style", selectedImgEl.style.cssText);
    setSelectedImgWrap(wrap);
    setShowImageLayoutPopover(false);
    updateImgOverlayRect();
    syncEditorContent();
  };

  const updateSelectedImageBorder = (borderStyle: "none" | "bordered" | "rounded" | "oval" | "shadow" | "double") => {
    if (!selectedImgEl) return;
    if (borderStyle === "none") {
      selectedImgEl.style.borderRadius = "0px";
      selectedImgEl.style.border = "none";
      selectedImgEl.style.boxShadow = "none";
    } else if (borderStyle === "rounded") {
      selectedImgEl.style.borderRadius = "14px";
      selectedImgEl.style.border = "none";
      selectedImgEl.style.boxShadow = "none";
    } else if (borderStyle === "oval") {
      selectedImgEl.style.borderRadius = "50%";
      selectedImgEl.style.border = `${selectedImgBorderWidth}px solid ${selectedImgBorderColor}`;
      selectedImgEl.style.boxShadow = "none";
    } else if (borderStyle === "bordered") {
      selectedImgEl.style.borderRadius = "4px";
      selectedImgEl.style.border = `${selectedImgBorderWidth}px solid ${selectedImgBorderColor}`;
      selectedImgEl.style.boxShadow = "none";
    } else if (borderStyle === "double") {
      selectedImgEl.style.borderRadius = "4px";
      selectedImgEl.style.border = `4px double ${selectedImgBorderColor}`;
      selectedImgEl.style.boxShadow = "none";
    } else if (borderStyle === "shadow") {
      selectedImgEl.style.borderRadius = "8px";
      selectedImgEl.style.border = "1px solid #e2e8f0";
      selectedImgEl.style.boxShadow = "0 14px 28px -4px rgba(0, 0, 0, 0.22), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";
    }
    setSelectedImgBorder(borderStyle);
    updateImgOverlayRect();
    syncEditorContent();
  };

  const updateSelectedImageBorderColor = (color: string) => {
    if (!selectedImgEl) return;
    setSelectedImgBorderColor(color);
    if (selectedImgBorder === "bordered" || selectedImgBorder === "oval" || selectedImgBorder === "double") {
      selectedImgEl.style.borderColor = color;
      syncEditorContent();
    }
  };

  const updateSelectedImageBorderWidth = (width: number) => {
    if (!selectedImgEl) return;
    setSelectedImgBorderWidth(width);
    if (selectedImgBorder === "bordered" || selectedImgBorder === "oval") {
      selectedImgEl.style.borderWidth = `${width}px`;
      syncEditorContent();
    }
  };

  const rotateSelectedImage = (degreesToAdd: number) => {
    if (!selectedImgEl) return;
    const currentTransform = selectedImgEl.style.transform || "";
    const match = currentTransform.match(/rotate\((-?\d+)deg\)/);
    const currentDeg = match ? parseInt(match[1], 10) : 0;
    const nextDeg = (currentDeg + degreesToAdd) % 360;
    if (nextDeg === 0) {
      selectedImgEl.style.transform = selectedImgIsWatermark ? "translate(-50%, -50%)" : "none";
    } else {
      selectedImgEl.style.transform = selectedImgIsWatermark
        ? `translate(-50%, -50%) rotate(${nextDeg}deg)`
        : `rotate(${nextDeg}deg)`;
    }
    updateImgOverlayRect();
    syncEditorContent();
  };

  const deleteSelectedImage = () => {
    if (!selectedImgEl) return;
    selectedImgEl.remove();
    setSelectedImgEl(null);
    setImgOverlayBox(null);
    syncEditorContent();
  };

  // --- Table Operations ---
  const insertTableRowAbove = () => {
    if (!selectedCellEl || !selectedTableEl) return;
    const row = selectedCellEl.closest("tr");
    if (!row) return;
    const numCells = row.children.length;
    const newRow = document.createElement("tr");
    for (let i = 0; i < numCells; i++) {
      const td = document.createElement("td");
      td.style.border = "1px solid #cbd5e1";
      td.style.padding = "8px 12px";
      td.style.textAlign = "right";
      td.innerHTML = "&nbsp;";
      newRow.appendChild(td);
    }
    row.parentNode?.insertBefore(newRow, row);
    syncEditorContent();
  };

  const insertTableRowBelow = () => {
    if (!selectedCellEl || !selectedTableEl) return;
    const row = selectedCellEl.closest("tr");
    if (!row) return;
    const numCells = row.children.length;
    const newRow = document.createElement("tr");
    for (let i = 0; i < numCells; i++) {
      const td = document.createElement("td");
      td.style.border = "1px solid #cbd5e1";
      td.style.padding = "8px 12px";
      td.style.textAlign = "right";
      td.innerHTML = "&nbsp;";
      newRow.appendChild(td);
    }
    row.parentNode?.insertBefore(newRow, row.nextSibling);
    syncEditorContent();
  };

  const insertTableColRight = () => {
    if (!selectedCellEl || !selectedTableEl) return;
    const cellIdx = selectedCellEl.cellIndex;
    const rows = Array.from(selectedTableEl.querySelectorAll("tr"));
    rows.forEach((r) => {
      const isHeaderRow = r.querySelector("th") !== null;
      const newCell = document.createElement(isHeaderRow ? "th" : "td");
      newCell.style.border = "1px solid #cbd5e1";
      newCell.style.padding = "8px 12px";
      newCell.style.textAlign = "right";
      newCell.innerHTML = isHeaderRow ? "عنوان جدید" : "&nbsp;";
      const targetCell = r.children[cellIdx];
      if (targetCell) {
        r.insertBefore(newCell, targetCell);
      } else {
        r.appendChild(newCell);
      }
    });
    syncEditorContent();
  };

  const insertTableColLeft = () => {
    if (!selectedCellEl || !selectedTableEl) return;
    const cellIdx = selectedCellEl.cellIndex;
    const rows = Array.from(selectedTableEl.querySelectorAll("tr"));
    rows.forEach((r) => {
      const isHeaderRow = r.querySelector("th") !== null;
      const newCell = document.createElement(isHeaderRow ? "th" : "td");
      newCell.style.border = "1px solid #cbd5e1";
      newCell.style.padding = "8px 12px";
      newCell.style.textAlign = "right";
      newCell.innerHTML = isHeaderRow ? "عنوان جدید" : "&nbsp;";
      const targetCell = r.children[cellIdx];
      if (targetCell && targetCell.nextSibling) {
        r.insertBefore(newCell, targetCell.nextSibling);
      } else {
        r.appendChild(newCell);
      }
    });
    syncEditorContent();
  };

  const deleteCurrentTableRow = () => {
    if (!selectedCellEl || !selectedTableEl) return;
    const row = selectedCellEl.closest("tr");
    if (!row) return;
    row.remove();
    setSelectedCellEl(null);
    syncEditorContent();
  };

  const deleteCurrentTableCol = () => {
    if (!selectedCellEl || !selectedTableEl) return;
    const cellIdx = selectedCellEl.cellIndex;
    const rows = Array.from(selectedTableEl.querySelectorAll("tr"));
    rows.forEach((r) => {
      if (r.children[cellIdx]) {
        r.children[cellIdx].remove();
      }
    });
    setSelectedCellEl(null);
    syncEditorContent();
  };

  const deleteEntireTable = () => {
    if (!selectedTableEl) return;
    selectedTableEl.remove();
    setSelectedTableEl(null);
    setSelectedCellEl(null);
    syncEditorContent();
  };

  const setTableCellBg = (color: string) => {
    if (!selectedCellEl) return;
    selectedCellEl.style.backgroundColor = color;
    syncEditorContent();
  };

  const applyTableTheme = (theme: "formal-navy" | "modern-slate" | "zebra-emerald" | "minimal-border") => {
    if (!selectedTableEl) return;
    selectedTableEl.style.width = "100%";
    selectedTableEl.style.borderCollapse = "collapse";
    selectedTableEl.style.margin = "16px 0";
    selectedTableEl.style.direction = "rtl";

    const rows = Array.from(selectedTableEl.querySelectorAll("tr"));
    rows.forEach((r, idx) => {
      const isHeader = idx === 0;
      const cells = Array.from(r.children) as HTMLElement[];
      cells.forEach((c) => {
        c.style.padding = "9px 12px";
        c.style.fontSize = "12px";
        c.style.textAlign = "right";
        if (theme === "formal-navy") {
          c.style.border = "1px solid #94a3b8";
          if (isHeader) {
            c.style.backgroundColor = "#1e3a8a";
            c.style.color = "#ffffff";
            c.style.fontWeight = "bold";
          } else {
            c.style.backgroundColor = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
            c.style.color = "#0f172a";
          }
        } else if (theme === "modern-slate") {
          c.style.border = "1px solid #cbd5e1";
          if (isHeader) {
            c.style.backgroundColor = "#334155";
            c.style.color = "#ffffff";
            c.style.fontWeight = "bold";
          } else {
            c.style.backgroundColor = idx % 2 === 0 ? "#f1f5f9" : "#ffffff";
            c.style.color = "#1e293b";
          }
        } else if (theme === "zebra-emerald") {
          c.style.border = "1px solid #a7f3d0";
          if (isHeader) {
            c.style.backgroundColor = "#065f46";
            c.style.color = "#ffffff";
            c.style.fontWeight = "bold";
          } else {
            c.style.backgroundColor = idx % 2 === 0 ? "#ecfdf5" : "#ffffff";
            c.style.color = "#064e3b";
          }
        } else if (theme === "minimal-border") {
          c.style.border = "none";
          c.style.borderBottom = "1px solid #e2e8f0";
          if (isHeader) {
            c.style.backgroundColor = "transparent";
            c.style.borderBottom = "2px solid #0f172a";
            c.style.color = "#0f172a";
            c.style.fontWeight = "bold";
          } else {
            c.style.backgroundColor = "transparent";
            c.style.color = "#334155";
          }
        }
      });
    });
    syncEditorContent();
  };

  const handleInsertCustomTable = (rows: number, cols: number, theme: "formal-navy" | "modern-slate" | "zebra-emerald" | "minimal-border" = "formal-navy") => {
    let headerBg = "#1e3a8a";
    let headerColor = "#ffffff";
    let borderColor = "#94a3b8";

    if (theme === "modern-slate") {
      headerBg = "#334155";
      borderColor = "#cbd5e1";
    } else if (theme === "zebra-emerald") {
      headerBg = "#065f46";
      borderColor = "#a7f3d0";
    } else if (theme === "minimal-border") {
      headerBg = "#f8fafc";
      headerColor = "#0f172a";
      borderColor = "#cbd5e1";
    }

    let tableHtml = `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit;"><tbody>`;
    for (let r = 0; r < rows; r++) {
      const isHeader = r === 0;
      tableHtml += `<tr style="${isHeader ? `background-color: ${headerBg}; font-weight: bold; color: ${headerColor};` : r % 2 === 1 ? "background-color: #f8fafc;" : ""}">`;
      for (let c = 0; c < cols; c++) {
        const title = isHeader ? `ستون ${toPersianDigits(c + 1)}` : "&nbsp;";
        if (isHeader) {
          tableHtml += `<th style="border: 1px solid ${borderColor}; padding: 9px 12px; text-align: right; color: ${headerColor}; font-size: 12px;">${title}</th>`;
        } else {
          tableHtml += `<td style="border: 1px solid ${borderColor}; padding: 8px 12px; text-align: right; font-size: 12px;">&nbsp;</td>`;
        }
      }
      tableHtml += "</tr>";
    }
    tableHtml += "</tbody></table><p><br/></p>";
    insertHTML(tableHtml);
    setShowTableModal(false);
  };

  const handleInsertCorporateTemplate = (templateType: "invoice" | "tech-specs" | "project-wbs" | "meeting-attendance") => {
    let tableHtml = "";
    if (templateType === "invoice") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit;">
          <thead>
            <tr style="background-color: #1e3a8a; color: white;">
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 8%; text-align: center;">ردیف</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 40%; text-align: right;">شرح کالا / خدمات</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 10%; text-align: center;">تعداد</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 10%; text-align: center;">واحد</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 16%; text-align: center;">بهای واحد (ریال)</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 16%; text-align: center;">بهای کل (ریال)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۱</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">عدد</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td></tr>
            <tr style="background-color: #f8fafc;"><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۲</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">دستگاه</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td></tr>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۳</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">متر</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td></tr>
            <tr style="background-color: #f1f5f9; font-weight: bold;"><td colspan="5" style="border: 1px solid #cbd5e1; padding: 8px; text-align: left;">مجموع کل:</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td></tr>
          </tbody>
        </table><p><br/></p>`;
    } else if (templateType === "tech-specs") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit;">
          <thead>
            <tr style="background-color: #334155; color: white;">
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 8%; text-align: center;">ردیف</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 28%; text-align: right;">پارامتر / ویژگی فنی</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 32%; text-align: right;">مشخصات مورد درخواست</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 32%; text-align: right;">پیشنهاد تأمین‌کننده</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۱</td><td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">برند و کشور سازنده</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td></tr>
            <tr style="background-color: #f8fafc;"><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۲</td><td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">استاندارد کیفی و گواهینامه‌ها</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td></tr>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۳</td><td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold;">مدت گارانتی و خدمات پس از فروش</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td></tr>
          </tbody>
        </table><p><br/></p>`;
    } else if (templateType === "project-wbs") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit;">
          <thead>
            <tr style="background-color: #065f46; color: white;">
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 8%; text-align: center;">ردیف</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 36%; text-align: right;">شرح اقدام / فاز عملیاتی</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 20%; text-align: center;">مسئول اجرا</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 18%; text-align: center;">مهلت انجام</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 18%; text-align: center;">وضعیت پیشرفت</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۱</td><td style="border: 1px solid #cbd5e1; padding: 8px;">فاز اول: تحلیل و برنامه‌ریزی اولیه</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #059669; font-weight: bold;">انجام شده</td></tr>
            <tr style="background-color: #f8fafc;"><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۲</td><td style="border: 1px solid #cbd5e1; padding: 8px;">فاز دوم: تأمین اقلام و تجهیزات</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #d97706; font-weight: bold;">در حال اجرا</td></tr>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۳</td><td style="border: 1px solid #cbd5e1; padding: 8px;">فاز سوم: تحویل نهایی و صورتجلسه</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center; color: #64748b;">در انتظار</td></tr>
          </tbody>
        </table><p><br/></p>`;
    } else if (templateType === "meeting-attendance") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit;">
          <thead>
            <tr style="background-color: #1e293b; color: white;">
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 8%; text-align: center;">ردیف</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 32%; text-align: right;">نام و نام خانوادگی</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 30%; text-align: right;">سمت سازمانی / واحد</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 15%; text-align: center;">وضعیت حضور</th>
              <th style="border: 1px solid #cbd5e1; padding: 8px; width: 15%; text-align: center;">امضا</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۱</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">حاضر</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td></tr>
            <tr style="background-color: #f8fafc;"><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۲</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">حاضر</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td></tr>
            <tr><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۳</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td><td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">حاضر</td><td style="border: 1px solid #cbd5e1; padding: 8px;">&nbsp;</td></tr>
          </tbody>
        </table><p><br/></p>`;
    }
    if (tableHtml) {
      insertHTML(tableHtml);
      setShowTableModal(false);
    }
  };

  // --- ONLYOFFICE Document Server Handlers ---
  const checkOnlyOfficeHealth = async (targetUrl?: string) => {
    try {
      setCheckingOnlyOfficeHealth(true);
      const query = targetUrl ? `?target=${encodeURIComponent(targetUrl)}` : "";
      const res = await fetch(`/api/secretariat/onlyoffice/health${query}`);
      if (res.ok) {
        const data = await res.json();
        setOnlyOfficeHealthStatus(data);
        return data;
      }
    } catch (err) {
      console.error("ONLYOFFICE Health check error:", err);
    } finally {
      setCheckingOnlyOfficeHealth(false);
    }
    return null;
  };

  const handlePrepareOnlyOfficeDoc = async (forceRefresh = false) => {
    if (onlyOfficeDocKey && !forceRefresh) return;
    try {
      setOnlyOfficeLoading(true);
      setOnlyOfficeLoadError(null);

      // Run health check in background
      checkOnlyOfficeHealth(onlyOfficeDocServerUrl);

      const res = await fetch("/api/secretariat/onlyoffice/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterId: editingLetterId || "",
          subject: newLetterForm.subject || "نامه اداری",
          content: newLetterForm.content || "",
          receiver: newLetterForm.receiver || "",
          sender: newLetterForm.sender || "",
          date: newLetterForm.date || "",
          letterNumber: editingLetterId ? (letters.find(l => l.id === editingLetterId)?.letterNumber || "Draft") : "Draft",
          signers: newLetterForm.signers || [],
          paperSize: newLetterForm.paperSize || "A4",
          orientation: newLetterForm.orientation || "portrait",
          companyId: (newLetterForm as any).companyId || selectedCompany?.id || "",
          noLetterhead: (newLetterForm as any).noLetterhead || false,
        }),
      });

      if (!res.ok) {
        throw new Error("خطا در ایجاد سند برای ONLYOFFICE");
      }

      const data = await res.json();
      setOnlyOfficeDocKey(data.docKey);
      setOnlyOfficeFileUrl(data.fileUrl);
      setOnlyOfficeTitle(data.title || "نامه_اداری.docx");
      setOnlyOfficeCallbackUrl(data.callbackUrl);
      setOnlyOfficeInitialized(true);
    } catch (err: any) {
      console.error("ONLYOFFICE Prepare error:", err);
      setOnlyOfficeLoadError(err.message || "خطا در برقراری ارتباط با سرور اسناد ONLYOFFICE");
    } finally {
      setOnlyOfficeLoading(false);
    }
  };

  const handleSyncFromOnlyOffice = async () => {
    if (!onlyOfficeDocKey) {
      handlePrepareOnlyOfficeDoc(true);
      return;
    }
    try {
      setOnlyOfficeSyncing(true);
      const res = await fetch(`/api/secretariat/onlyoffice/get-content/${onlyOfficeDocKey}`);
      if (!res.ok) throw new Error("خطا در دریافت محتوای همگام شده");
      const data = await res.json();
      if (data.htmlContent) {
        setNewLetterForm((prev) => ({
          ...prev,
          content: data.htmlContent,
        }));
        setSyncNotificationText("✓ متن ویرایش شده از ONLYOFFICE با موفقیت با سربرگ دبیرخانه همگام‌سازی شد.");
        setTimeout(() => setSyncNotificationText(null), 5000);
      } else {
        setSyncNotificationText("✓ محتوای سند با ONLYOFFICE همگام است.");
        setTimeout(() => setSyncNotificationText(null), 4000);
      }
    } catch (err: any) {
      console.error("ONLYOFFICE Sync error:", err);
    } finally {
      setOnlyOfficeSyncing(false);
    }
  };

  const handleSaveOnlyOfficeServerUrl = (url: string) => {
    let clean = url.trim().replace(/\/+$/, "");
    if (!clean) clean = "https://documentserver.onlyoffice.com";
    setOnlyOfficeDocServerUrl(clean);
    localStorage.setItem("ONLYOFFICE_DOC_SERVER_URL", clean);
    setOnlyOfficeLoadError(null);
    setShowOnlyOfficeSettingsModal(false);
    handlePrepareOnlyOfficeDoc(true);
  };

  // Auto-prepare ONLYOFFICE when opening editor or switching mode
  useEffect(() => {
    if (showNewLetterModal && (editorViewMode === "onlyoffice" || editorViewMode === "split")) {
      handlePrepareOnlyOfficeDoc();
    }
  }, [showNewLetterModal, editorViewMode]);

  const handleEditorImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) {
        insertHTML(`<img src="${base64}" alt="تصویر پیوست" style="width: 60%; display: block; margin: 12px auto; border-radius: 8px; max-width: 100%; height: auto;" />`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Quick Microsoft Word (.docx) export on the fly with comprehensive metadata
  const handleQuickDocxDownload = async (targetLetter?: Partial<SecretariatLetter>, noLetterhead = false) => {
    try {
      setQuickWordDownloading(true);
      const latestEditorHtml = !targetLetter ? syncEditorContent() : undefined;
      const source = targetLetter || newLetterForm;
      const letterNum =
        (targetLetter as any)?.letterNumber ||
        (editingLetterId
          ? letters.find((l) => l.id === editingLetterId)?.letterNumber ||
            getNextLetterNumber(selectedCompany, activeSection)
          : getNextLetterNumber(selectedCompany, activeSection));
      const hasAttach =
        source.hasAttachment ??
        ((source.attachments && source.attachments.length > 0) || false);
      const attachDesc = source.attachmentDescription || "";

      const res = await fetch("/api/secretariat/quick-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: source.subject || "نامه اداری",
          content: latestEditorHtml ?? source.content ?? "",
          receiver: source.receiver || "",
          sender: source.sender || "",
          date: source.date || "",
          letterNumber: letterNum,
          signers: source.signers || [],
          paperSize: source.paperSize || "A4",
          orientation: source.orientation || "portrait",
          companyId: (source as any).companyId || selectedCompany?.id || "",
          noLetterhead: noLetterhead || Boolean((source as any).noLetterhead),
          hasAttachment: hasAttach,
          attachmentDescription: attachDesc,
          attachments: source.attachments || [],
          addCompanyStamp: source.addCompanyStamp || false,
          hideSalutationInLetter: source.hideSalutationInLetter ?? true,
          hideSubjectInLetter: source.hideSubjectInLetter ?? true,
        }),
      });
      if (!res.ok) throw new Error("خطا در ایجاد خروجی فایل Word");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeNum = String(letterNum || "Letter").replace(/[\/\\]/g, "_");
      a.download = `Letter_${safeNum}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("خطا در ایجاد و دانلود فایل Word: " + e.message);
    } finally {
      setQuickWordDownloading(false);
    }
  };

  // Quick Vector PDF (300 DPI) export on the fly for both Drafts ("preview_only") and Saved Letters
  const handleQuickPdfDownload = async (targetLetter?: Partial<SecretariatLetter>, noLetterhead = false) => {
    try {
      const latestEditorHtml = !targetLetter ? syncEditorContent() : undefined;
      const source = targetLetter || newLetterForm;
      const letterNum =
        (targetLetter as any)?.letterNumber ||
        (editingLetterId
          ? letters.find((l) => l.id === editingLetterId)?.letterNumber ||
            getNextLetterNumber(selectedCompany, activeSection)
          : "پیش‌نویس");
      const hasAttach =
        source.hasAttachment ??
        ((source.attachments && source.attachments.length > 0) || false);

      const res = await fetch("/api/secretariat/quick-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: source.subject || "نامه اداری",
          content: latestEditorHtml ?? source.content ?? "",
          receiver: source.receiver || "",
          sender: source.sender || "",
          date: source.date || "",
          letterNumber: letterNum,
          signers: source.signers || [],
          approvedBy: (source as any).approvedBy || [],
          signatureImageUrls: (source as any).signatureImageUrls || [],
          signaturePosition: source.signaturePosition || "bottom_left",
          signOffText: typeof source.signOffText === "string" ? source.signOffText.trim() : "",
          paperSize: source.paperSize || "A4",
          orientation: source.orientation || "portrait",
          companyId: (source as any).companyId || selectedCompany?.id || "",
          noLetterhead: noLetterhead || Boolean((source as any).noLetterhead),
          section: (source as any).section || activeSection || "headquarters",
          hasAttachment: hasAttach,
          attachmentDescription: source.attachmentDescription || "",
          attachments: source.attachments || [],
          addCompanyStamp: source.addCompanyStamp || false,
          hideSalutationInLetter: true,
          hideSubjectInLetter: true,
        }),
      });
      if (!res.ok) throw new Error("خطا در تولید فایل PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeNum = String(letterNum || "Draft").replace(/[\/\\]/g, "_");
      a.download = `Letter_${safeNum}${noLetterhead ? "_NoLetterhead" : ""}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("خطا در ایجاد و دانلود فایل PDF: " + e.message);
    }
  };

  // Smart Paragraph Alignment & Line-Width Equalizer (راست‌چین، وسط‌چین، چپ‌چین، و تنظیم/تراز دوطرفه خطوط)
  const handleSmartAlign = (alignMode: "right" | "center" | "left" | "justify") => {
    try {
      const quill = quillRef.current?.getEditor();
      if (!quill || !quill.root) return;

      const range = quill.getSelection();
      const alignValue = alignMode === "right" ? false : alignMode;

      // For right, center, left: apply to current selection or active line
      if (alignMode !== "justify") {
        if (range) {
          quill.formatLine(range.index, Math.max(1, range.length), "align", alignValue, "user");
        } else {
          quill.format("align", alignValue, "user");
        }
        syncEditorContent();
        return;
      }

      // For "justify" (تنظیم / هم‌ترازی دوطرفه خطوط):
      // 1. If user selected a specific text range, justify those lines and join accidental single-Enter line splits
      if (range && range.length > 0) {
        quill.formatLine(range.index, range.length, "align", "justify", "user");
      }

      // 2. Also inspect the DOM paragraphs inside .ql-editor so if the user pressed Enter mid-sentence
      // or clicked "تنظیم" without highlighting text first, body paragraphs are justified and joined cleanly
      const root = quill.root as HTMLElement;
      const paragraphs = Array.from(root.querySelectorAll("p"));
      const isShortHeaderOrSignOff = (txt: string) => {
        const clean = txt.replace(/\u00a0/g, " ").trim();
        if (!clean) return true;
        if (clean.length <= 35 && (
          clean.startsWith("بسمه") ||
          clean.startsWith("باسمه") ||
          clean.startsWith("با سلام") ||
          clean.startsWith("سلام علیکم") ||
          clean.startsWith("با تشکر") ||
          clean.startsWith("با احترام") ||
          clean.startsWith("با تجدید احترام") ||
          clean.startsWith("ارادتمند") ||
          clean.startsWith("سپاسگزارم") ||
          clean.startsWith("شرکت ") ||
          clean.startsWith("مدیریت ") ||
          clean.startsWith("ریاست ") ||
          clean.startsWith("جناب ") ||
          clean.startsWith("سرکار ") ||
          clean.startsWith("موضوع:") ||
          clean.startsWith("به:") ||
          clean.startsWith("از:")
        )) {
          return true;
        }
        return false;
      };

      // Merge consecutive body <p> elements that were split manually by pressing Enter mid-sentence
      for (let i = 0; i < paragraphs.length - 1; i++) {
        const curr = paragraphs[i];
        const next = paragraphs[i + 1];
        if (!curr || !next) continue;
        if (curr.querySelector("img, table, hr") || next.querySelector("img, table, hr")) continue;

        const currText = (curr.textContent || "").replace(/\u00a0/g, " ").trim();
        const nextText = (next.textContent || "").replace(/\u00a0/g, " ").trim();
        if (!currText || !nextText) continue;
        if (isShortHeaderOrSignOff(currText) || isShortHeaderOrSignOff(nextText)) continue;

        // If current paragraph doesn't end with sentence punctuation (or is a body line) and next is also body continuation
        const endsWithSentenceStop = /[.!؟?:؛]$/.test(currText);
        if (!endsWithSentenceStop && currText.length >= 25) {
          curr.innerHTML = `${curr.innerHTML.replace(/<br\s*\/?>\s*$/i, "").trim()} ${next.innerHTML.trim()}`;
          next.remove();
          paragraphs.splice(i + 1, 1);
          i--;
        }
      }

      // Apply full justification to body paragraphs
      Array.from(root.querySelectorAll("p")).forEach((p) => {
        if (p.querySelector("img, table")) return;
        const txt = (p.textContent || "").replace(/\u00a0/g, " ").trim();
        if (!txt) return;
        if (!isShortHeaderOrSignOff(txt) && txt.length > 35) {
          p.style.textAlign = "justify";
          (p.style as any).textJustify = "inter-word";
          p.classList.remove("ql-align-center", "ql-align-left", "ql-align-right");
          p.classList.add("ql-align-justify");
        }
      });

      syncEditorContent();
    } catch (err) {
      console.warn("handleSmartAlign warning:", err);
    }
  };

  // Insert Table Copied from Excel or Sheets (TSV / CSV / Text)
  const handleInsertSheetTable = (rawText: string) => {
    if (!rawText.trim()) return;
    const lines = rawText.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return;

    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit;"><tbody>';

    lines.forEach((line, rowIdx) => {
      const cells = line.split("\t");
      const isHeader = rowIdx === 0;
      tableHtml += `<tr style="${isHeader ? "background-color: #1e3a8a; font-weight: bold; color: white;" : rowIdx % 2 === 1 ? "background-color: #f8fafc;" : ""}">`;
      cells.forEach((cell) => {
        const val = cell.trim() || "&nbsp;";
        if (isHeader) {
          tableHtml += `<th style="border: 1px solid #94a3b8; padding: 8px 12px; text-align: right; color: white;">${val}</th>`;
        } else {
          tableHtml += `<td style="border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right;">${val}</td>`;
        }
      });
      tableHtml += "</tr>";
    });

    tableHtml += "</tbody></table><p><br/></p>";
    insertHTML(tableHtml);
    setShowTableModal(false);
    setSheetDataText("");
  };

  // Insert Pre-built Corporate Tables
  const handleInsertTemplateTable = (templateKey: string) => {
    let tableHtml = "";
    if (templateKey === "invoice") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit; font-size: 13px;">
          <thead>
            <tr style="background-color: #1e3a8a; color: white; font-weight: bold;">
              <th style="border: 1px solid #1e3a8a; padding: 10px; text-align: center; width: 45px;">ردیف</th>
              <th style="border: 1px solid #1e3a8a; padding: 10px; text-align: right;">شرح کالا / خدمات</th>
              <th style="border: 1px solid #1e3a8a; padding: 10px; text-align: center; width: 70px;">تعداد</th>
              <th style="border: 1px solid #1e3a8a; padding: 10px; text-align: center; width: 70px;">واحد</th>
              <th style="border: 1px solid #1e3a8a; padding: 10px; text-align: left; width: 120px;">مبلغ واحد (ریال)</th>
              <th style="border: 1px solid #1e3a8a; padding: 10px; text-align: left; width: 140px;">مبلغ کل (ریال)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">اقلام ردیف اول</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">عدد</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left;">۰</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left;">۰</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۲</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">اقلام ردیف دوم</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">عدد</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left;">۰</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left;">۰</td>
            </tr>
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td colspan="5" style="border: 1px solid #94a3b8; padding: 10px; text-align: left;">جمع کل اقلام:</td>
              <td style="border: 1px solid #94a3b8; padding: 10px; text-align: left;">۰ ریال</td>
            </tr>
          </tbody>
        </table><p><br/></p>
      `;
    } else if (templateKey === "minutes") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit; font-size: 13px;">
          <thead>
            <tr style="background-color: #047857; color: white; font-weight: bold;">
              <th style="border: 1px solid #047857; padding: 10px; text-align: center; width: 50px;">ردیف</th>
              <th style="border: 1px solid #047857; padding: 10px; text-align: right;">شرح مصوبه / تصمیم متخذه</th>
              <th style="border: 1px solid #047857; padding: 10px; text-align: center; width: 140px;">مسئول پیگیری</th>
              <th style="border: 1px solid #047857; padding: 10px; text-align: center; width: 110px;">مهلت اقدام</th>
              <th style="border: 1px solid #047857; padding: 10px; text-align: center; width: 90px;">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">مقرر گردید اقدامات لازم صورت پذیرد.</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">واحد مربوطه</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱ هفته</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">در دست اقدام</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۲</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">تهیه و ارسال گزارش نهایی.</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">مدیریت پروژه</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۳ روز کاری</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">در انتظار تایید</td>
            </tr>
          </tbody>
        </table><p><br/></p>
      `;
    } else if (templateKey === "technical") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit; font-size: 13px;">
          <thead>
            <tr style="background-color: #334155; color: white; font-weight: bold;">
              <th style="border: 1px solid #334155; padding: 10px; text-align: center; width: 50px;">ردیف</th>
              <th style="border: 1px solid #334155; padding: 10px; text-align: right; width: 160px;">پارامتر فنی</th>
              <th style="border: 1px solid #334155; padding: 10px; text-align: right;">مشخصات مورد درخواست</th>
              <th style="border: 1px solid #334155; padding: 10px; text-align: right;">مشخصات پیشنهادی / ارائه‌شده</th>
              <th style="border: 1px solid #334155; padding: 10px; text-align: center; width: 90px;">انطباق</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; font-weight: bold;">استاندارد مرجع</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">ISO / ASTM</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">مطابق گواهی ارائه‌شده</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; color: #059669; font-weight: bold;">تایید</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۲</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; font-weight: bold;">مدت گارانتی</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">حداقل ۱۲ ماه</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">۱۸ ماه ضمانت طلایی</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; color: #059669; font-weight: bold;">تایید</td>
            </tr>
          </tbody>
        </table><p><br/></p>
      `;
    } else if (templateKey === "personnel") {
      tableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; direction: rtl; font-family: inherit; font-size: 13px;">
          <thead>
            <tr style="background-color: #4338ca; color: white; font-weight: bold;">
              <th style="border: 1px solid #4338ca; padding: 10px; text-align: center; width: 45px;">ردیف</th>
              <th style="border: 1px solid #4338ca; padding: 10px; text-align: right;">نام و نام خانوادگی</th>
              <th style="border: 1px solid #4338ca; padding: 10px; text-align: center; width: 110px;">کد ملی</th>
              <th style="border: 1px solid #4338ca; padding: 10px; text-align: right; width: 140px;">سمت سازمانی</th>
              <th style="border: 1px solid #4338ca; padding: 10px; text-align: center; width: 110px;">شماره تماس</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۱</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">—</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">—</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">کارشناس مسئول</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">—</td>
            </tr>
            <tr style="background-color: #f8fafc;">
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">۲</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">—</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">—</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right;">عضو تیم اجرایی</td>
              <td style="border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center;">—</td>
            </tr>
          </tbody>
        </table><p><br/></p>
      `;
    }
    insertHTML(tableHtml);
    setShowTableModal(false);
  };

  // Close menus on click outside
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#color-picker-dropdown") && !target.closest("#color-picker-btn")) {
        setShowTextColorPicker(false);
      }
      if (!target.closest("#bg-picker-dropdown") && !target.closest("#bg-picker-btn")) {
        setShowBgColorPicker(false);
      }
      if (!target.closest(".google-docs-menu-item")) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // --- Normalized Stamps Helper ---
  const getNormalizedStamps = (settings?: SecretariatCompanySettings | null): CompanyStampItem[] => {
    if (!settings) return [];
    if (settings.stamps && settings.stamps.length > 0) {
      return settings.stamps;
    }
    if (settings.companyStampUrl) {
      return [
        {
          id: "default-stamp",
          name: "مهر رسمی شرکت",
          url: settings.companyStampUrl,
          isDefault: true,
          opacity: settings.companyStampOpacity ?? 75,
          width: settings.companyStampSize ?? 120,
        },
      ];
    }
    return [];
  };

  // --- Settings Tab Form State ---
  const [companySettingsForm, setCompanySettingsForm] =
    useState<SecretariatCompanySettings>({
      companyId: "",
      headquartersAccessTokens: [],
      factoryAccessTokens: [],
      editAccessTokens: [],
      deleteAccessTokens: [],
      letterheadUrl: "",
      wordLetterheadUrl: "",
      letterheadFontFamily: "Vazirmatn",
      meetingMinutesTemplate: "",
      defaultSignOffText: "با احترام",
      companyStampUrl: "",
      companyStampSize: 120,
      companyStampOpacity: 75,
      companyStampPosition: "bottom_left",
      stamps: [],
      marginTop: 40,
      marginBottom: 25,
      marginLeft: 20,
      marginRight: 20,
      metadataTop: 25,
      metadataLeft: 20,
      metadataFontSize: 11,
      metadataColor: "#0f172a",
      metadataFontWeight: "bold",
      metadataLineHeight: 1.8,
      autoNumberingEnabled: true,
      numberingPrefixHeadquarters: "HQ",
      numberingPrefixFactory: "FC",
      numberingFormat: "{PREFIX}-{YEAR}/{NUM}",
      numberingStartCounter: 1,
      numberingPadLength: 4,
      hideAutoFooter: false,
    });
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  const letterheadInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPdfLetterhead, setUploadingPdfLetterhead] = useState(false);
  const pdfLetterheadInputRef = useRef<HTMLInputElement>(null);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const newStampInputRef = useRef<HTMLInputElement>(null);
  const [newStampName, setNewStampName] = useState("مهر جدید");
  const [editingStampId, setEditingStampId] = useState<string | null>(null);

  // Load Initial Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [lettersData, settingsData, sysSettings, usersData, templatesData] =
        await Promise.all([
          getSecretariatLetters(),
          getSecretariatSettings(),
          getSettings(),
          getUsers(),
          getSecretariatTemplates(),
        ]);
      setLetters(lettersData);
      setSecSettings(settingsData);
      setSystemSettings(sysSettings);
      setUsers(usersData);
      setTemplates(templatesData);

      // Auto-set shamsi date for form
      const d = getCurrentShamsiDate();
      const shamsiStr = `${d.year}/${String(d.month).padStart(2, "0")}/${String(d.day).padStart(2, "0")}`;
      setNewLetterForm((prev) => ({
        ...prev,
        date: shamsiStr,
      }));
    } catch (e) {
      console.error("Error loading Secretariat data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync settings form when active company changes
  useEffect(() => {
    if (selectedCompany) {
      const activeSettings = secSettings.find(
        (s) => s.companyId === selectedCompany.id,
      ) || {
        companyId: selectedCompany.id,
        headquartersAccessTokens: [],
        factoryAccessTokens: [],
        editAccessTokens: [],
        deleteAccessTokens: [],
        letterheadUrl: "",
        wordLetterheadUrl: "",
        letterheadFontFamily: "Vazirmatn",
        meetingMinutesTemplate: "",
        defaultSignOffText: "با احترام",
        companyStampUrl: "",
        companyStampSize: 120,
        companyStampOpacity: 75,
        companyStampPosition: "bottom_left",
        stamps: [],
        marginTop: 40,
        marginBottom: 25,
        marginLeft: 20,
        marginRight: 20,
        metadataTop: 25,
        metadataLeft: 20,
        metadataFontSize: 11,
        metadataColor: "#0f172a",
        metadataFontWeight: "bold",
        metadataLineHeight: 1.8,
        autoNumberingEnabled: true,
        numberingPrefixHeadquarters: "HQ",
        numberingPrefixFactory: "FC",
        numberingFormat: "{PREFIX}-{YEAR}/{NUM}",
        numberingStartCounter: 1,
        numberingPadLength: 4,
        hideAutoFooter: false,
      };

      const normalizedStamps = getNormalizedStamps(activeSettings);

      setCompanySettingsForm({
        ...activeSettings,
        headquartersAccessTokens: activeSettings.headquartersAccessTokens || [],
        factoryAccessTokens: activeSettings.factoryAccessTokens || [],
        editAccessTokens: activeSettings.editAccessTokens || [],
        deleteAccessTokens: activeSettings.deleteAccessTokens || [],
        autoNumberingEnabled: activeSettings.autoNumberingEnabled ?? true,
        numberingPrefixHeadquarters: activeSettings.numberingPrefixHeadquarters || "HQ",
        numberingPrefixFactory: activeSettings.numberingPrefixFactory || "FC",
        numberingFormat: activeSettings.numberingFormat || "{PREFIX}-{YEAR}/{NUM}",
        numberingStartCounter: activeSettings.numberingStartCounter ?? 1,
        numberingPadLength: activeSettings.numberingPadLength ?? 4,
        marginTop: activeSettings.marginTop ?? 40,
        marginBottom: activeSettings.marginBottom ?? 25,
        marginLeft: activeSettings.marginLeft ?? 20,
        marginRight: activeSettings.marginRight ?? 20,
        metadataTop: activeSettings.metadataTop ?? 25,
        metadataLeft: activeSettings.metadataLeft ?? 20,
        metadataFontSize: activeSettings.metadataFontSize ?? 11,
        metadataColor: activeSettings.metadataColor || "#0f172a",
        metadataFontWeight: activeSettings.metadataFontWeight || "bold",
        metadataLineHeight: activeSettings.metadataLineHeight ?? 1.8,
        companyStampSize: activeSettings.companyStampSize ?? 120,
        companyStampOpacity: activeSettings.companyStampOpacity ?? 75,
        companyStampPosition: activeSettings.companyStampPosition || "bottom_left",
        letterheadFontFamily: activeSettings.letterheadFontFamily || "Vazirmatn",
        defaultSignOffText: activeSettings.defaultSignOffText || "با احترام",
        stamps: normalizedStamps,
      });

      // Update form default sign off text if creating new letter
      if (!editingLetterId) {
        setNewLetterForm((prev) => ({
          ...prev,
          signOffText: activeSettings.defaultSignOffText !== undefined ? activeSettings.defaultSignOffText : (prev.signOffText ?? ""),
        }));
      }
    }
  }, [selectedCompany, secSettings]);

  // Auth/Permissions Check helpers
  const userRoles = currentUser.roles || [currentUser.role];
  const isSuperUser =
    userRoles.includes("admin") ||
    userRoles.includes("ceo") ||
    currentUser.canManageSecretariatSettings;

  const activeCompanySettings = secSettings.find(
    (s) => s.companyId === selectedCompany?.id,
  );

  const getCompanySettingsForLetter = (
    letter?: SecretariatLetter | null,
    targetCompanyId?: string,
  ): SecretariatCompanySettings => {
    const compId =
      letter?.companyId || targetCompanyId || selectedCompany?.id || "";
    let fromSecSettings = secSettings.find((s) => s.companyId === compId);
    if (!fromSecSettings || (!fromSecSettings.letterheadUrl && !fromSecSettings.pdfLetterheadUrl)) {
      const fallbackWithLetterhead = secSettings.find((s) => s.letterheadUrl || s.pdfLetterheadUrl || s.wordLetterheadUrl);
      if (fallbackWithLetterhead) {
        fromSecSettings = fallbackWithLetterhead;
      } else if (secSettings.length > 0 && !fromSecSettings) {
        fromSecSettings = secSettings[0];
      }
    }

    const baseSettings: SecretariatCompanySettings = fromSecSettings || {
      companyId: compId,
      headquartersAccessTokens: [],
      factoryAccessTokens: [],
      editAccessTokens: [],
      deleteAccessTokens: [],
      letterheadUrl: "",
      wordLetterheadUrl: "",
      letterheadFontFamily: "Vazirmatn",
      meetingMinutesTemplate: "",
      defaultSignOffText: "",
      companyStampUrl: "",
      companyStampSize: 120,
      companyStampOpacity: 75,
      companyStampPosition: "bottom_left",
      stamps: [],
      marginTop: 40,
      marginBottom: 25,
      marginLeft: 20,
      marginRight: 20,
      metadataTop: 25,
      metadataLeft: 20,
      metadataFontSize: 11,
      metadataColor: "#0f172a",
      metadataFontWeight: "bold",
      metadataLineHeight: 1.8,
      autoNumberingEnabled: true,
      numberingPrefixHeadquarters: "HQ",
      numberingPrefixFactory: "FC",
      numberingFormat: "{PREFIX}-{YEAR}/{NUM}",
      numberingStartCounter: 1,
      numberingPadLength: 4,
      hideAutoFooter: false,
    };

    if (
      selectedCompany?.id === compId &&
      companySettingsForm?.companyId === compId
    ) {
      return {
        ...baseSettings,
        ...companySettingsForm,
        letterheadUrl:
          companySettingsForm.letterheadUrl ||
          baseSettings.letterheadUrl ||
          "",
        companyStampUrl:
          companySettingsForm.companyStampUrl ||
          baseSettings.companyStampUrl ||
          "",
        stamps: companySettingsForm.stamps?.length
          ? companySettingsForm.stamps
          : getNormalizedStamps(baseSettings),
      };
    }
    return {
      ...baseSettings,
      stamps: getNormalizedStamps(baseSettings),
    };
  };
  const isLetterSigned = (l?: SecretariatLetter | null) => {
    if (!l) return false;
    return (
      (l.approvedBy && l.approvedBy.length > 0) ||
      (l.signatureImageUrls && l.signatureImageUrls.length > 0) ||
      l.status === SecretariatLetterStatus.APPROVED
    );
  };

  const canEditLetter = (l?: SecretariatLetter | null) => {
    if (!l) return false;
    if (isSuperUser) return true;

    // Check if letter is already legally signed
    const signed = isLetterSigned(l);
    if (signed) {
      // If already signed, regular users cannot modify to protect legal validity
      return false;
    }

    // Before signature: Creator, Secretariat access users, or assigned users can edit
    if (activeCompanySettings?.editAccessTokens?.includes(currentUser.id)) return true;
    if (currentUser.canAccessSecretariat || currentUser.role === 'admin' || currentUser.roles?.includes('admin')) return true;

    const isOwner =
      l.createdBy === currentUser.id ||
      (l as any).createdById === currentUser.id ||
      l.createdBy === currentUser.fullName ||
      l.createdBy === (currentUser as any).name ||
      (l as any).creatorName === currentUser.fullName ||
      (l as any).createdByName === currentUser.fullName ||
      l.sender === currentUser.fullName ||
      l.sender === (currentUser as any).name;

    const isAssigned =
      l.referredTo?.includes(currentUser.id) ||
      l.referredTo?.includes(currentUser.username) ||
      l.referredTo?.includes(currentUser.fullName);

    return isOwner || isAssigned;
  };

  const canEditLetters =
    isSuperUser ||
    activeCompanySettings?.editAccessTokens?.includes(currentUser.id) ||
    canEditLetter(selectedLetterForView);
  const canDeleteLetters =
    isSuperUser ||
    activeCompanySettings?.deleteAccessTokens?.includes(currentUser.id);

  const hasSectionAccess = (
    sec: "headquarters" | "factory",
    companyId: string,
  ) => {
    if (isSuperUser) return true;
    const companySet = secSettings.find((s) => s.companyId === companyId);
    if (!companySet) {
      // Default to true if not configured yet, so users are not blocked initially
      return currentUser.canAccessSecretariat;
    }
    const tokens =
      sec === "headquarters"
        ? companySet.headquartersAccessTokens || []
        : companySet.factoryAccessTokens || [];
    return tokens.includes(currentUser.id) || currentUser.canAccessSecretariat;
  };

  // Companies List derived from system settings
  const availableCompanies = (systemSettings?.companies || []).filter(
    (comp) => {
      if (isSuperUser) return true;

      // Check if user has access to this company's secretariat in secSettings
      const compSettings = secSettings.find((s) => s.companyId === comp.id);
      if (compSettings) {
        if (compSettings.headquartersAccessTokens?.includes(currentUser.id))
          return true;
        if (compSettings.factoryAccessTokens?.includes(currentUser.id))
          return true;
      }

      // Legacy check
      if (currentUser.secretariatAllowedCompanies?.includes(comp.id))
        return true;

      return false;
    },
  );

  // Filter letters based on current company, section, tab (cartable vs archive) and search parameters
  const filteredLetters = letters.filter((letter) => {
    if (!selectedCompany || !activeSection) return false;

    // Match Company and Section
    if (
      letter.companyId !== selectedCompany.id ||
      letter.section !== activeSection
    )
      return false;

    // Match tab (archive displays archived, cartable displays the rest)
    if (activeTab === "archive") {
      if (letter.status !== SecretariatLetterStatus.ARCHIVED) return false;
    } else {
      if (letter.status === SecretariatLetterStatus.ARCHIVED) return false;
    }

    // Privacy and Cartable Relevance filter
    const isCreator =
      letter.createdBy === currentUser.id ||
      (letter as any).createdById === currentUser.id ||
      letter.createdBy === currentUser.fullName ||
      letter.createdBy === (currentUser as any).name ||
      (letter as any).creatorName === currentUser.fullName ||
      (letter as any).createdByName === currentUser.fullName;
    const isReferred =
      letter.referredTo?.includes(currentUser.id) ||
      letter.referredTo?.includes(currentUser.username) ||
      letter.referredTo?.includes(currentUser.fullName);
    const isSigner = letter.signers?.some(
      (s) =>
        s.userId === currentUser.id ||
        s.name === currentUser.fullName ||
        s.name === (currentUser as any).name,
    );
    const isRelevantToUser = isCreator || isReferred || isSigner;

    if (!isSuperUser) {
      if (letter.isPrivate && !isRelevantToUser) {
        return false; // Private letters only visible to relevant users and super users
      }

      // In cartable (non-archive), show relevant letters to non-superusers so it doesn't clutter
      if (activeTab === "cartable" && !isRelevantToUser) {
        return false;
      }
    }

    // Match type filter
    if (filterType !== "all" && letter.type !== filterType) return false;

    // Match Search query (subject, content, letter number, sender, receiver)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchSubject = letter.subject?.toLowerCase().includes(query);
      const matchNum = letter.letterNumber?.toLowerCase().includes(query);
      const matchSender = letter.sender?.toLowerCase().includes(query);
      const matchReceiver = letter.receiver?.toLowerCase().includes(query);
      const matchContent = letter.content?.toLowerCase().includes(query);
      return (
        matchSubject || matchNum || matchSender || matchReceiver || matchContent
      );
    }

    return true;
  });

  // Calculate Sequential Auto-Letter Number based on Company Settings
  const getNextLetterNumber = (
    company: Company,
    section: "headquarters" | "factory",
    customSettings?: SecretariatCompanySettings,
  ) => {
    const settings = customSettings || companySettingsForm;
    const prefix =
      section === "headquarters"
        ? settings.numberingPrefixHeadquarters || "HQ"
        : settings.numberingPrefixFactory || "FC";

    const matchedLetters = letters.filter(
      (l) => l.companyId === company.id && l.section === section,
    );
    const startCounter = settings.numberingStartCounter ?? 1;
    const count = matchedLetters.length + startCounter;
    const padLen = settings.numberingPadLength ?? 4;
    const seq = String(count).padStart(padLen, "0");
    const year = String(getCurrentShamsiDate().year);

    const format = settings.numberingFormat || "{PREFIX}-{YEAR}/{NUM}";
    return format
      .replace(/{PREFIX}/g, prefix)
      .replace(/{YEAR}/g, year)
      .replace(/{NUM}/g, seq)
      .replace(/{SECTION}/g, section === "headquarters" ? "HQ" : "FC")
      .replace(/{COMPANY_CODE}/g, company.nationalId ? company.nationalId.slice(-3) : "01");
  };

  const handleOpenNewLetterModal = () => {
    resetForm();
    const currentDate = getCurrentShamsiDate();
    const activeSettings = secSettings.find(
      (s) => s.companyId === selectedCompany?.id,
    );
    const defaultBody =
      companySettingsForm.meetingMinutesTemplate ||
      "<p>با سلام و احترام،</p><p><br></p><p><br></p>";
    setNewLetterForm((p) => ({
      ...p,
      date: `${currentDate.year}/${String(currentDate.month).padStart(2, "0")}/${String(currentDate.day).padStart(2, "0")}`,
      content: defaultBody,
      signOffText: activeSettings?.defaultSignOffText || "",
    }));
    setShowNewLetterModal(true);
  };

  const handleEditLetterClick = (letter: SecretariatLetter) => {
    const preservedContent = preserveLetterHtmlSpaces(letter.content || "");
    setNewLetterForm({
      date: letter.date || "",
      subject: letter.subject || "",
      content: preservedContent,
      sender: letter.sender || "",
      receiver: letter.receiver || "",
      type: letter.type || "internal",
      referredTo: letter.referredTo || [],
      attachments: letter.attachments || [],
      hasAttachment: letter.hasAttachment ?? ((letter.attachments && letter.attachments.length > 0) || false),
      attachmentDescription: letter.attachmentDescription || "",
      addCompanyStamp: letter.addCompanyStamp || false,
      selectedStampIds: letter.selectedStampIds || [],
      selectedStampId: (letter.selectedStampIds && letter.selectedStampIds[0]) || "",
      isPrivate: letter.isPrivate || false,
      signOffText: letter.signOffText !== undefined && letter.signOffText !== null ? letter.signOffText : "",
      signers: letter.signers || [],
      paperSize: letter.paperSize || "A4",
      orientation: letter.orientation || "portrait",
      signaturePosition: letter.signaturePosition || "bottom_left",
      hideSubjectInLetter: letter.hideSubjectInLetter ?? true,
      hideSalutationInLetter: letter.hideSalutationInLetter ?? true,
    });
    setEditingLetterId(letter.id);
    setSelectedLetterForView(null);
    setShowNewLetterModal(true);
  };

  // Handlers for Letter Submissions
  const handleSaveLetter = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedCompany || !activeSection) return;

    const finalContent = syncEditorContent();

    if (!editingLetterId) {
      const hasDesignatedReceiver = 
        (newLetterForm.referredTo && newLetterForm.referredTo.length > 0) ||
        (selectedReferrals && selectedReferrals.length > 0) ||
        (newLetterForm.signers && newLetterForm.signers.length > 0 && newLetterForm.signers.some((s) => s.userId || s.name)) ||
        (newLetterForm.receiver && newLetterForm.receiver.trim().length > 0) ||
        (newLetterForm.sender && newLetterForm.sender.trim().length > 0);
      
      if (!hasDesignatedReceiver) {
        alert("⚠️ هشدار: امکان صدور و ثبت نامه بدون تعیین گیرنده، فرستنده، ارجاع یا امضاکننده وجود ندارد.\nلطفاً گیرنده نامه یا امضاکنندگان را مشخص فرمایید.");
        setShowAdvancedOptionsModal(true);
        return;
      }
    }

    if (editingLetterId) {
      const existingLetter = letters.find((l) => l.id === editingLetterId);
      if (!existingLetter) return;

      const mergedReferrals = Array.from(new Set([
        ...(existingLetter.referredTo || []),
        ...(newLetterForm.referredTo || []),
        ...selectedReferrals,
        ...(newLetterForm.signers || []).map(s => s.userId).filter(Boolean) as string[],
      ]));

      const updatedLetter: SecretariatLetter = {
        ...existingLetter,
        date: newLetterForm.date,
        subject: newLetterForm.subject,
        content: finalContent,
        sender: newLetterForm.sender,
        receiver: newLetterForm.receiver,
        referredTo: mergedReferrals,
        type: newLetterForm.type,
        attachments: newLetterForm.attachments,
        hasAttachment: newLetterForm.hasAttachment ?? ((newLetterForm.attachments && newLetterForm.attachments.length > 0) || false),
        attachmentDescription: newLetterForm.attachmentDescription || "",
        addCompanyStamp: newLetterForm.addCompanyStamp,
        isPrivate: newLetterForm.isPrivate,
        signOffText: newLetterForm.signOffText,
        signers: newLetterForm.signers,
        paperSize: newLetterForm.paperSize,
        orientation: newLetterForm.orientation,
        signaturePosition: newLetterForm.signaturePosition,
        hideSubjectInLetter: newLetterForm.hideSubjectInLetter ?? true,
        hideSalutationInLetter: newLetterForm.hideSalutationInLetter ?? true,
        updatedAt: Date.now(),
      };

      // Optimistic update for instant feedback on Windows (Tauri), Android & Web
      setLetters((prev) => [updatedLetter, ...prev.filter((l) => l.id !== updatedLetter.id)]);
      setShowNewLetterModal(false);
      resetForm();

      try {
        const updatedList = await updateSecretariatLetter(updatedLetter);
        if (Array.isArray(updatedList) && updatedList.length > 0) {
          setLetters(updatedList);
        }
      } catch (err) {
        console.warn("Background letter update warning:", err);
      }
    } else {
      const autoNum = getNextLetterNumber(selectedCompany, activeSection);
      const targetReferrals = Array.from(new Set([
        ...(newLetterForm.referredTo || []),
        ...selectedReferrals,
        ...(newLetterForm.signers || []).map(s => s.userId).filter(Boolean) as string[],
      ]));

      const newLetter: SecretariatLetter = {
        id: generateUUID(),
        companyId: selectedCompany.id,
        section: activeSection,
        letterNumber: autoNum,
        date: newLetterForm.date,
        subject: newLetterForm.subject,
        content: finalContent,
        sender: newLetterForm.sender,
        receiver: newLetterForm.receiver,
        referredTo: targetReferrals,
        type: newLetterForm.type,
        status: SecretariatLetterStatus.PENDING,
        comments: [],
        attachments: newLetterForm.attachments,
        hasAttachment: newLetterForm.hasAttachment ?? ((newLetterForm.attachments && newLetterForm.attachments.length > 0) || false),
        attachmentDescription: newLetterForm.attachmentDescription || "",
        addCompanyStamp: newLetterForm.addCompanyStamp,
        isPrivate: newLetterForm.isPrivate,
        signOffText: newLetterForm.signOffText,
        signers: newLetterForm.signers,
        paperSize: newLetterForm.paperSize,
        orientation: newLetterForm.orientation,
        signaturePosition: newLetterForm.signaturePosition,
        hideSubjectInLetter: newLetterForm.hideSubjectInLetter,
        hideSalutationInLetter: newLetterForm.hideSalutationInLetter,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: currentUser.fullName,
      };

      // Optimistic update for instant feedback on Windows (Tauri), Android & Web
      setLetters((prev) => [newLetter, ...prev.filter((l) => l.id !== newLetter.id)]);
      setShowNewLetterModal(false);
      resetForm();

      try {
        const updatedList = await saveSecretariatLetter(newLetter);
        if (Array.isArray(updatedList) && updatedList.length > 0) {
          setLetters(updatedList);
        }
      } catch (err) {
        console.warn("Background letter save warning:", err);
      }
    }
  };

  // Save Current Form as Template
  const handleSaveAsTemplate = async () => {
    if (!newLetterForm.subject) {
      alert("لطفا ابتدا موضوع نامه را وارد کنید.");
      return;
    }
    const templateTitle = prompt(
      "نام قالب جدید را وارد کنید:",
      newLetterForm.subject,
    );
    if (!templateTitle) return;

    const newTemplate = {
      id: generateUUID(),
      title: templateTitle,
      subject: newLetterForm.subject,
      content: newLetterForm.content,
      createdAt: Date.now(),
    };

    try {
      await saveSecretariatTemplate(newTemplate);
      const updatedTemplates = await getSecretariatTemplates();
      setTemplates(updatedTemplates);
      alert("قالب با موفقیت ذخیره شد.");
    } catch (err) {
      alert("خطا در ذخیره قالب");
    }
  };

  // Upload Attachment Handler
  const handleAttachmentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAttachment(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await uploadFile(file.name, base64);
        setNewLetterForm((prev) => ({
          ...prev,
          attachments: [
            ...prev.attachments,
            { fileName: file.name, url: res.url },
          ],
        }));
      } catch (err) {
        alert("خطا در آپلود فایل");
      } finally {
        setUploadingAttachment(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Remove Attachment
  const handleRemoveAttachment = (idx: number) => {
    setNewLetterForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== idx),
    }));
  };

  // Add Comment to Letter
  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedLetterForView) return;

    const newComment: SecretariatLetterComment = {
      id: generateUUID(),
      userId: currentUser.id,
      username: currentUser.fullName,
      comment: commentText,
      createdAt: Date.now(),
    };

    const updatedLetter: SecretariatLetter = {
      ...selectedLetterForView,
      comments: [...(selectedLetterForView.comments || []), newComment],
      updatedAt: Date.now(),
    };

    try {
      const updatedList = await updateSecretariatLetter(updatedLetter);
      setLetters(updatedList);
      setSelectedLetterForView(updatedLetter);
      setCommentText("");
    } catch (err) {
      alert("خطا در ثبت نظر");
    }
  };

  // Refer Letter
  const handleReferLetter = async () => {
    if (selectedReferrals.length === 0 || !selectedLetterForView) return;

    const updatedLetter: SecretariatLetter = {
      ...selectedLetterForView,
      referredTo: Array.from(
        new Set([
          ...(selectedLetterForView.referredTo || []),
          ...selectedReferrals,
        ]),
      ),
      referredBy: currentUser.fullName,
      updatedAt: Date.now(),
    };

    try {
      const updatedList = await updateSecretariatLetter(updatedLetter);
      setLetters(updatedList);
      setSelectedLetterForView(updatedLetter);
      setSelectedReferrals([]);
      alert("نامه با موفقیت ارجاع داده شد");
    } catch (err) {
      alert("خطا در ارجاع نامه");
    }
  };

  // Approve and Sign Letter
  const handleApproveSign = async () => {
    if (!selectedLetterForView) return;

    if (!currentUser.signatureUrl) {
      alert(
        'کاربر گرامی، امضای واقعی شما در پروفایل آپلود نشده است. لطفا ابتدا از منوی "کاربران" نسبت به آپلود تصویر امضای خود اقدام نمایید.',
      );
      return;
    }

    const currentApprovers = selectedLetterForView.approvedBy || [];
    if (currentApprovers.includes(currentUser.id)) {
      alert("شما قبلا این نامه را تایید و امضا کرده‌اید.");
      return;
    }

    const currentSignatures = selectedLetterForView.signatureImageUrls || [];

    const updatedLetter: SecretariatLetter = {
      ...selectedLetterForView,
      status: SecretariatLetterStatus.APPROVED,
      approvedBy: [...currentApprovers, currentUser.id],
      signatureImageUrls: [...currentSignatures, currentUser.signatureUrl],
      updatedAt: Date.now(),
    };

    try {
      const updatedList = await updateSecretariatLetter(updatedLetter);
      setLetters(updatedList);
      setSelectedLetterForView(updatedLetter);
      alert("نامه با موفقیت تایید و امضای واقعی شما درج گردید.");
    } catch (err) {
      alert("خطا در تایید و امضای نامه");
    }
  };

  // Reject Letter
  const handleRejectLetter = async () => {
    if (!selectedLetterForView) return;

    const updatedLetter: SecretariatLetter = {
      ...selectedLetterForView,
      status: SecretariatLetterStatus.REJECTED,
      updatedAt: Date.now(),
    };

    try {
      const updatedList = await updateSecretariatLetter(updatedLetter);
      setLetters(updatedList);
      setSelectedLetterForView(updatedLetter);
      alert("نامه رد شد");
    } catch (err) {
      alert("خطا در تغییر وضعیت نامه");
    }
  };

  // Archive / Unarchive Letter
  const handleToggleArchive = async (letter: SecretariatLetter) => {
    const isArchived = letter.status === SecretariatLetterStatus.ARCHIVED;
    const updatedLetter: SecretariatLetter = {
      ...letter,
      status: isArchived
        ? SecretariatLetterStatus.PENDING
        : SecretariatLetterStatus.ARCHIVED,
      updatedAt: Date.now(),
    };

    try {
      const updatedList = await updateSecretariatLetter(updatedLetter);
      setLetters(updatedList);
      if (selectedLetterForView?.id === letter.id) {
        setSelectedLetterForView(updatedLetter);
      }
      alert(
        isArchived
          ? "نامه از بایگانی خارج شد."
          : "نامه با موفقیت بایگانی گردید.",
      );
    } catch (err) {
      alert("خطا در تغییر وضعیت بایگانی");
    }
  };

  // Delete Letter
  const handleDeleteLetter = async (id: string) => {
    if (!window.confirm("آیا از حذف این نامه اداری اطمینان دارید؟")) return;

    try {
      const updatedList = await deleteSecretariatLetter(id);
      setLetters(updatedList);
      setSelectedLetterForView(null);
      alert("نامه با موفقیت حذف شد.");
    } catch (err) {
      alert("خطا در حذف نامه");
    }
  };

  // Save Secretariat Settings (Access control lists + templates)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    try {
      const updatedSettings =
        await saveSecretariatSettings(companySettingsForm);
      setSecSettings(updatedSettings);
      alert("تنظیمات دبیرخانه این شرکت با موفقیت بروزرسانی شد.");
    } catch (err) {
      alert("خطا در ذخیره‌سازی تنظیمات");
    }
  };

  // Upload Letterhead image
  const handleLetterheadUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;

    setUploadingLetterhead(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await uploadFile(file.name, base64);
        const updatedForm: SecretariatCompanySettings = {
          ...companySettingsForm,
          companyId: selectedCompany.id,
          letterheadUrl: res.url,
        };
        setCompanySettingsForm(updatedForm);
        const updatedSettings = await saveSecretariatSettings(updatedForm);
        setSecSettings(updatedSettings);
        alert("تصویر سربرگ با موفقیت بارگذاری و ذخیره شد.");
      } catch (err) {
        console.error("Error uploading letterhead:", err);
        alert("خطا در آپلود و ذخیره سربرگ");
      } finally {
        setUploadingLetterhead(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload Vector PDF Letterhead (Ultra High Resolution 300 DPI)
  const handlePdfLetterheadUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;

    setUploadingPdfLetterhead(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await uploadFile(file.name, base64);
        const previewUrl = `/api/secretariat/pdf-preview?url=${encodeURIComponent(res.url)}`;
        const updatedForm: SecretariatCompanySettings = {
          ...companySettingsForm,
          companyId: selectedCompany.id,
          pdfLetterheadUrl: res.url,
          letterheadUrl: companySettingsForm.letterheadUrl && !companySettingsForm.letterheadUrl.toLowerCase().endsWith(".pdf") ? companySettingsForm.letterheadUrl : previewUrl,
        };
        setCompanySettingsForm(updatedForm);
        const updatedSettings = await saveSecretariatSettings(updatedForm);
        setSecSettings(updatedSettings);
        alert("فایل سربرگ برداری PDF با موفقیت بارگذاری و ذخیره شد. از این پس خروجی‌های PDF با حداکثر کیفیت برداری چاپ (۳۰۰ DPI) تولید می‌شوند.");
      } catch (err) {
        console.error("Error uploading PDF letterhead:", err);
        alert("خطا در آپلود و ذخیره سربرگ برداری PDF");
      } finally {
        setUploadingPdfLetterhead(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload Company Stamp image
  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;

    setUploadingStamp(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await uploadFile(file.name, base64);
        const updatedForm: SecretariatCompanySettings = {
          ...companySettingsForm,
          companyId: selectedCompany.id,
          companyStampUrl: res.url,
        };
        setCompanySettingsForm(updatedForm);
        const updatedSettings = await saveSecretariatSettings(updatedForm);
        setSecSettings(updatedSettings);
        alert("تصویر مهر رسمی شرکت با موفقیت بارگذاری و ذخیره شد.");
      } catch (err) {
        console.error("Error uploading stamp:", err);
        alert("خطا در آپلود و ذخیره مهر شرکت");
      } finally {
        setUploadingStamp(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save template
  const handleSaveTemplate = async (templateData: any) => {
    try {
      const updatedTemplates = await saveSecretariatTemplate(templateData);
      setTemplates(updatedTemplates);
      alert("قالب نمونه نامه با موفقیت ذخیره شد.");
      setEditingTemplate(null);
    } catch (err) {
      console.error(err);
      alert("خطا در ذخیره قالب نمونه نامه");
    }
  };

  // Delete template
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("آیا از حذف این قالب نمونه نامه مطمئن هستید؟")) return;
    try {
      const updatedTemplates = await deleteSecretariatTemplate(id);
      setTemplates(updatedTemplates);
      alert("قالب نمونه نامه با موفقیت حذف شد.");
    } catch (err) {
      console.error(err);
      alert("خطا در حذف قالب نمونه نامه");
    }
  };

  // Upload Word (.docx) Letterhead File
  const handleWordLetterheadUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingWordLetterhead(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await uploadFile(file.name, base64);
        const updatedForm: SecretariatCompanySettings = {
          ...companySettingsForm,
          companyId: selectedCompany.id,
          wordLetterheadUrl: res.url,
        };
        setCompanySettingsForm(updatedForm);
        const updatedSettings = await saveSecretariatSettings(updatedForm);
        setSecSettings(updatedSettings);
        alert("فایل سربرگ ورد (.docx) با موفقیت بارگذاری و ذخیره شد.");
      } catch (err) {
        console.error(err);
        alert("خطا در آپلود فایل سربرگ ورد");
      } finally {
        setUploadingWordLetterhead(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Import text from Word (.docx) File
  const handleDocxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingDocxFile(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const res = await importDocx(base64);
        if (res.success) {
          if (editingTemplate) {
            setEditingTemplate((prev) =>
              prev
                ? {
                    ...prev,
                    content: res.html,
                    title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
                  }
                : null,
            );
          } else {
            setNewLetterForm((prev) => ({
              ...prev,
              content: res.html,
              subject: prev.subject || file.name.replace(/\.[^/.]+$/, ""),
            }));
          }
          alert("متن سند ورد با موفقیت استخراج و به ویرایشگر اضافه شد.");
        } else {
          alert(
            "خطا در تبدیل سند ورد: " +
              (res.success === false ? "قالب ناسازگار" : "خطای سیستم"),
          );
        }
      } catch (err: any) {
        console.error(err);
        alert("خطا در استخراج محتوای فایل ورد: " + err.message);
      } finally {
        setImportingDocxFile(false);
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  // Insert meeting minutes template into new letter content
  const handleInsertMinutesTemplate = () => {
    const activeSettings = secSettings.find(
      (s) => s.companyId === selectedCompany?.id,
    );
    if (activeSettings?.meetingMinutesTemplate) {
      setNewLetterForm((prev) => ({
        ...prev,
        content: activeSettings.meetingMinutesTemplate || "",
      }));
    } else {
      alert(
        'قالبی برای صورتجلسه این شرکت تنظیم نشده است. ابتدا از تب "تنظیمات دبیرخانه" قالب را ذخیره کنید.',
      );
    }
  };

  // --- RENDERS ---

  // 1. Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
        <span className="text-sm text-gray-500 font-medium">
          درحال بارگذاری محیط دبیرخانه...
        </span>
      </div>
    );
  }

  // 1.5 High level access guard
  const userHasAnyCompanyAccess = secSettings.some(
    (s) =>
      s.headquartersAccessTokens?.includes(currentUser.id) ||
      s.factoryAccessTokens?.includes(currentUser.id),
  );
  const isAuthorized =
    isSuperUser || currentUser.canAccessSecretariat || userHasAnyCompanyAccess;
  if (!isAuthorized) {
    return (
      <div
        className="glass-panel text-center p-12 max-w-lg mx-auto mt-12 rounded-2xl border space-y-3 bg-red-50/20 border-red-100"
        dir="rtl"
      >
        <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
          <Lock size={24} />
        </div>
        <h3 className="font-bold text-red-800 text-base">دسترسی غیرمجاز</h3>
        <p className="text-xs text-red-600 leading-relaxed font-medium">
          شما دسترسی لازم برای ورود به سیستم دبیرخانه اداری را ندارید. لطفا با
          مدیر سیستم تماس بگیرید تا دسترسی "دبیرخانه" را برای حساب کاربری شما
          فعال نماید.
        </p>
      </div>
    );
  }

  // 2. Company Initial Selector screen
  if (!selectedCompany) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-2xl">
            <Building2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">
            سامانه دبیرخانه مرکزی
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            لطفا شرکت مورد نظر خود را جهت ورود به میزکار دبیرخانه انتخاب نمایید.
          </p>
        </div>

        {availableCompanies.length === 0 ? (
          <div className="glass-panel text-center p-8 rounded-2xl border border-dashed text-gray-500">
            هیچ شرکتی در تنظیمات سیستم تعریف نشده است. لطفا ابتدا شرکت‌ها را در
            تنظیمات عمومی سیستم مدیریت کنید.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableCompanies.map((company) => (
              <motion.div
                key={company.id}
                whileHover={{ y: -4, scale: 1.02 }}
                onClick={() => setSelectedCompany(company)}
                className="glass-panel rounded-2xl border border-gray-150 p-6 flex flex-col justify-between cursor-pointer shadow-sm hover:shadow-md transition-all duration-300 relative group overflow-hidden bg-white/50"
              >
                <div className="absolute top-0 right-0 h-1.5 w-full bg-gradient-to-l from-purple-500 to-indigo-500 transform origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-black border">
                      {company.logo ? (
                        <img
                          src={company.logo}
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        company.name.charAt(0)
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 text-base">
                        {company.name}
                      </h3>
                      <span className="text-[10px] text-gray-400 font-mono">
                        شناسه ملی: {company.nationalId || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 leading-relaxed border-t pt-3 flex flex-col gap-1">
                    <span>شماره ثبت: {company.registrationNumber || "-"}</span>
                    <span>آدرس: {company.address || "-"}</span>
                  </div>
                </div>

                <div className="flex justify-end mt-4 items-center text-purple-600 gap-1 text-xs font-bold">
                  <span>انتخاب شرکت و ورود</span>
                  <ChevronLeft size={16} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 3. Section Selector screen (HQ vs Factory)
  if (selectedCompany && !activeSection) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-8 animate-fade-in">
        <div className="flex items-center gap-3 justify-between">
          <button
            onClick={() => setSelectedCompany(null)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowRight size={14} /> بازگشت به لیست شرکت‌ها
          </button>
          <span className="text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full font-bold">
            {selectedCompany.name}
          </span>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-900">
            انتخاب بخش دبیرخانه
          </h2>
          <p className="text-xs text-gray-500">
            برای کار با دبیرخانه این شرکت، یکی از بخش‌های مستقل زیر را انتخاب
            کنید.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Headquarters card */}
          <div
            onClick={() => {
              if (hasSectionAccess("headquarters", selectedCompany.id)) {
                setActiveSection("headquarters");
              } else {
                alert("شما به بخش دفتر مرکزی دبیرخانه این شرکت دسترسی ندارید.");
              }
            }}
            className={`glass-panel border rounded-2xl p-6 text-center cursor-pointer transition-all ${
              hasSectionAccess("headquarters", selectedCompany.id)
                ? "hover:shadow-lg border-purple-200 bg-purple-50/10"
                : "opacity-60 bg-gray-50 border-gray-200 cursor-not-allowed"
            }`}
          >
            <div className="mx-auto w-14 h-14 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <Building className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-gray-800 text-base mb-1">
              دبیرخانه دفتر مرکزی
            </h3>
            <p className="text-[11px] text-gray-500 mb-4">
              کارتابل و بایگانی مدارک و نامه‌های دفتر مرکزی
            </p>

            <div className="flex justify-center items-center gap-1 text-xs font-bold">
              {hasSectionAccess("headquarters", selectedCompany.id) ? (
                <span className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full text-[10px]">
                  <Unlock size={12} /> دسترسی مجاز
                </span>
              ) : (
                <span className="text-red-500 flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-full text-[10px]">
                  <Lock size={12} /> دسترسی محدود شده
                </span>
              )}
            </div>
          </div>

          {/* Factory card */}
          <div
            onClick={() => {
              if (hasSectionAccess("factory", selectedCompany.id)) {
                setActiveSection("factory");
              } else {
                alert("شما به بخش کارخانه دبیرخانه این شرکت دسترسی ندارید.");
              }
            }}
            className={`glass-panel border rounded-2xl p-6 text-center cursor-pointer transition-all ${
              hasSectionAccess("factory", selectedCompany.id)
                ? "hover:shadow-lg border-indigo-200 bg-indigo-50/10"
                : "opacity-60 bg-gray-50 border-gray-200 cursor-not-allowed"
            }`}
          >
            <div className="mx-auto w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <Building2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-gray-800 text-base mb-1">
              دبیرخانه کارخانه
            </h3>
            <p className="text-[11px] text-gray-500 mb-4">
              کارتابل و بایگانی مدارک و نامه‌های بخش کارخانه تولیدی
            </p>

            <div className="flex justify-center items-center gap-1 text-xs font-bold">
              {hasSectionAccess("factory", selectedCompany.id) ? (
                <span className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full text-[10px]">
                  <Unlock size={12} /> دسترسی مجاز
                </span>
              ) : (
                <span className="text-red-500 flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-full text-[10px]">
                  <Lock size={12} /> دسترسی محدود شده
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Main Secretariat Dashboard (when company and section are selected)
  return (
    <div className="space-y-6 animate-fade-in relative min-h-screen">
      <style>{`
        /* System/Local Font Fallbacks for Offline Intranet */
        .ql-font-Samim { font-family: Samim, 'Vazirmatn', Tahoma, sans-serif !important; }
        .ql-font-Tanha { font-family: Tanha, 'Vazirmatn', Tahoma, sans-serif !important; }

        /* Clear any overlaps and make pickers spacious */
        .ql-snow .ql-picker.ql-font {
          width: 170px !important;
        }
        .ql-snow .ql-picker.ql-size {
          width: 140px !important;
        }
        .ql-snow .ql-picker.ql-header {
          width: 130px !important;
        }
        .ql-snow .ql-picker-label {
          padding-left: 8px !important;
          padding-right: 24px !important;
          background: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 6px !important;
          font-weight: 500 !important;
          color: #1e293b !important;
          font-size: 11px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          height: 28px !important;
        }
        .ql-snow .ql-picker-label::before {
          line-height: 28px !important;
        }
        .ql-snow .ql-picker-options {
          border-radius: 8px !important;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05) !important;
          border: 1px solid #cbd5e1 !important;
          padding: 6px !important;
          background: white !important;
        }
        .ql-snow .ql-picker-item {
          padding: 4px 8px !important;
          border-radius: 4px !important;
        }
        .ql-snow .ql-picker-item:hover {
          background-color: #f1f5f9 !important;
        }
        /* Style Quill toolbar */
        .ql-toolbar.ql-snow,
        #letter-custom-quill-toolbar.ql-toolbar.ql-snow {
          background: #f8fafc !important;
          border: none !important;
          border-bottom: 1px solid #cbd5e1 !important;
          border-radius: 0px !important;
          padding: 6px 12px !important;
          display: flex !important;
          flex-wrap: wrap !important;
          align-items: center !important;
          gap: 4px !important;
          position: sticky !important;
          top: 0 !important;
          z-index: 30 !important;
        }
        .dark #letter-custom-quill-toolbar.ql-toolbar.ql-snow {
          background: #0f172a !important;
          border-bottom: 1px solid #334155 !important;
        }
        /* Editor panel */
        .ql-container.ql-snow {
          border: none !important;
          background: transparent !important;
          font-family: inherit !important;
          font-size: inherit !important;
        }
        .ql-editor {
          min-height: 200px !important;
          padding: 0 !important;
        }
        /* Custom toolbar icon sizes */
        .ql-snow .ql-toolbar button {
          width: 30px !important;
          height: 30px !important;
          padding: 4px !important;
          border-radius: 6px !important;
          transition: all 0.2s;
        }
        .ql-snow .ql-toolbar button:hover {
          background-color: rgba(0,0,0,0.05) !important;
          color: #6366f1 !important;
        }
        .ql-snow .ql-toolbar button.ql-active {
          background-color: #e0e7ff !important;
          color: #4f46e5 !important;
        }
        /* Separation in toolbar */
        .ql-snow .ql-toolbar .ql-formats {
          margin-right: 0px !important;
          margin-left: 8px !important;
          border-left: 1px solid #e2e8f0;
          padding-left: 8px;
          display: inline-flex !important;
          align-items: center;
          gap: 2px;
        }
        .dark .ql-snow .ql-toolbar .ql-formats {
          border-left-color: #334155 !important;
        }
        .ql-snow .ql-toolbar .ql-formats:first-child {
          border-left: none;
          padding-left: 0;
          margin-left: 0;
        }

        /* Custom Quill Toolbar Fonts Dropdown labels & typography rendering in Persian */
        .ql-snow .ql-picker.ql-font .ql-picker-label::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item::before {
          content: 'وزیر متن (پیش‌فرض)' !important;
          font-family: 'Vazirmatn', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Vazirmatn"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Vazirmatn"]::before {
          content: 'وزیر متن' !important;
          font-family: 'Vazirmatn', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Shabnam"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Shabnam"]::before {
          content: 'شبنم' !important;
          font-family: 'Shabnam', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Sahel"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Sahel"]::before {
          content: 'ساحل' !important;
          font-family: 'Sahel', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Gandom"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Gandom"]::before {
          content: 'گندم' !important;
          font-family: 'Gandom', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Estedad"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Estedad"]::before {
          content: 'استعداد' !important;
          font-family: 'Estedad', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Samim"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Samim"]::before {
          content: 'صمیم' !important;
          font-family: 'Samim', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Tanha"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Tanha"]::before {
          content: 'تنها' !important;
          font-family: 'Tanha', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Tahoma"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Tahoma"]::before {
          content: 'تاهوما' !important;
          font-family: 'Tahoma', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Arial"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Arial"]::before {
          content: 'Arial' !important;
          font-family: 'Arial', sans-serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Times New Roman"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Times New Roman"]::before {
          content: 'Times' !important;
          font-family: 'Times New Roman', serif !important;
        }
        .ql-snow .ql-picker.ql-font .ql-picker-label[data-value="Courier New"]::before,
        .ql-snow .ql-picker.ql-font .ql-picker-item[data-value="Courier New"]::before {
          content: 'Courier' !important;
          font-family: 'Courier New', monospace !important;
        }

        /* Custom Font Sizes Dropdown labels in Quill Snow theme */
        .ql-snow .ql-picker.ql-size .ql-picker-label::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item::before {
          content: '۱۴ پیکسل (پیش‌فرض)' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="9px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="9px"]::before {
          content: '۹ ریز' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="10px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="10px"]::before {
          content: '۱۰ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="11px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="11px"]::before {
          content: '۱۱ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="12px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="12px"]::before {
          content: '۱۲ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="13px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="13px"]::before {
          content: '۱۳ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="14px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="14px"]::before {
          content: '۱۴ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="15px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="15px"]::before {
          content: '۱۵ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="16px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="16px"]::before {
          content: '۱۶ بزرگ' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="17px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="17px"]::before {
          content: '۱۷ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="18px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="18px"]::before {
          content: '۱۸ تیتر ریز' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="20px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="20px"]::before {
          content: '۲۰ متوسط' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="22px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="22px"]::before {
          content: '۲۲ سربرگ' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="24px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="24px"]::before {
          content: '۲۴ بزرگ' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="28px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="28px"]::before {
          content: '۲۸ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="32px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="32px"]::before {
          content: '۳۲ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="36px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="36px"]::before {
          content: '۳۶ پیکسل' !important;
        }
        .ql-snow .ql-picker.ql-size .ql-picker-label[data-value="48px"]::before,
        .ql-snow .ql-picker.ql-size .ql-picker-item[data-value="48px"]::before {
          content: '۴۸ عظیم' !important;
        }

        /* Force editor content alignment and typography defaults */
        .ql-editor {
          font-family: 'Vazirmatn', sans-serif !important;
          text-align: right !important;
          direction: rtl !important;
          line-height: 1.8 !important;
        }

        /* Robust printing fix */
        @media print {
          @page {
            margin: 0 !important;
            size: auto;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* Hide everything except printable area when printing */
          .print\\:hidden, button, header, nav, .sidebar {
            display: none !important;
          }
        }
      `}</style>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-gray-900 border border-slate-200/60 p-4 rounded-2xl gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100 hidden sm:block">
            <Building2 size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-gray-800 dark:text-white">
                {selectedCompany.name}
              </h1>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-black">
                دبیرخانه
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${activeSection === "headquarters" ? "bg-purple-100 text-purple-700" : "bg-indigo-100 text-indigo-700"}`}
              >
                {activeSection === "headquarters" ? "دفتر مرکزی" : "کارخانه"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              مدیریت نامه‌ها، کارتابل جاری و آرشیو بایگانی اسناد اداری
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <button
            onClick={() => {
              setActiveSection(null);
              setActiveTab("cartable");
            }}
            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg transition-all"
          >
            <ArrowRight size={14} /> تغییر بخش دبیرخانه
          </button>

          <button
            onClick={() => {
              setSelectedCompany(null);
              setActiveSection(null);
              setActiveTab("cartable");
            }}
            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg transition-all"
          >
            تغییر شرکت
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800 p-1 rounded-xl self-start flex-wrap">
          <button
            onClick={() => setActiveTab("cartable")}
            className={`flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-lg transition-all ${
              activeTab === "cartable"
                ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <FileText size={15} /> کارتابل اداری
          </button>

          <button
            onClick={() => setActiveTab("archive")}
            className={`flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-lg transition-all ${
              activeTab === "archive"
                ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Archive size={15} /> آرشیو و بایگانی
          </button>

          <button
            onClick={() => setActiveTab("templates")}
            className={`flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-lg transition-all ${
              activeTab === "templates"
                ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BookOpen size={15} /> قالب‌ها و نمونه‌نامه‌ها
          </button>

          {isSuperUser && (
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-lg transition-all ${
                activeTab === "settings"
                  ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Settings2 size={15} /> تنظیمات، دسترسی‌ها و سربرگ
            </button>
          )}
        </div>

        <button
          onClick={handleOpenNewLetterModal}
          className="flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all"
        >
          <Plus size={16} /> ثبت نامه اداری جدید
        </button>
      </div>

      {/* TABS CONTENT */}

      {/* A. CARTABLE AND ARCHIVE VIEWS */}
      {(activeTab === "cartable" || activeTab === "archive") && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls Bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در موضوع، شماره نامه، فرستنده و گیرنده..."
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 left-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Letter Type Filters */}
            <div className="flex flex-wrap md:flex-nowrap items-center gap-1 bg-slate-50 border p-1 rounded-xl self-start w-full md:w-auto">
              {[
                { id: "all", label: "همه نامه‌ها" },
                { id: "internal", label: "داخلی" },
                { id: "incoming", label: "وارده" },
                { id: "outgoing", label: "صادره" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFilterType(opt.id as any)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${filterType === opt.id ? "bg-white text-slate-800 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Letter List Grid */}
          {filteredLetters.length === 0 ? (
            <div className="glass-panel text-center py-16 px-4 rounded-2xl border border-dashed border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-700 text-sm mb-1">
                نامه‌ای یافت نشد
              </h3>
              <p className="text-xs text-slate-400">
                هیچ نامه‌ای با فیلترها و معیارهای مورد نظر شما یافت نشد.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLetters.map((letter) => {
                const isReferredToMe = letter.referredTo?.includes(
                  currentUser.id,
                );
                return (
                  <motion.div
                    key={letter.id}
                    layoutId={`letter-card-${letter.id}`}
                    whileHover={{ y: -2 }}
                    className={`glass-panel border rounded-2xl p-4 flex flex-col justify-between transition-all bg-white relative ${
                      isReferredToMe
                        ? "border-amber-200 shadow-sm ring-1 ring-amber-100"
                        : "border-slate-150 shadow-xs"
                    }`}
                  >
                    {isReferredToMe && (
                      <span className="absolute -top-2.5 -left-2.5 bg-amber-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                        <CornerDownLeft size={10} /> ارجاع به شما
                      </span>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          {letter.letterNumber}
                        </span>
                        <div className="flex gap-1.5 items-center">
                          {/* Type Label Badge */}
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                              letter.type === "internal"
                                ? "bg-purple-50 text-purple-700 border border-purple-100"
                                : letter.type === "incoming"
                                  ? "bg-blue-50 text-blue-700 border border-blue-100"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            }`}
                          >
                            {letter.type === "internal"
                              ? "داخلی"
                              : letter.type === "incoming"
                                ? "وارده"
                                : "صادره"}
                          </span>

                          {/* Status Badge */}
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              letter.status === SecretariatLetterStatus.APPROVED
                                ? "bg-emerald-100 text-emerald-800"
                                : letter.status ===
                                    SecretariatLetterStatus.REJECTED
                                  ? "bg-red-100 text-red-800"
                                  : letter.status ===
                                      SecretariatLetterStatus.DRAFT
                                    ? "bg-gray-100 text-gray-800"
                                    : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {letter.status}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-gray-800 text-sm line-clamp-1 mb-1">
                          {letter.subject}
                        </h4>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 pt-1">
                          <span className="truncate">
                            فرستنده: <b>{letter.sender}</b>
                          </span>
                          <span className="truncate">
                            گیرنده: <b>{letter.receiver}</b>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="border-t mt-3 pt-2 flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-0.5">
                          <Calendar size={12} /> {letter.date}
                        </span>
                        {letter.attachments?.length > 0 && (
                          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Paperclip size={10} /> {letter.attachments.length}
                          </span>
                        )}
                        {letter.approvedBy?.length > 0 && (
                          <span
                            className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5 font-bold"
                            title="امضا شده"
                          >
                            <CheckCircle size={10} /> {letter.approvedBy.length} امضا
                          </span>
                        )}
                      </div>

                      {letter.isPrivate && (
                        <span className="text-[9px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                          <Lock size={9} /> محرمانه
                        </span>
                      )}
                    </div>

                    {/* Integrated Workflow & Action Controls */}
                    {(() => {
                      const totalSigners = letter.signers?.length || 0;
                      const signedCount = letter.approvedBy?.length || 0;
                      const isSigned = isLetterSigned(letter);
                      const isEditableBeforeSign = !isSigned && canEditLetter(letter);

                      let stageLabel = "ثبت اولیه و پیش‌نویس";
                      let stageColor = "bg-slate-50 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700";
                      let stageIcon = <Clock size={12} className="text-slate-500 shrink-0" />;

                      if (letter.status === SecretariatLetterStatus.ARCHIVED) {
                        stageLabel = "بایگانی شده";
                        stageColor = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300";
                        stageIcon = <Archive size={12} className="text-slate-500 shrink-0" />;
                      } else if (totalSigners > 0 && signedCount >= totalSigners) {
                        stageLabel = "امضاها تکمیل شد (تایید نهایی) ✅";
                        stageColor = "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50";
                        stageIcon = <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />;
                      } else if (totalSigners > 0 && signedCount > 0) {
                        stageLabel = `در حال اخذ امضا (${toPersianDigits(signedCount)} از ${toPersianDigits(totalSigners)})`;
                        stageColor = "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800/50";
                        stageIcon = <Activity size={12} className="text-blue-600 shrink-0 animate-pulse" />;
                      } else if (totalSigners > 0) {
                        stageLabel = `در انتظار امضا (${toPersianDigits(totalSigners)} مسئول)`;
                        stageColor = "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/50";
                        stageIcon = <Clock size={12} className="text-amber-600 shrink-0" />;
                      } else if (letter.referredTo && letter.referredTo.length > 0) {
                        stageLabel = `در دست اقدام و ارجاع (${toPersianDigits(letter.referredTo.length)} نفر)`;
                        stageColor = "bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/50";
                        stageIcon = <GitBranch size={12} className="text-purple-600 shrink-0" />;
                      }

                      return (
                        <div className="mt-2.5 pt-2 border-t border-slate-150 dark:border-slate-800 space-y-2">
                          {/* Workflow Stage Tracker Bar */}
                          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-[11px] font-bold ${stageColor}`}>
                            <div className="flex items-center gap-1.5 truncate">
                              {stageIcon}
                              <span className="truncate">روال: {stageLabel}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setViewingWorkflowLetter(letter)}
                              className="text-[10px] text-purple-700 hover:text-purple-900 dark:text-purple-300 font-black flex items-center gap-0.5 shrink-0 hover:underline cursor-pointer mr-1"
                              title="مشاهده نمودار گردش کار و مراحل نامه"
                            >
                              مشاهده روال <ArrowLeft size={10} />
                            </button>
                          </div>

                          {/* Card Action Buttons */}
                          <div className="flex items-center justify-between gap-1.5 pt-0.5 text-[11px]">
                            <div className="flex items-center gap-1">
                              {/* Print & PDF Button */}
                              <button
                                type="button"
                                onClick={() => setIsPrintMode(letter)}
                                className="p-1.5 px-2.5 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 rounded-xl font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="پیش‌نمایش و چاپ نامه با سربرگ و کیفیت ۳۰۰ DPI"
                              >
                                <Printer size={12} />
                                <span>چاپ و PDF</span>
                              </button>

                              {/* Edit Button (Enabled Before Signatures) */}
                              {isEditableBeforeSign && (
                                <button
                                  type="button"
                                  onClick={() => handleEditLetterClick(letter)}
                                  className="p-1.5 px-2 text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded-xl font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="ویرایش نامه قبل از امضا"
                                >
                                  <Edit3 size={12} />
                                  <span>ویرایش</span>
                                </button>
                              )}
                            </div>

                            {/* Details & Actions Button */}
                            <button
                              type="button"
                              onClick={() => setSelectedLetterForView(letter)}
                              className="p-1.5 px-2.5 text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 rounded-xl font-bold flex items-center gap-1 transition-colors cursor-pointer mr-auto"
                              title="مشاهده جزئیات، اقدامات و ثبت نظر"
                            >
                              <span>جزئیات و اقدام</span>
                              <ChevronLeft size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* B. TEMPLATES VIEW */}
      {activeTab === "templates" && (
        <div className="space-y-4 animate-fade-in" dir="rtl">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border dark:border-slate-700 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex-1 relative">
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={templateSearchTerm}
                onChange={(e) => setTemplateSearchTerm(e.target.value)}
                placeholder="جستجو در عناوین و متن قالب‌های نمونه نامه..."
                className="w-full pl-4 pr-10 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingTemplate({
                    id: generateUUID(),
                    title: "",
                    category: "اداری",
                    content: "",
                    createdAt: Date.now(),
                  });
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus size={15} /> افزودن قالب نمونه نامه جدید
              </button>
            </div>
          </div>

          {/* Templates Grid */}
          {templates.filter(
            (t) =>
              !templateSearchTerm ||
              t.title.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
              t.content.toLowerCase().includes(templateSearchTerm.toLowerCase()),
          ).length === 0 ? (
            <div className="glass-panel text-center py-16 px-4 rounded-2xl border border-dashed border-slate-200 bg-white dark:bg-slate-800/50">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-1">
                قالب نمونه نامه‌ای ثبت نشده است
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                شما می‌توانید قالب‌های استاندارد اداری، احکام و صورتجلسات را ایجاد کنید تا در هنگام نگارش نامه به سرعت بارگذاری شوند.
              </p>
              <button
                onClick={() => {
                  setEditingTemplate({
                    id: generateUUID(),
                    title: "",
                    category: "اداری",
                    content: "",
                    createdAt: Date.now(),
                  });
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
              >
                ایجاد اولین قالب
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates
                .filter(
                  (t) =>
                    !templateSearchTerm ||
                    t.title.toLowerCase().includes(templateSearchTerm.toLowerCase()) ||
                    t.content.toLowerCase().includes(templateSearchTerm.toLowerCase()),
                )
                .map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-all space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b dark:border-slate-700/80 pb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                          {tmpl.category || "عمومی"}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingTemplate(tmpl)}
                            className="p-1 text-slate-400 hover:text-purple-600 rounded transition-colors"
                            title="ویرایش قالب"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tmpl.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                            title="حذف قالب"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                        {tmpl.title}
                      </h4>

                      <div
                        className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800"
                        dangerouslySetInnerHTML={{
                          __html: tmpl.content?.replace(/<[^>]*>?/gm, "") || "",
                        }}
                      />
                    </div>

                    <div className="border-t dark:border-slate-700/80 pt-3 flex justify-end">
                      <button
                        onClick={() => {
                          resetForm();
                          const currentDate = getCurrentShamsiDate();
                          setNewLetterForm((prev) => ({
                            ...prev,
                            date: `${currentDate.year}/${String(currentDate.month).padStart(2, "0")}/${String(currentDate.day).padStart(2, "0")}`,
                            subject: tmpl.title,
                            content: tmpl.content,
                          }));
                          setShowNewLetterModal(true);
                        }}
                        className="w-full bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <FileCheck size={14} /> استفاده در نگارش نامه جدید
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

                    {/* Template Edit / Create Modal */}
          <AnimatePresence>
            {editingTemplate && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col text-right"
                  dir="rtl"
                >
                  <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
                    <h3 className="text-base font-black text-gray-800 dark:text-white">
                      {editingTemplate.id ? "ویرایش قالب آماده" : "ثبت قالب آماده جدید"}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingTemplate(null)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <form onSubmit={handleSaveTemplate} className="space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">عنوان قالب</label>
                      <input
                        required
                        type="text"
                        value={editingTemplate.title || ""}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                        className="w-full border dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
                        placeholder="مثال: درخواست مرخصی، اخطار کتبی، دعوتنامه"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">دسته‌بندی</label>
                      <input
                        type="text"
                        value={editingTemplate.category || ""}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                        className="w-full border dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
                        placeholder="مثال: اداری، مالی، منابع انسانی"
                      />
                    </div>
                    <div className="flex-1 flex flex-col min-h-[160px]">
                      <label className="text-xs font-bold text-slate-500 mb-1 block">متن پیش‌فرض قالب</label>
                      <textarea
                        value={editingTemplate.content || ""}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                        className="w-full flex-1 border dark:border-slate-700 dark:bg-slate-800 rounded-xl p-3 text-sm resize-none"
                        placeholder="متن نامه یا قالب مورد نظر..."
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setEditingTemplate(null)}
                        className="px-4 py-2 rounded-xl border dark:border-slate-700 text-xs font-bold"
                      >
                        انصراف
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md"
                      >
                        ذخیره قالب
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* 1. REGISTER NEW LETTER MODAL */}
          <AnimatePresence>
            {showNewLetterModal && (
              <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-0 sm:p-1 overflow-hidden">
                <motion.div
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  className="bg-slate-100 dark:bg-slate-900 w-full h-full rounded-none sm:rounded-xl border-0 sm:border border-slate-200 dark:border-slate-800 p-1.5 sm:p-2 flex flex-col overflow-hidden text-right shadow-2xl"
                  dir="rtl"
                >
                  <div className="flex items-center justify-between border-b dark:border-slate-800 pb-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                  <h3 className="text-xs sm:text-sm font-black text-gray-800 dark:text-white">
                    {editingLetterId ? "ویرایش نامه اداری" : "ثبت و تدوین نامه اداری جدید"}
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                    {selectedCompany?.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 shadow-2xs hover:bg-indigo-100"
                    title={isMetadataExpanded ? "جمع کردن مشخصات (فضای بزرگتر برای تایپ)" : "نمایش فرم کامل مشخصات"}
                  >
                    {isMetadataExpanded ? <span>▲ جمع‌کردن مشخصات</span> : <span>▼ بزرگ‌نمایی فضای تایپ (فعال)</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const latestHtml = syncEditorContent();
                      const existingNum = editingLetterId
                        ? letters.find((l) => l.id === editingLetterId)?.letterNumber
                        : undefined;
                      const fakeLetter: SecretariatLetter = {
                        ...(newLetterForm as any),
                        content: latestHtml,
                        id: editingLetterId || "preview_only",
                        companyId: selectedCompany.id,
                        status: SecretariatLetterStatus.DRAFT,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        letterNumber: existingNum || "پیش‌نویس",
                        date: newLetterForm.date || "پیش‌نویس",
                        hideSubjectInLetter: true,
                        hideSalutationInLetter: true,
                      };
                      setIsPrintMode(fakeLetter);
                    }}
                    className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 text-amber-700 dark:text-amber-300 text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                  >
                    <Eye size={13} /> <span className="hidden sm:inline">مشاهده پیش‌نویس</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewLetterModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveLetter} className="flex-1 flex flex-col overflow-hidden gap-2 min-h-0 pt-2">
                {/* Compact Metadata Ribbon */}
                <div className="bg-white dark:bg-slate-800 border dark:border-slate-700/80 rounded-xl p-1.5 sm:p-2 shadow-xs shrink-0 transition-all">
                {!isMetadataExpanded ? (
                  /* Compact Single-Row Metadata Ribbon (Pulls writing area upwards) */
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">موضوع:</span>
                      <input
                        required
                        type="text"
                        value={newLetterForm.subject}
                        onChange={(e) =>
                          setNewLetterForm({
                            ...newLetterForm,
                            subject: e.target.value,
                          })
                        }
                        placeholder="موضوع نامه اداری..."
                        className="flex-1 border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">فرستنده:</span>
                        <input
                          type="text"
                          value={newLetterForm.sender}
                          onChange={(e) => setNewLetterForm({ ...newLetterForm, sender: e.target.value })}
                          placeholder="فرستنده..."
                          className="w-24 sm:w-36 border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2 py-0.5 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">گیرنده:</span>
                        <input
                          type="text"
                          value={newLetterForm.receiver}
                          onChange={(e) => setNewLetterForm({ ...newLetterForm, receiver: e.target.value })}
                          placeholder="گیرنده..."
                          className="w-24 sm:w-36 border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2 py-0.5 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">تاریخ:</span>
                        <input
                          type="text"
                          value={newLetterForm.date}
                          onChange={(e) => setNewLetterForm({ ...newLetterForm, date: e.target.value })}
                          className="w-20 sm:w-24 border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-1.5 py-0.5 text-xs text-center font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedOptionsModal(true)}
                        className="px-2 py-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[11px] font-bold flex items-center gap-1"
                        title="تنظیمات تکمیلی، امضاها، مهر و ضمائم"
                      >
                        <Sliders size={12} />
                        <span>امضا و ضمائم ({newLetterForm.attachments?.length || 0})</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Expanded Full Metadata Form */
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2 items-center">
                      {/* Subject */}
                      <div className="md:col-span-4 space-y-0.5">
                        <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
                          <span>موضوع نامه</span>
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          required
                          type="text"
                          value={newLetterForm.subject}
                          onChange={(e) =>
                            setNewLetterForm({
                              ...newLetterForm,
                              subject: e.target.value,
                            })
                          }
                          placeholder="مثال: درخواست تأمین تجهیزات حفاظتی"
                          className="w-full border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 dark:text-slate-100"
                        />
                      </div>

                      {/* Sender */}
                      <div className="md:col-span-2 space-y-0.5">
                        <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">فرستنده (از طرف)</label>
                        <input
                          required
                          type="text"
                          list="user-list"
                          value={newLetterForm.sender}
                          onChange={(e) =>
                            setNewLetterForm({
                              ...newLetterForm,
                              sender: e.target.value,
                            })
                          }
                          placeholder="مثال: مدیریت دفتر مرکزی"
                          className="w-full border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2.5 py-1 text-xs"
                        />
                      </div>

                      {/* Receiver */}
                      <div className="md:col-span-2 space-y-0.5">
                        <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">گیرنده (به سمت)</label>
                        <input
                          required
                          type="text"
                          list="user-list"
                          value={newLetterForm.receiver}
                          onChange={(e) =>
                            setNewLetterForm({
                              ...newLetterForm,
                              receiver: e.target.value,
                            })
                          }
                          placeholder="مثال: سرپرست کارخانه"
                          className="w-full border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2.5 py-1 text-xs"
                        />
                      </div>

                      {/* Type */}
                      <div className="md:col-span-2 space-y-0.5">
                        <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">نوع نامه</label>
                        <select
                          value={newLetterForm.type}
                          onChange={(e) =>
                            setNewLetterForm({
                              ...newLetterForm,
                              type: e.target.value as any,
                            })
                          }
                          className="w-full border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2 py-1 text-xs bg-white dark:text-white"
                        >
                          <option value="internal">داخلی (بین‌بخشی)</option>
                          <option value="incoming">وارده (سازمان بیرونی)</option>
                          <option value="outgoing">صادره (سازمان بیرونی)</option>
                        </select>
                      </div>

                      {/* Date */}
                      <div className="md:col-span-2 space-y-0.5">
                        <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">تاریخ نامه (شمسی)</label>
                        <input
                          required
                          type="text"
                          value={newLetterForm.date}
                          onChange={(e) =>
                            setNewLetterForm({
                              ...newLetterForm,
                              date: e.target.value,
                            })
                          }
                          placeholder="۱۴۰۵/۰۴/۰۶"
                          className="w-full border dark:border-slate-700 dark:bg-slate-900 rounded-lg px-2 py-1 text-xs font-mono text-center"
                        />
                      </div>

                      <datalist id="user-list">
                        {users.map((u) => (
                          <option key={u.id} value={u.fullName} />
                        ))}
                      </datalist>
                    </div>

                    {/* Inline quick checkboxes and advanced settings trigger */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t dark:border-slate-700/60 text-xs">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-bold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newLetterForm.hideSubjectInLetter}
                            onChange={(e) =>
                              setNewLetterForm({
                                ...newLetterForm,
                                hideSubjectInLetter: e.target.checked,
                              })
                            }
                            className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                          حذف موضوع از متن
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-bold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newLetterForm.hideSalutationInLetter}
                            onChange={(e) =>
                              setNewLetterForm({
                                ...newLetterForm,
                                hideSalutationInLetter: e.target.checked,
                              })
                            }
                            className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                          حذف عبارت «با سلام و احترام»
                        </label>
                        {companySettingsForm.companyStampUrl && (
                          <label className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400 font-bold cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={newLetterForm.addCompanyStamp}
                              onChange={(e) =>
                                setNewLetterForm({
                                  ...newLetterForm,
                                  addCompanyStamp: e.target.checked,
                                })
                              }
                              className="rounded text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                            />
                            درج مهر شرکت
                          </label>
                        )}
                        <label className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-bold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newLetterForm.hasAttachment || (newLetterForm.attachments && newLetterForm.attachments.length > 0)}
                            onChange={(e) =>
                              setNewLetterForm({
                                ...newLetterForm,
                                hasAttachment: e.target.checked,
                              })
                            }
                            className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
                          />
                          <span>پیوست دارد</span>
                          {Boolean(newLetterForm.hasAttachment || newLetterForm.attachments?.length) && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-300 font-normal">
                              ({newLetterForm.attachmentDescription || (newLetterForm.attachments?.length ? `${newLetterForm.attachments.length} فایل` : "دارد")})
                            </span>
                          )}
                        </label>
                        <label className="flex items-center gap-1.5 text-[11px] text-purple-600 dark:text-purple-400 font-bold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newLetterForm.isPrivate}
                            onChange={(e) =>
                              setNewLetterForm({
                                ...newLetterForm,
                                isPrivate: e.target.checked,
                              })
                            }
                            className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                          نامه محرمانه
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedOptionsModal(true)}
                          className="flex items-center gap-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
                        >
                          <Sliders size={13} />
                          تنظیمات تکمیلی، امضاها و ضمائم ({newLetterForm.attachments?.length || 0} پیوست)
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

                {/* Virtual Google Docs Workspace Canvas - Maximized Height */}
                <div className="flex-1 min-h-0 flex flex-col bg-slate-200/90 dark:bg-slate-950 rounded-xl border border-slate-300 dark:border-slate-800 overflow-hidden shadow-inner">
                  {/* Google Docs Styled Menu Bar */}
                  <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-b dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 select-none relative z-40 shrink-0">
                    {/* Doc Icon & Subject */}
                    <div className="flex items-center gap-1.5 border-l border-slate-300 dark:border-slate-700 pl-3 ml-1 text-purple-600 dark:text-purple-400">
                      <FileText size={15} />
                      <span className="truncate max-w-[150px]">
                        {newLetterForm.subject || "پیش‌نویس بدون نام"}
                      </span>
                    </div>

                    {/* File Menu */}
                    <div className="relative">
                      <input
                        type="file"
                        accept=".docx"
                        ref={docxImportInputRef}
                        onChange={handleDocxImport}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === "file" ? null : "file");
                        }}
                        className={`px-3 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 ${activeMenu === "file" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
                      >
                        پرونده
                      </button>
                      {activeMenu === "file" && (
                        <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-800 border dark:border-white/10 rounded-lg shadow-xl py-1 text-right text-xs z-50 text-slate-800 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() => {
                              handleSaveLetter();
                              setActiveMenu(null);
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between font-bold text-blue-600 dark:text-blue-400"
                          >
                            <span>ذخیره پیش‌نویس</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Ctrl+S
                            </span>
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-700" />
                          <button
                            type="button"
                            onClick={() => docxImportInputRef.current?.click()}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold"
                          >
                            <span>وارد کردن متن از فایل Word</span>
                            <Upload size={12} className="text-emerald-500" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              window.print();
                              setActiveMenu(null);
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>چاپ سند</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Ctrl+P
                            </span>
                          </button>

                          {editingLetterId && (
                            <>
                              <hr className="my-1 border-slate-100 dark:border-slate-700" />
                              <a
                                href={`/api/secretariat/letters/${editingLetterId}/pdf`}
                                download={`Letter_${editingLetterId}.pdf`}
                                className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-rose-600 font-bold"
                                onClick={() => setActiveMenu(null)}
                              >
                                <span>دانلود خروجی PDF</span>
                                <FileText size={12} className="text-rose-500" />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  openSendToChat({
                                    fileUrl: `/api/secretariat/letters/${editingLetterId}/pdf`,
                                    fileName: `Letter_${editingLetterId}.pdf`,
                                    title: "ارسال فایل PDF نامه به گفتگو",
                                    defaultMessage: `📄 فایل PDF نامه اداری: ${newLetterForm.subject || 'نامه رسمی'}`
                                  });
                                  setActiveMenu(null);
                                }}
                                className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-emerald-600 font-bold cursor-pointer"
                              >
                                <span>ارسال فایل PDF به گفتگو</span>
                                <MessageSquare size={12} className="text-emerald-500" />
                              </button>
                              <a
                                href={`/api/secretariat/letters/${editingLetterId}/docx`}
                                download={`Letter_${editingLetterId}.docx`}
                                className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-indigo-600 font-bold"
                                onClick={() => setActiveMenu(null)}
                              >
                                <span>دانلود خروجی Word</span>
                                <FileText
                                  size={12}
                                  className="text-indigo-500"
                                />
                              </a>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              if (!newLetterForm.content) {
                                alert("ابتدا متنی در سند بنویسید.");
                                return;
                              }
                              const title = prompt(
                                "لطفا عنوانی برای این قالب نمونه نامه وارد کنید:",
                                newLetterForm.subject || "قالب جدید",
                              );
                              if (!title) return;

                              handleSaveTemplate({
                                title: title,
                                subject: newLetterForm.subject || "",
                                content: newLetterForm.content,
                                category: "اداری",
                              });
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-purple-600 dark:text-purple-400 font-bold"
                          >
                            <span>ذخیره به عنوان نمونه نامه</span>
                            <Save size={12} className="text-purple-500" />
                          </button>

                          <hr className="my-1 border-slate-100 dark:border-slate-700" />

                          <button
                            type="button"
                            onClick={handleInsertMinutesTemplate}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>درج قالب صورتجلسه پیش‌فرض</span>
                            <FileCheck size={12} className="text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setNewLetterForm({
                                ...newLetterForm,
                                content: "",
                              })
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-red-600 dark:text-red-400"
                          >
                            <span>پاک کردن کل متن سند</span>
                            <Trash2 size={12} className="text-red-400" />
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-700" />
                          <button
                            type="button"
                            onClick={() => setShowNewLetterModal(false)}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>خروج و بستن ویرایشگر</span>
                            <X size={12} className="text-slate-400" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Edit Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === "edit" ? null : "edit");
                        }}
                        className={`px-3 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 ${activeMenu === "edit" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
                      >
                        ویرایش
                      </button>
                      {activeMenu === "edit" && (
                        <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-slate-800 border dark:border-white/10 rounded-lg shadow-xl py-1 text-right text-xs z-50 text-slate-800 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={handleUndo}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>واگرد (Undo)</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Ctrl+Z
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={handleRedo}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>مجدد (Redo)</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Ctrl+Y
                            </span>
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-700" />
                          <button
                            type="button"
                            onClick={handleSelectAll}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>انتخاب همه متن</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Ctrl+A
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearFormatting}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>پاک کردن قالب‌بندی‌ها</span>
                            <Trash2 size={12} className="text-slate-400" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Insert Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(
                            activeMenu === "insert" ? null : "insert",
                          );
                        }}
                        className={`px-3 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 ${activeMenu === "insert" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
                      >
                        درج
                      </button>
                      {activeMenu === "insert" && (
                        <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-slate-800 border dark:border-white/10 rounded-lg shadow-xl py-1 text-right text-xs z-50 text-slate-800 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() =>
                              insertHTML(
                                '<p style="text-align:right; font-weight:bold;">با سلام و احترام،</p><p style="text-align:justify;">بازگشت به نامه شماره ... مورخ ... به استحضار می‌رساند؛ </p>',
                              )
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>شروع رسمی نامه (با سلام و احترام)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              insertHTML(
                                '<p style="text-align:right; font-weight:bold; margin-top:20px;">با تجدید احترام</p><p style="text-align:right; margin-bottom:20px;">مدیریت ...</p>',
                              )
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>پایان رسمی نامه (با تجدید احترام)</span>
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-700" />
                          <button
                            type="button"
                            onClick={() => {
                              const url = prompt(
                                "لطفا آدرس اینترنتی (URL) تصویر را وارد کنید:",
                              );
                              if (url)
                                insertHTML(
                                  `<img src="${url}" style="max-width:100%; border-radius:8px;" />`,
                                );
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>تصویر (از لینک)</span>
                            <FileText size={12} className="text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const quill = quillRef.current?.getEditor();
                              if (quill && quill.getModule("table")) {
                                quill.getModule("table").insertTable(3, 3);
                              } else {
                                insertHTML(
                                  '<table style="width:100%; border-collapse:collapse; margin:10px 0;"><tr style="background:#f8fafc;"><th style="border:1px solid #cbd5e1; padding:8px; text-align:right;">ردیف</th><th style="border:1px solid #cbd5e1; padding:8px; text-align:right;">عنوان</th><th style="border:1px solid #cbd5e1; padding:8px; text-align:right;">توضیحات</th></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;">۱</td><td style="border:1px solid #cbd5e1; padding:8px;"></td><td style="border:1px solid #cbd5e1; padding:8px;"></td></tr><tr><td style="border:1px solid #cbd5e1; padding:8px;">۲</td><td style="border:1px solid #cbd5e1; padding:8px;"></td><td style="border:1px solid #cbd5e1; padding:8px;"></td></tr></table>',
                                );
                              }
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>جدول اداری خام</span>
                            <Award size={12} className="text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              insertHTML(
                                '<hr style="border:0; border-top:1px solid #cbd5e1; margin:15px 0;" />',
                              )
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>خط افقی جداکننده</span>
                            <span className="text-[10px] text-slate-400">
                              ---
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              insertHTML(
                                '<br style="page-break-after: always; break-after: page;" />',
                              )
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>شکست صفحه (Page Break)</span>
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-700" />
                          <button
                            type="button"
                            onClick={() =>
                              insertHTML(
                                `<b>تاریخ: ${newLetterForm.date || getCurrentShamsiDate()}</b>`,
                              )
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>تاریخ امروز</span>
                            <Calendar size={12} className="text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              insertHTML(
                                `<p style="text-align:left; margin-top:30px; font-weight:bold;">امضای: ${newLetterForm.sender || "فرستنده"}</p>`,
                              )
                            }
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>امضای فرستنده</span>
                            <UserCheck size={12} className="text-slate-400" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Format Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(
                            activeMenu === "format" ? null : "format",
                          );
                        }}
                        className={`px-3 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 ${activeMenu === "format" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
                      >
                        قالب‌بندی
                      </button>
                      {activeMenu === "format" && (
                        <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 border dark:border-white/10 rounded-lg shadow-xl py-1 text-right text-xs z-50 text-slate-800 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() => {
                              insertHTML('<div style="line-height: 1.0;">'); // Not perfect but triggers format
                              if (quillRef.current) {
                                const q = quillRef.current?.getEditor?.();
                                if (q) q.formatLine(
                                  0,
                                  q.getLength(),
                                  "lineHeight",
                                  "1.0",
                                );
                              }
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>فاصله خطوط: تک (1.0)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (quillRef.current) {
                                const q = quillRef.current?.getEditor?.();
                                if (q) q.formatLine(
                                  0,
                                  q.getLength(),
                                  "lineHeight",
                                  "1.5",
                                );
                              }
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>فاصله خطوط: 1.5</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (quillRef.current) {
                                const q = quillRef.current?.getEditor?.();
                                if (q) q.formatLine(
                                  0,
                                  q.getLength(),
                                  "lineHeight",
                                  "2.0",
                                );
                              }
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>فاصله خطوط: دو (2.0)</span>
                          </button>
                          <hr className="my-1 border-slate-100 dark:border-slate-700" />
                          <button
                            type="button"
                            onClick={() => {
                              handleSmartAlign("justify");
                              setActiveMenu(null);
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between font-bold text-purple-700 dark:text-purple-300"
                          >
                            <span>تنظیم و هم‌ترازی دوطرفه خطوط (Justify)</span>
                            <AlignJustify size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tools Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(
                            activeMenu === "tools" ? null : "tools",
                          );
                        }}
                        className={`px-3 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 ${activeMenu === "tools" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
                      >
                        ابزارها
                      </button>
                      {activeMenu === "tools" && (
                        <div className="absolute right-0 mt-1.5 w-56 bg-white dark:bg-slate-800 border dark:border-white/10 rounded-lg shadow-xl py-1 text-right text-xs z-50 text-slate-800 dark:text-slate-200">
                          <button
                            type="button"
                            onClick={() => {
                              const cleanText = (newLetterForm.content || "")
                                .replace(/<[^>]*>/g, "")
                                .trim();
                              const wCount = cleanText
                                ? cleanText.split(/\s+/).length
                                : 0;
                              const cCount = cleanText.length;
                              const minutes = Math.ceil(wCount / 180);
                              alert(
                                `آمار نگارش سند:\n\nتعداد کلمات: ${wCount} کلمه\nتعداد حروف: ${cCount} کاراکتر\nزمان تخمینی مطالعه: ${minutes} دقیقه`,
                              );
                            }}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>شمارش کلمات</span>
                            <FileText size={12} className="text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowFindReplace(!showFindReplace)}
                            className="w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                          >
                            <span>جستجو و جایگزینی (Find)</span>
                            <Edit size={12} className="text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={handleTTS}
                            className={`w-full text-right px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between ${isReadingAloud ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 font-bold" : ""}`}
                          >
                            <span>
                              {isReadingAloud
                                ? "توقف خوانش صوتی"
                                : "خوانش صوتی با هوش مصنوعی"}
                            </span>
                            <Volume2
                              size={12}
                              className={
                                isReadingAloud
                                  ? "text-indigo-600"
                                  : "text-slate-400"
                              }
                            />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Microsoft Word & Google Docs/Sheets Suite Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === "office" ? null : "office");
                        }}
                        className={`px-3 py-1 rounded-md text-blue-700 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/40 transition flex items-center gap-1.5 font-extrabold ${activeMenu === "office" ? "ring-2 ring-blue-500" : ""}`}
                        title="اتصال و هماهنگی کامل با Microsoft Word و Google Docs/Sheets"
                      >
                        <FileSpreadsheet size={13} className="text-emerald-600 dark:text-emerald-400" />
                        <span>مایکروسافت ورد و گوگل داکس/شیت</span>
                      </button>
                      {activeMenu === "office" && (
                        <div className="absolute right-0 mt-1.5 w-72 bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 text-right text-xs z-50 text-slate-800 dark:text-slate-200 divide-y divide-slate-100 dark:divide-slate-700/60 animate-in fade-in zoom-in-95">
                          <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 text-[11px] font-bold text-blue-950 dark:text-blue-200">
                            امکانات مایکروسافت ورد و سرویس‌های گوگل:
                          </div>

                          <div className="py-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleQuickDocxDownload();
                                setActiveMenu(null);
                              }}
                              disabled={quickWordDownloading}
                              className="w-full text-right px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between font-bold text-blue-600 dark:text-blue-400"
                            >
                              <div className="flex items-center gap-2">
                                <FileDown size={14} className="text-blue-600" />
                                <span>دانلود مستقیم فایل Word (.docx)</span>
                              </div>
                              <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 px-1.5 py-0.5 rounded font-mono">
                                .docx
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                docxImportInputRef.current?.click();
                                setActiveMenu(null);
                              }}
                              className="w-full text-right px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between font-bold text-emerald-600 dark:text-emerald-400"
                            >
                              <div className="flex items-center gap-2">
                                <FileUp size={14} className="text-emerald-600" />
                                <span>باز کردن و استخراج فایل Word (.docx)</span>
                              </div>
                              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
                                Import
                              </span>
                            </button>
                          </div>

                          <div className="py-1">
                            <button
                              type="button"
                              onClick={() => {
                                setTableModalTab("custom");
                                setShowTableModal(true);
                                setActiveMenu(null);
                              }}
                              className="w-full text-right px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between font-medium text-blue-700 dark:text-blue-300"
                            >
                              <div className="flex items-center gap-2">
                                <Table size={14} className="text-blue-600" />
                                <span>طراحی و درج جدول سازمانی سفارشی</span>
                              </div>
                              <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                جدول
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTableModalTab("templates");
                                setShowTableModal(true);
                                setActiveMenu(null);
                              }}
                              className="w-full text-right px-3 py-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 flex items-center justify-between font-medium text-purple-700 dark:text-purple-300"
                            >
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet size={14} className="text-purple-600" />
                                <span>قالب‌های آماده جدول اداری و مالی</span>
                              </div>
                              <span className="text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-700 px-1.5 py-0.5 rounded font-bold">
                                الگوها
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTableModalTab("paste");
                                setShowTableModal(true);
                                setActiveMenu(null);
                              }}
                              className="w-full text-right px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center justify-between font-medium text-amber-700 dark:text-amber-300"
                            >
                              <div className="flex items-center gap-2">
                                <Table size={14} className="text-amber-600" />
                                <span>پیست مستقیم جدول از اکسل (Excel / Calc)</span>
                              </div>
                              <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded font-bold">
                                Paste
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Help Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === "help" ? null : "help");
                        }}
                        className={`px-3 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1 ${activeMenu === "help" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
                      >
                        راهنما
                      </button>
                      {activeMenu === "help" && (
                        <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-slate-800 border dark:border-white/10 rounded-lg shadow-2xl py-2 px-3 text-right text-[11px] z-50 text-slate-800 dark:text-slate-200 space-y-1.5 leading-relaxed">
                          <h5 className="font-black text-purple-700 dark:text-purple-400 border-b dark:border-slate-700 pb-1">
                            نکات نگارش رسمی و سازمانی
                          </h5>
                          <p>
                            ۱. جملات کوتاه، شفاف و عاری از کلمات مبهم بنویسید.
                          </p>
                          <p>
                            ۲. همواره لحن محترمانه و قاطع اداری را حفظ نمایید.
                          </p>
                          <p>
                            ۳. برای تراز بندی پاراگراف‌ها از کلیدهای چینش متن
                            استفاده کنید.
                          </p>
                          <p>
                            ۴. پیش از ارسال، آمار شمارش کلمات و غلط‌یابی املایی
                            را چک کنید.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Letter Templates Menu */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(
                            activeMenu === "templates" ? null : "templates",
                          );
                        }}
                        className={`px-3 py-1 rounded-md text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition flex items-center gap-1 font-extrabold ${activeMenu === "templates" ? "bg-purple-100 dark:bg-purple-950/50" : ""}`}
                      >
                        <FileText size={13} /> نمونه نامه‌ها (بانک قالب‌ها)
                      </button>
                      {activeMenu === "templates" && (
                        <div className="absolute left-0 sm:right-0 mt-1.5 w-64 bg-white dark:bg-slate-800 border border-purple-100 dark:border-white/10 rounded-lg shadow-2xl py-1 text-right text-xs z-50 text-slate-800 dark:text-slate-200 max-h-80 overflow-y-auto">
                          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-700 text-[10px] text-slate-500 font-bold space-y-1">
                            <div>نمونه نامه‌ها و نامه‌های پیشین:</div>
                            <input
                              type="text"
                              value={templateSearchTerm}
                              onChange={(e) =>
                                setTemplateSearchTerm(e.target.value)
                              }
                              placeholder="جستجوی قالب یا نامه..."
                              className="w-full text-xs p-1.5 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-1 focus:ring-purple-400"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          {/* Render Templates */}
                          {templates
                            .filter(
                              (t) =>
                                !templateSearchTerm ||
                                t.title.includes(templateSearchTerm) ||
                                (t.subject &&
                                  t.subject.includes(templateSearchTerm)),
                            )
                            .map((temp) => (
                              <button
                                key={`tpl-${temp.id}`}
                                type="button"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `آیا مطمئن هستید که می‌خواهید متن قالب "${temp.title}" را در سند فعلی درج کنید؟ (متن قبلی جایگزین می‌شود)`,
                                    )
                                  ) {
                                    setNewLetterForm((prev) => ({
                                      ...prev,
                                      subject:
                                        temp.subject ||
                                        prev.subject ||
                                        temp.title,
                                      content: temp.content,
                                    }));
                                    setActiveMenu(null);
                                  }
                                }}
                                className="w-full text-right px-4 py-2.5 hover:bg-purple-50 dark:hover:bg-purple-950/30 border-b border-slate-50 dark:border-slate-700/50 flex flex-col gap-0.5 transition-colors"
                              >
                                <span className="font-bold text-purple-700 dark:text-purple-400">
                                  [قالب] {temp.title}
                                </span>
                                {temp.subject && (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate w-full">
                                    موضوع: {temp.subject}
                                  </span>
                                )}
                              </button>
                            ))}

                          {/* Render Past Letters as Templates (Only if there is a search term to avoid huge list) */}
                          {templateSearchTerm &&
                            letters
                              .filter(
                                (l) => l.companyId === selectedCompany?.id,
                              )
                              .filter(
                                (l) =>
                                  l.subject?.includes(templateSearchTerm) ||
                                  l.letterNumber?.includes(
                                    templateSearchTerm,
                                  ) ||
                                  l.receiver?.includes(templateSearchTerm),
                              )
                              .map((l) => (
                                <button
                                  key={`let-${l.id}`}
                                  type="button"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `آیا مطمئن هستید که می‌خواهید محتوای نامه "${l.subject}" را در سند فعلی درج کنید؟ (متن قبلی جایگزین می‌شود)`,
                                      )
                                    ) {
                                      setNewLetterForm((prev) => ({
                                        ...prev,
                                        subject: l.subject,
                                        content: l.content,
                                        receiver: l.receiver,
                                      }));
                                      setActiveMenu(null);
                                    }
                                  }}
                                  className="w-full text-right px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-b border-slate-50 dark:border-slate-700/50 flex flex-col gap-0.5 transition-colors"
                                >
                                  <span className="font-bold text-blue-700 dark:text-blue-400">
                                    [نامه {toPersianDigits(l.letterNumber)}]{" "}
                                    {l.subject}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate w-full">
                                    به: {l.receiver}
                                  </span>
                                </button>
                              ))}

                          {templates.length === 0 && !templateSearchTerm && (
                            <div className="px-4 py-3 text-slate-400 text-center text-[11px]">
                              هیچ قالب نمونه نامه‌ای تعریف نشده است.
                              <br />
                              برای جستجوی نامه‌های پیشین، عبارت مورد نظر را تایپ
                              کنید.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Workspace View Mode Selector (Office Virtual Paper / Word Studio vs ONLYOFFICE vs Google Docs vs Split) */}
                    <div className="mr-auto flex items-center gap-2">
                      <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300/60 dark:border-slate-700 text-xs shadow-xs">
                        <button
                          type="button"
                          onClick={() => changeEditorViewMode("office")}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-extrabold transition-all ${
                            editorViewMode === "office"
                              ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs ring-1 ring-blue-500/30"
                              : "text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                          }`}
                          title="محیط اصلی و فوق‌پیشرفته: ویرایشگر سربرگ استاندارد اداری A4/A5 و ورد (کاملاً آفلاین و بدون نیاز به سرور خارجی)"
                        >
                          <FileText size={13} className={editorViewMode === "office" ? "text-blue-600 dark:text-blue-400" : "text-slate-500"} />
                          <span>ویرایشگر اداری و ورد</span>
                          <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-bold hidden sm:inline">آفلاین (اصلی)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            changeEditorViewMode("onlyoffice");
                            setOnlyOfficeLoadError(null);
                            handlePrepareOnlyOfficeDoc();
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition-all ${
                            editorViewMode === "onlyoffice"
                              ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-sm ring-1 ring-orange-400/40"
                              : "text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400"
                          }`}
                          title="محیط سازمانی ONLYOFFICE Docs (نیازمند اتصال به سرور داکر یا سرور اسناد)"
                        >
                          <Building2 size={13} className={editorViewMode === "onlyoffice" ? "text-amber-100" : "text-orange-500"} />
                          <span>ONLYOFFICE Docs</span>
                        </button>


                        <button
                          type="button"
                          onClick={() => {
                            changeEditorViewMode("split");
                            handlePrepareOnlyOfficeDoc();
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition-all ${
                            editorViewMode === "split"
                              ? "bg-purple-600 text-white shadow-xs"
                              : "text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400"
                          }`}
                          title="نمای همزمان دوگانه: ONLYOFFICE و سربرگ در کنار هم"
                        >
                          <Split size={13} />
                          <span className="hidden md:inline">نمای همزمان</span>
                        </button>
                      </div>

                      {/* Quick zoom controls & live page count on the left */}
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-lg text-xs font-bold" title="برآورد حجم و تعداد صفحات خروجی نامه">
                          <FileText size={12} />
                          <span>{calculateEstimatedPages(newLetterForm.content, newLetterForm.paperSize, newLetterForm.orientation)} صفحه ({newLetterForm.paperSize || 'A4'})</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border dark:border-white/10 px-1.5 py-0.5 rounded-lg text-xs">
                          <span className="text-[10px] text-slate-400 font-bold hidden lg:inline">
                            بزرگنمایی:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditorZoom((prev) => Math.max(30, prev - 10))
                            }
                            className="w-5 h-5 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded font-black text-sm"
                            title="کوچک‌نمایی"
                          >
                            -
                          </button>
                          <span className="font-bold font-mono text-[10px] min-w-[32px] text-center dark:text-white">
                            {editorZoom}%
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditorZoom((prev) => Math.min(200, prev + 10))
                            }
                            className="w-5 h-5 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded font-black text-sm"
                            title="بزرگ‌نمایی"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditorZoom(getAutoFitZoom())}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 font-bold"
                            title="تناسب خودکار با عرض صفحه گوشی یا نمایشگر"
                          >
                            صفحه
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditorZoom(100)}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold hidden sm:inline"
                            title="اندازه واقعی ۱۰۰٪"
                          >
                            ۱۰۰٪
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Find & Replace Bar */}
                  {showFindReplace && (
                    <div className="flex flex-wrap items-center gap-3 p-3 bg-white dark:bg-slate-800 border-x border-b dark:border-white/10 rounded-b-lg text-xs animate-slide-down">
                      <div className="flex items-center gap-1.5">
                        <label className="text-slate-400 font-bold">
                          جستجو:
                        </label>
                        <input
                          type="text"
                          value={findText}
                          onChange={(e) => setFindText(e.target.value)}
                          placeholder="کلمه مورد نظر..."
                          className="border dark:border-white/10 dark:bg-slate-900 rounded px-2 py-1 text-xs w-36"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-slate-400 font-bold">
                          جایگزینی با:
                        </label>
                        <input
                          type="text"
                          value={replaceText}
                          onChange={(e) => setReplaceText(e.target.value)}
                          placeholder="کلمه جدید..."
                          className="border dark:border-white/10 dark:bg-slate-900 rounded px-2 py-1 text-xs w-36"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleFindReplace}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1 rounded"
                      >
                        جایگزینی همه موارد
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFindReplace(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        لغو
                      </button>
                    </div>
                  )}

                  {/* Hidden Input for Instant Local Image Insert */}
                  <input
                    type="file"
                    ref={editorImageInputRef}
                    accept="image/*"
                    onChange={handleEditorImageUpload}
                    className="hidden"
                  />

                  {/* Docked Word-Style Formatting Ribbon Toolbar */}
                  <div
                    id="letter-custom-quill-toolbar"
                    className="ql-toolbar ql-snow bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-2 sm:px-3 py-1 sm:py-1.5 flex flex-nowrap sm:flex-wrap items-center gap-1 sm:gap-1.5 shrink-0 select-none z-30 shadow-xs overflow-x-auto scrollbar-none"
                  >
                    {/* Section 1: Undo / Redo & Format Painter */}
                    <div className="flex items-center gap-0.5 border-l dark:border-slate-700 pl-2">
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        title="بازگشت به عقب - Undo (Ctrl+Z)"
                      >
                        <Undo size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={handleRedo}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                        title="تکرار مجدد - Redo (Ctrl+Y)"
                      >
                        <Redo size={15} />
                      </button>

                      {/* Format Painter Tool (قلم‌موی استایل / فرمت‌پینتر) */}
                      <button
                        type="button"
                        onClick={handleToggleFormatPainter}
                        className={`px-2 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer select-none ${
                          isFormatPainterActive
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border-amber-500 ring-2 ring-amber-400/50 shadow-sm animate-pulse"
                            : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-50"
                        }`}
                        title={
                          isFormatPainterActive
                            ? "فرمت‌پینتر فعال است! روی متن مورد نظر کلیک یا درگ کنید تا استایل اعمال شود (برای لغو دوباره کلیک کنید)"
                            : "فرمت‌پینتر (Format Painter) - کپی و اعمال دقیق استایل، رنگ، فونت و اندازه یک متن روی متن دیگر"
                        }
                      >
                        <Paintbrush size={13} className={isFormatPainterActive ? "text-amber-600 dark:text-amber-400 animate-bounce" : "text-slate-600 dark:text-slate-400"} />
                        <span className="text-[10px]">فرمت‌پینتر</span>
                      </button>
                    </div>

                    {/* Section 2: Font Family & Font Size */}
                    <div className="flex items-center gap-1 border-l dark:border-slate-700 pl-2">
                      <span className="ql-formats">
                        <select className="ql-font" defaultValue="Vazirmatn" title="انتخاب قلم (Font)">
                          <option value="Vazirmatn">وزیر متن (استاندارد)</option>
                          <option value="Sahel">ساحل (رسمی و روان)</option>
                          <option value="Samim">صمیم (خوانا)</option>
                          <option value="Tanha">تنها (مستحکم)</option>
                          <option value="Nahid">ناهید (گرد و رسمی)</option>
                          <option value="Lalezar">لاله‌زار (تیتر و اعلان)</option>
                          <option value="Noto Naskh Arabic">نسخ رسمی (مشابه نازنین)</option>
                          <option value="Noto Sans Arabic">سنز رسمی (مدرن سازمانی)</option>
                          <option value="Amiri">امیری (کلاسیک)</option>
                          <option value="Markazi Text">مرکزی (اداری)</option>
                          <option value="Scheherazade New">شهرزاد (نسخ/نستعلیق)</option>
                          <option value="Cairo">قاهره (هندسی)</option>
                          <option value="B Nazanin">بی‌نازنین (B Nazanin)</option>
                          <option value="B Titr">بی‌تیتر (B Titr)</option>
                          <option value="B Yekan">بی‌یکان (B Yekan)</option>
                          <option value="Tahoma">Tahoma (ویندوز)</option>
                          <option value="Arial">Arial</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Courier New">Courier New (کد/تایپ‌رایتر)</option>
                        </select>
                        <select className="ql-size" defaultValue="14px" title="اندازه قلم (Font Size)">
                          <option value="9px">۹ ریز</option>
                          <option value="10px">۱۰</option>
                          <option value="11px">۱۱</option>
                          <option value="12px">۱۲</option>
                          <option value="13px">۱۳</option>
                          <option value="14px">۱۴ استاندارد</option>
                          <option value="15px">۱۵</option>
                          <option value="16px">۱۶ بزرگ</option>
                          <option value="17px">۱۷</option>
                          <option value="18px">۱۸ تیتر ریز</option>
                          <option value="20px">۲۰ متوسط</option>
                          <option value="22px">۲۲ سربرگ</option>
                          <option value="24px">۲۴ تیتر</option>
                          <option value="28px">۲۸</option>
                          <option value="32px">۳۲</option>
                          <option value="36px">۳۶</option>
                          <option value="48px">۴۸</option>
                        </select>
                        <select className="ql-header" defaultValue="" title="عنوان و سبک">
                          <option value="1">تیتر ۱</option>
                          <option value="2">تیتر ۲</option>
                          <option value="3">تیتر ۳</option>
                          <option value="">متن عادی</option>
                        </select>
                      </span>
                    </div>

                    {/* Section 3: Formatting (Bold, Italic, Underline, Strike, Script) */}
                    <div className="flex items-center gap-0.5 border-l dark:border-slate-700 pl-2">
                      <span className="ql-formats">
                        <button className="ql-bold" title="درشت (Bold - Ctrl+B)" />
                        <button className="ql-italic" title="مورب (Italic - Ctrl+I)" />
                        <button className="ql-underline" title="زیرخط (Underline - Ctrl+U)" />
                        <button className="ql-strike" title="خط‌خورده (Strikethrough)" />
                        <button className="ql-script" value="sub" title="زیرنویس" />
                        <button className="ql-script" value="super" title="بالانویس" />
                      </span>
                    </div>

                    {/* Section 4: High-Contrast Color & Highlighter Pickers */}
                    <div className="flex items-center gap-1.5 border-l dark:border-slate-700 pl-2 relative">
                      {/* Text Color Dropdown */}
                      <div className="relative">
                        <button
                          id="color-picker-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTextColorPicker(!showTextColorPicker);
                            setShowBgColorPicker(false);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-xs"
                          title="رنگ قلم متن"
                        >
                          <span className="font-black text-sm">A</span>
                          <span
                            className="w-3.5 h-1.5 rounded-xs"
                            style={{ backgroundColor: activeTextColor }}
                          />
                        </button>
                        {showTextColorPicker && (
                          <div
                            id="color-picker-dropdown"
                            className="absolute top-full mt-1.5 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-52 space-y-2 text-right"
                          >
                            <span className="text-[10px] font-bold text-slate-500 block border-b pb-1 dark:border-slate-700">
                              انتخاب رنگ قلم:
                            </span>
                            <div className="grid grid-cols-6 gap-1.5">
                              {[
                                "#000000", "#334155", "#64748b", "#94a3b8", "#dc2626", "#ea580c",
                                "#d97706", "#65a30d", "#16a34a", "#0d9488", "#0284c7", "#2563eb",
                                "#7c3aed", "#c026d3", "#db2777", "#991b1b", "#1e3a8a", "#064e3b"
                              ].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => applyCustomColor(c)}
                                  className="w-6 h-6 rounded-md border border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform shadow-2xs"
                                  style={{ backgroundColor: c }}
                                  title={c}
                                />
                              ))}
                            </div>
                            <div className="pt-2 border-t dark:border-slate-700 flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">رنگ سفارشی:</span>
                              <input
                                type="color"
                                value={activeTextColor}
                                onChange={(e) => applyCustomColor(e.target.value)}
                                className="w-7 h-7 rounded cursor-pointer p-0.5 border"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Highlight Background Color Dropdown */}
                      <div className="relative">
                        <button
                          id="bg-picker-btn"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowBgColorPicker(!showBgColorPicker);
                            setShowTextColorPicker(false);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 shadow-xs"
                          title="رنگ هایلایت و پس‌زمینه"
                        >
                          <Highlighter size={13} className="text-amber-500" />
                          <span
                            className="w-3.5 h-1.5 rounded-xs"
                            style={{ backgroundColor: activeBgColor }}
                          />
                        </button>
                        {showBgColorPicker && (
                          <div
                            id="bg-picker-dropdown"
                            className="absolute top-full mt-1.5 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-52 space-y-2 text-right"
                          >
                            <span className="text-[10px] font-bold text-slate-500 block border-b pb-1 dark:border-slate-700">
                              رنگ هایلایت متن:
                            </span>
                            <div className="grid grid-cols-6 gap-1.5">
                              {[
                                "transparent", "#fef08a", "#bbf7d0", "#bae6fd", "#fbcfe8", "#fed7aa",
                                "#e9d5ff", "#fecdd3", "#fef9c3", "#d9f99d", "#a7f3d0", "#99f6e4"
                              ].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => applyCustomBackground(c === "transparent" ? "" : c)}
                                  className="w-6 h-6 rounded-md border border-slate-300 dark:border-slate-600 hover:scale-110 transition-transform flex items-center justify-center text-[9px] font-bold"
                                  style={{ backgroundColor: c === "transparent" ? "#ffffff" : c }}
                                  title={c === "transparent" ? "بدون هایلایت" : c}
                                >
                                  {c === "transparent" ? "X" : ""}
                                </button>
                              ))}
                            </div>
                            <div className="pt-2 border-t dark:border-slate-700 flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">سفارشی:</span>
                              <input
                                type="color"
                                value={activeBgColor}
                                onChange={(e) => applyCustomBackground(e.target.value)}
                                className="w-7 h-7 rounded cursor-pointer p-0.5 border"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section 5: Alignment & Paragraph List */}
                    <div className="flex items-center gap-0.5 border-l dark:border-slate-700 pl-2">
                      <button
                        type="button"
                        onClick={() => handleSmartAlign("right")}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="راست‌چین"
                      >
                        <AlignRight size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmartAlign("center")}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="وسط‌چین"
                      >
                        <AlignCenter size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmartAlign("left")}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="چپ‌چین (مناسب امضا و با تشکر)"
                      >
                        <AlignLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSmartAlign("justify")}
                        className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center gap-1 text-[11px] font-bold"
                        title="تنظیم و یک‌اندازه کردن طول خطوط متن نامه (Justify)"
                      >
                        <AlignJustify size={13} />
                        <span>تنظیم</span>
                      </button>
                      <span className="ql-formats">
                        <select className="ql-align hidden" defaultValue="" title="چینش متن" />
                        <button className="ql-direction" value="rtl" title="جهت متن راست‌به‌چپ (RTL)" />
                        <button className="ql-list" value="ordered" title="لیست شماره‌دار" />
                        <button className="ql-list" value="bullet" title="لیست نشانه‌دار" />
                        <button className="ql-indent" value="-1" title="کاهش تورفتگی" />
                        <button className="ql-indent" value="+1" title="افزایش تورفتگی" />
                      </span>
                    </div>

                    {/* Section 6: Insert Media, Table, Line & Actions */}
                    <div className="flex items-center gap-1 border-l dark:border-slate-700 pl-2">
                      <button
                        type="button"
                        onClick={() => editorImageInputRef.current?.click()}
                        className="p-1.5 rounded-lg text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 border border-purple-200 dark:border-purple-800 transition-colors flex items-center gap-1 text-[11px] font-bold"
                        title="درج تصویر از کامپیوتر یا گوشی (با قابلیت تغییر اندازه و جابجایی)"
                      >
                        <ImageIcon size={14} />
                        <span>عکس</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          insertHTML(`
                            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; border: 1px solid #cbd5e1;">
                              <thead>
                                <tr style="background-color: #f1f5f9;">
                                  <th style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; text-align: center; width: 10%;">ردیف</th>
                                  <th style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; text-align: right; width: 60%;">شرح / موضوع</th>
                                  <th style="border: 1px solid #cbd5e1; padding: 8px; font-weight: bold; text-align: center; width: 30%;">توضیحات</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۱</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
                                  <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
                                </tr>
                                <tr>
                                  <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">۲</td>
                                  <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
                                  <td style="border: 1px solid #cbd5e1; padding: 8px;"></td>
                                </tr>
                              </tbody>
                            </table>
                            <p><br></p>
                          `);
                        }}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 text-[11px] font-bold"
                        title="درج جدول اداری سریع"
                      >
                        <Table size={14} />
                        <span>جدول</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowTableModal(true)}
                        className="px-2 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] font-bold border border-slate-200 dark:border-slate-700"
                        title="طراحی جدول دلخواه"
                      >
                        جدول پیشرفته...
                      </button>

                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                      {/* Quick Word & Google Docs/Sheets Ribbon Actions */}
                      <button
                        type="button"
                        onClick={() => handleQuickDocxDownload()}
                        disabled={quickWordDownloading}
                        className="px-2 py-1 rounded-lg text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/40 transition-colors flex items-center gap-1 text-[11px] font-extrabold"
                        title="خروجی مستقیم Microsoft Word (.docx)"
                      >
                        <FileDown size={14} className="text-blue-600 dark:text-blue-400" />
                        <span>{quickWordDownloading ? "در حال تولید..." : "خروجی Word"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => docxImportInputRef.current?.click()}
                        disabled={importingDocxFile}
                        className="px-2 py-1 rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/40 transition-colors flex items-center gap-1 text-[11px] font-extrabold"
                        title="وارد کردن فایل ورد به ویرایشگر"
                      >
                        <FileUp size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <span>{importingDocxFile ? "در حال استخراج..." : "ورود از Word"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTableModalTab("custom");
                          setShowTableModal(true);
                        }}
                        className="px-2.5 py-1 rounded-lg text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/40 transition-colors flex items-center gap-1 text-[11px] font-extrabold"
                        title="طراحی و مدیریت جداول اداری"
                      >
                        <Table size={14} className="text-blue-600 dark:text-blue-400" />
                        <span>طراحی جدول</span>
                      </button>

                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

                      <button
                        type="button"
                        onClick={() => {
                          insertHTML('<hr style="border: none; border-top: 1px solid #cbd5e1; margin: 16px 0;" /><p><br></p>');
                        }}
                        className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
                        title="درج خط افقی جداکننده"
                      >
                        <Minus size={14} />
                      </button>

                      <span className="ql-formats">
                        <button className="ql-link" title="پیوند اینترنتی (Link)" />
                        <button className="ql-blockquote" title="نقل قول" />
                        <button className="ql-clean" title="حذف تمام فرمت‌بندی‌ها" />
                      </span>
                    </div>
                  </div>

                  {/* Floating Image Control Bar with Mouse Resizing, Watermark, Layout & Opacity Controls */}
                  {selectedImgEl && (
                    <div
                      id="image-floating-toolbar"
                      className="bg-indigo-950 text-white border-y border-indigo-700/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl z-40 text-xs backdrop-blur-md animate-slide-down"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-indigo-900 px-2.5 py-1 rounded-lg font-bold border border-indigo-700">
                          <ImageIcon size={14} className="text-cyan-400" />
                          <span className="text-cyan-200">تنظیمات تصویر:</span>
                        </div>

                        {/* Resize with presets & slider */}
                        <div className="flex items-center gap-1 bg-indigo-900/60 px-2 py-1 rounded-lg border border-indigo-700/60">
                          <span className="text-indigo-300 font-semibold text-[11px]">اندازه:</span>
                          <span className="font-mono text-cyan-300 font-bold px-1">{selectedImgPixelWidth}px</span>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWidth("25%")}
                            className="px-1.5 py-0.5 rounded hover:bg-indigo-700 text-[10px] font-bold"
                          >
                            ۲۵٪
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWidth("50%")}
                            className="px-1.5 py-0.5 rounded hover:bg-indigo-700 text-[10px] font-bold"
                          >
                            ۵۰٪
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWidth("75%")}
                            className="px-1.5 py-0.5 rounded hover:bg-indigo-700 text-[10px] font-bold"
                          >
                            ۷۵٪
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWidth("100%")}
                            className="px-1.5 py-0.5 rounded hover:bg-indigo-700 text-[10px] font-bold"
                          >
                            ۱۰۰٪
                          </button>
                          <input
                            type="range"
                            min={40}
                            max={800}
                            step={10}
                            value={selectedImgPixelWidth}
                            onChange={(e) => updateSelectedImageWidthPx(Number(e.target.value))}
                            className="w-20 accent-cyan-400 cursor-pointer h-1.5"
                            title="تغییر دقیق سایز تصویر با نوار لغزنده"
                          />
                        </div>

                        {/* Layout & Text Wrapping Modes (In Front of Text, Behind Text, Float, Inline) */}
                        <div className="flex items-center gap-1 bg-indigo-900/60 p-1 rounded-lg border border-indigo-700/60">
                          <span className="text-indigo-300 font-semibold text-[11px] px-1">موقعیت و متن:</span>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWrap("in-front")}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                              selectedImgWrap === "in-front"
                                ? "bg-cyan-500 text-slate-950 shadow-sm"
                                : "hover:bg-indigo-800 text-indigo-200"
                            }`}
                            title="قرارگیری شناور روی متن (بدون جابجایی و به هم ریختگی خطوط متن)"
                          >
                            <span>روی متن</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWrap("behind")}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                              selectedImgWrap === "behind"
                                ? "bg-amber-500 text-slate-950 shadow-sm"
                                : "hover:bg-indigo-800 text-indigo-200"
                            }`}
                            title="قرارگیری در پشت متن (زیر متن اداری / پس‌زمینه)"
                          >
                            <span>پشت متن</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWrap("float-right")}
                            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${
                              selectedImgWrap === "float-right"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "hover:bg-indigo-800 text-indigo-200"
                            }`}
                            title="دورپیچی متن (شناور سمت راست)"
                          >
                            <span>دورپیچ راست</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWrap("float-left")}
                            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${
                              selectedImgWrap === "float-left"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "hover:bg-indigo-800 text-indigo-200"
                            }`}
                            title="دورپیچی متن (شناور سمت چپ)"
                          >
                            <span>دورپیچ چپ</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedImageWrap("inline")}
                            className={`px-1.5 py-0.5 rounded text-[11px] font-bold transition-all ${
                              selectedImgWrap === "inline"
                                ? "bg-indigo-600 text-white shadow-sm"
                                : "hover:bg-indigo-800 text-indigo-200"
                            }`}
                            title="در خط با متن (وسط پاراگراف)"
                          >
                            <span>در خط</span>
                          </button>
                        </div>

                        {/* Transparent White Background (Multiply) */}
                        <button
                          type="button"
                          onClick={toggleSelectedImageMultiply}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                            selectedImgMultiply
                              ? "bg-emerald-500 text-slate-900 border-emerald-400 shadow-sm"
                              : "bg-indigo-800 hover:bg-indigo-700 text-indigo-100 border-indigo-600"
                          }`}
                          title="حذف پس‌زمینه سفید و قرارگیری شفاف روی متن (مخصوص امضا، مهر شرکت و نشان‌ها)"
                        >
                          <Sparkles size={13} />
                          <span>{selectedImgMultiply ? "✓ حذف پس‌زمینه سفید (روی متن)" : "حذف پس‌زمینه سفید"}</span>
                        </button>

                        {/* Background Opacity & Blur Slider */}
                        <div className="flex items-center gap-1.5 bg-indigo-900/60 px-2.5 py-1 rounded-lg border border-indigo-700/60">
                          <span className="text-indigo-300 font-semibold text-[11px]">شفافیت:</span>
                          <input
                            type="range"
                            min={10}
                            max={100}
                            step={5}
                            value={selectedImgOpacity}
                            onChange={(e) => updateSelectedImageOpacity(Number(e.target.value))}
                            className="w-16 accent-cyan-400 cursor-pointer h-1.5"
                            title="تنظیم درصد شفافیت تصویر"
                          />
                          <span className="font-mono text-cyan-300 font-bold text-[11px] min-w-[28px]">
                            {selectedImgOpacity}٪
                          </span>
                        </div>

                        {/* Alignment (for inline mode) */}
                        {selectedImgWrap === "inline" && (
                          <div className="flex items-center gap-0.5 bg-indigo-900/60 p-0.5 rounded-lg border border-indigo-700/60">
                            <button
                              type="button"
                              onClick={() => updateSelectedImageAlign("right")}
                              className={`px-2 py-0.5 rounded font-bold ${selectedImgAlign === "right" ? "bg-cyan-600 text-white" : "hover:bg-indigo-700 text-indigo-200"}`}
                              title="راست‌چین"
                            >
                              راست
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSelectedImageAlign("center")}
                              className={`px-2 py-0.5 rounded font-bold ${selectedImgAlign === "center" ? "bg-cyan-600 text-white" : "hover:bg-indigo-700 text-indigo-200"}`}
                              title="وسط‌چین"
                            >
                              وسط
                            </button>
                            <button
                              type="button"
                              onClick={() => updateSelectedImageAlign("left")}
                              className={`px-2 py-0.5 rounded font-bold ${selectedImgAlign === "left" ? "bg-cyan-600 text-white" : "hover:bg-indigo-700 text-indigo-200"}`}
                              title="چپ‌چین"
                            >
                              چپ
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-cyan-200 hidden xl:inline">
                          💡 برای جابجایی تصویر، آیکون حرکت را بکشید یا آن را جابجا کنید
                        </span>
                        <button
                          type="button"
                          onClick={deleteSelectedImage}
                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1 transition-colors"
                          title="حذف تصویر"
                        >
                          <Trash2 size={13} />
                          <span>حذف</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedImgEl(null)}
                          className="text-indigo-300 hover:text-white p-1"
                          title="بستن"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Word-style Floating Table Management Ribbon */}
                  {selectedTableEl && (
                    <div
                      id="table-management-ribbon"
                      className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 border-b border-blue-500/30 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white z-40 shadow-lg animate-fade-in shrink-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 bg-blue-600 text-white px-2 py-0.5 rounded font-black text-[11px] shadow-xs">
                          <Table size={13} />
                          ابزار جدول اداری
                        </span>
                        <span className="text-[11px] text-blue-200 hidden sm:inline">
                          مدیریت ردیف‌ها، ستون‌ها و استایل جدول انتخاب شده
                        </span>
                      </div>

                      {/* Table Structure Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={insertTableRowAbove}
                          className="px-2 py-1 rounded bg-slate-700/80 hover:bg-slate-600 text-[11px] font-bold border border-slate-600/60 transition-colors"
                          title="افزودن سطر در بالای سطر فعلی"
                        >
                          + سطر بالا
                        </button>
                        <button
                          type="button"
                          onClick={insertTableRowBelow}
                          className="px-2 py-1 rounded bg-slate-700/80 hover:bg-slate-600 text-[11px] font-bold border border-slate-600/60 transition-colors"
                          title="افزودن سطر در پایین سطر فعلی"
                        >
                          + سطر پایین
                        </button>
                        <button
                          type="button"
                          onClick={insertTableColRight}
                          className="px-2 py-1 rounded bg-slate-700/80 hover:bg-slate-600 text-[11px] font-bold border border-slate-600/60 transition-colors"
                          title="افزودن ستون سمت راست"
                        >
                          + ستون راست
                        </button>
                        <button
                          type="button"
                          onClick={insertTableColLeft}
                          className="px-2 py-1 rounded bg-slate-700/80 hover:bg-slate-600 text-[11px] font-bold border border-slate-600/60 transition-colors"
                          title="افزودن ستون سمت چپ"
                        >
                          + ستون چپ
                        </button>

                        <div className="h-4 w-px bg-slate-700 mx-1" />

                        {/* Cell Background Color */}
                        <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          <Palette size={12} className="text-amber-400" />
                          <span className="text-[10px] text-slate-300">رنگ سلول:</span>
                          <button
                            type="button"
                            onClick={() => setTableCellBg("#f1f5f9")}
                            className="w-3.5 h-3.5 rounded-full bg-slate-100 border border-slate-400"
                            title="خاکستری روشن"
                          />
                          <button
                            type="button"
                            onClick={() => setTableCellBg("#eff6ff")}
                            className="w-3.5 h-3.5 rounded-full bg-blue-100 border border-blue-400"
                            title="آبی روشن"
                          />
                          <button
                            type="button"
                            onClick={() => setTableCellBg("#ecfdf5")}
                            className="w-3.5 h-3.5 rounded-full bg-emerald-100 border border-emerald-400"
                            title="سبز روشن"
                          />
                          <button
                            type="button"
                            onClick={() => setTableCellBg("#fef3c7")}
                            className="w-3.5 h-3.5 rounded-full bg-amber-100 border border-amber-400"
                            title="زرد ملایم"
                          />
                          <button
                            type="button"
                            onClick={() => setTableCellBg("transparent")}
                            className="w-3.5 h-3.5 rounded-full bg-white border border-slate-300 relative"
                            title="بدون رنگ"
                          >
                            <span className="absolute inset-0 text-red-500 text-[10px] font-bold flex items-center justify-center">×</span>
                          </button>
                        </div>

                        {/* Quick Theme Switcher */}
                        <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                          <SlidersHorizontal size={12} className="text-blue-400" />
                          <span className="text-[10px] text-slate-300">قالب:</span>
                          <button
                            type="button"
                            onClick={() => applyTableTheme("formal-navy")}
                            className="px-1.5 py-0.5 rounded bg-blue-900/60 hover:bg-blue-800 text-[10px] font-bold text-blue-200"
                          >
                            سازمانی آبی
                          </button>
                          <button
                            type="button"
                            onClick={() => applyTableTheme("zebra-emerald")}
                            className="px-1.5 py-0.5 rounded bg-emerald-900/60 hover:bg-emerald-800 text-[10px] font-bold text-emerald-200"
                          >
                            مالی سبز
                          </button>
                          <button
                            type="button"
                            onClick={() => applyTableTheme("modern-slate")}
                            className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] font-bold text-slate-200"
                          >
                            کلاسیک
                          </button>
                        </div>

                        <div className="h-4 w-px bg-slate-700 mx-1" />

                        {/* Deletions */}
                        <button
                          type="button"
                          onClick={deleteCurrentTableRow}
                          className="px-2 py-1 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-200 text-[11px] font-bold border border-amber-700/50 transition-colors"
                          title="حذف سطر جاری"
                        >
                          حذف سطر
                        </button>
                        <button
                          type="button"
                          onClick={deleteCurrentTableCol}
                          className="px-2 py-1 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-200 text-[11px] font-bold border border-amber-700/50 transition-colors"
                          title="حذف ستون جاری"
                        >
                          حذف ستون
                        </button>
                        <button
                          type="button"
                          onClick={deleteEntireTable}
                          className="px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white text-[11px] font-bold border border-red-500/50 transition-colors flex items-center gap-1"
                          title="حذف کامل جدول"
                        >
                          <Trash2 size={12} />
                          <span>حذف جدول</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTableEl(null);
                            setSelectedCellEl(null);
                          }}
                          className="text-slate-400 hover:text-white p-1"
                          title="بستن روبان جدول"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Workspace Container */}
                  <div className="flex-1 min-h-0 bg-slate-200/90 dark:bg-slate-950 flex flex-col w-full relative overflow-hidden">
                    
                    {/* MODE 1: ONLYOFFICE Workspace (Default & Primary Priority) */}
                    {editorViewMode === "onlyoffice" && (
                      <div className="flex-1 flex flex-col w-full h-full bg-slate-900">
                        {/* ONLYOFFICE Action Ribbon Bar */}
                        <div className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs text-white shrink-0">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white px-2.5 py-1 rounded-lg font-black shadow-xs">
                              <Building2 size={15} />
                              <span>محیط سازمانی ONLYOFFICE Docs</span>
                            </div>
                            <span className="text-slate-400 hidden sm:inline text-[11px]">
                              ویرایشگر رسمی اسناد سازمانی (docx) - تمام امکانات پیشرفته Word
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSyncFromOnlyOffice}
                              disabled={onlyOfficeSyncing}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 transition-all shadow-xs"
                              title="دریافت آخرین متن ویرایش شده از ONLYOFFICE و اعمال بر روی سربرگ اداری"
                            >
                              <RefreshCw size={13} className={onlyOfficeSyncing ? "animate-spin" : ""} />
                              <span>{onlyOfficeSyncing ? "در حال دریافت..." : "همگام‌سازی با سربرگ"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleQuickDocxDownload()}
                              disabled={quickWordDownloading}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 transition-all shadow-xs"
                              title="دانلود مستقیم فایل Word (.docx)"
                            >
                              <Download size={13} />
                              <span>دانلود فایل Word</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setCustomDocServerInput(onlyOfficeDocServerUrl);
                                setShowOnlyOfficeSettingsModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                              title="تنظیمات سرور ONLYOFFICE"
                            >
                              <SlidersHorizontal size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Status notification toast inside workspace */}
                        {syncNotificationText && (
                          <div className="bg-emerald-900/90 text-emerald-200 border-b border-emerald-700 px-4 py-1.5 text-xs text-center font-bold flex items-center justify-center gap-2 animate-slide-down">
                            <CheckCheck size={14} className="text-emerald-400" />
                            <span>{syncNotificationText}</span>
                          </div>
                        )}

                        {/* ONLYOFFICE Document Editor Component Frame */}
                        <div className="flex-1 w-full h-full relative bg-slate-900 flex flex-col items-center justify-center p-4">
                          {onlyOfficeLoadError ? (
                            <div className="flex flex-col items-center gap-4 text-center max-w-xl p-6 bg-slate-800/95 rounded-2xl border border-red-500/40 shadow-2xl animate-fade-in text-white">
                              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                                <AlertTriangle size={28} />
                              </div>
                              <div className="space-y-1.5">
                                <h4 className="font-black text-white text-base">عدم برقراری ارتباط با سرور ONLYOFFICE</h4>
                                <p className="text-slate-300 text-xs leading-relaxed">
                                  آدرس فعلی سرور: <code className="bg-slate-900 px-2 py-0.5 rounded text-orange-300 font-mono" dir="ltr">{onlyOfficeDocServerUrl}</code>
                                </p>
                                {(onlyOfficeDocServerUrl.includes("onlyoffice-proxy") || onlyOfficeDocServerUrl.includes("8088") || onlyOfficeDocServerUrl.includes("localhost")) && (
                                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/80 text-right text-xs text-amber-200 mt-2 space-y-1">
                                    <span className="font-bold block text-amber-300">راهنمای راه‌اندازی سرور محلی (آفلاین):</span>
                                    <p className="text-[11px] text-slate-300">
                                      سرویس داکر ONLYOFFICE روی پورت 8088 سرور شما در حال اجرا نیست. برای فعال‌سازی کافیست دستور زیر را در CMD یا ترمینال سرور خود اجرا کنید:
                                    </p>
                                    <div className="bg-black/60 p-2 rounded text-[10px] text-emerald-400 font-mono select-all overflow-x-auto" dir="ltr">
                                      docker run -i -t -d -p 8088:80 --name onlyoffice-documentserver --restart=always -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true -e USE_UNAUTHORIZED_STORAGE=true onlyoffice/documentserver
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2 w-full pt-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveOnlyOfficeServerUrl("https://documentserver.onlyoffice.com")}
                                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold shadow-md flex items-center justify-center gap-2 text-xs transition-all"
                                >
                                  <Sparkles size={16} />
                                  <span>اتصال ۱-کلیکی به سرور آنلاین عمومی ONLYOFFICE (بدون نیاز به داکر)</span>
                                </button>

                                <div className="flex flex-col sm:flex-row gap-2 w-full">
                                  <button
                                    type="button"
                                    onClick={() => changeEditorViewMode("office")}
                                    className="w-full sm:flex-1 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold border border-slate-600 flex items-center justify-center gap-2 text-xs transition-all"
                                  >
                                    <FileText size={15} />
                                    <span>ویرایشگر اداری داخلی (آفلاین)</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomDocServerInput(onlyOfficeDocServerUrl);
                                      setShowOnlyOfficeSettingsModal(true);
                                      checkOnlyOfficeHealth(onlyOfficeDocServerUrl);
                                    }}
                                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold border border-slate-600 text-xs transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    <SlidersHorizontal size={14} />
                                    <span>تنظیمات و تست سرور</span>
                                  </button>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setOnlyOfficeLoadError(null);
                                  handlePrepareOnlyOfficeDoc(true);
                                }}
                                className="text-[11px] text-slate-400 hover:text-slate-200 underline mt-1"
                              >
                                تلاش مجدد برای اتصال
                              </button>
                            </div>
                          ) : onlyOfficeLoading ? (
                            <div className="flex flex-col items-center gap-3 text-slate-300">
                              <RefreshCw size={32} className="animate-spin text-orange-400" />
                              <span className="font-bold text-sm">در حال بارگذاری محیط کاربری ONLYOFFICE...</span>
                            </div>
                          ) : onlyOfficeDocKey && onlyOfficeFileUrl ? (
                            <div className="w-full h-full relative">
                              <SafeEditorErrorBoundary onReset={() => changeEditorViewMode("office")}>
                              <SafeOnlyOfficeEditor
                                id="onlyoffice-docx-editor"
                                documentServerUrl={onlyOfficeDocServerUrl}
                                config={{
                                  document: {
                                    fileType: "docx",
                                    key: onlyOfficeDocKey,
                                    title: onlyOfficeTitle,
                                    url: onlyOfficeFileUrl,
                                    permissions: {
                                      download: true,
                                      edit: true,
                                      print: true,
                                      review: true,
                                    },
                                  },
                                  documentType: "word",
                                  editorConfig: {
                                    lang: "fa" as any,
                                    mode: "edit",
                                    callbackUrl: onlyOfficeCallbackUrl,
                                    customization: {
                                      autosave: true,
                                      forcesave: true,
                                      compactHeader: true,
                                      toolbarHideFileName: false,
                                      unit: "cm",
                                      zoom: 100,
                                      uiTheme: "theme-light",
                                    },
                                    user: {
                                      id: currentUser?.id || "user-1",
                                      name: (currentUser as any)?.name || (currentUser as any)?.fullName || "کاربر دبیرخانه",
                                    },
                                  },
                                  height: "100%",
                                  width: "100%",
                                }}
                                events_onDocumentReady={() => {
                                  console.log("ONLYOFFICE Document Ready");
                                  setOnlyOfficeLoadError(null);
                                }}
                                events_onError={(e) => {
                                  console.warn("ONLYOFFICE Error Event:", e);
                                  setOnlyOfficeLoadError("خطا در بارگذاری موتور اسناد ONLYOFFICE");
                                }}
                                onLoadComponentError={(errorCode, errorDescription) => {
                                  console.error("ONLYOFFICE Component load error:", errorCode, errorDescription);
                                  setOnlyOfficeLoadError(errorDescription || "خطا در بارگذاری کتابخانه ONLYOFFICE");
                                }}
                              />
                              </SafeEditorErrorBoundary>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-4 text-center max-w-md p-6 bg-slate-800/80 rounded-2xl border border-slate-700 shadow-2xl">
                              <Building2 size={48} className="text-orange-400" />
                              <div>
                                <h4 className="font-black text-white text-base mb-1">اتصال به ONLYOFFICE Document Editor</h4>
                                <p className="text-slate-400 text-xs">
                                  برای شروع کار با ابزارهای کامل ویرایش اسناد سازمانی و Word، سند خود را راه‌اندازی کنید.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handlePrepareOnlyOfficeDoc(true)}
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold shadow-lg transition-all flex items-center gap-2 text-sm"
                              >
                                <Sparkles size={16} />
                                <span>بارگذاری ویرایشگر ONLYOFFICE</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* MODE 2: Office Virtual Paper Workspace (A4/A5 Standard Letterhead) */}
                    {editorViewMode === "office" && (
                      <div className="flex-1 min-h-0 p-1 sm:p-4 overflow-y-auto overflow-x-auto flex justify-center items-start w-full relative custom-scrollbar touch-pan-x touch-pan-y">
                        <div
                          className="flex justify-center shrink-0"
                          style={{
                            width: editorZoom !== 100 ? `${Math.round((newLetterForm.paperSize === "A5" ? (newLetterForm.orientation === "landscape" ? 794 : 559) : (newLetterForm.orientation === "landscape" ? 1123 : 794)) * (editorZoom / 100))}px` : undefined,
                            height: editorZoom !== 100 ? `${Math.round((newLetterForm.paperSize === "A5" ? (newLetterForm.orientation === "landscape" ? 559 : 794) : (newLetterForm.orientation === "landscape" ? 794 : 1123)) * (editorZoom / 100)) + 30}px` : undefined,
                          }}
                        >
                        <div
                          ref={paperRef}
                          className="secretariat-a4-paper bg-white text-slate-900 shadow-2xl border border-slate-300 dark:border-slate-700 rounded-sm mx-auto my-2 transition-all duration-300 google-docs-paper text-right relative flex flex-col justify-between shrink-0"
                          style={{
                            width:
                              newLetterForm.paperSize === "A5"
                                ? newLetterForm.orientation === "landscape"
                                  ? "210mm"
                                  : "148mm"
                                : newLetterForm.orientation === "landscape"
                                  ? "297mm"
                                  : "210mm",
                            minHeight:
                              newLetterForm.paperSize === "A5"
                                ? newLetterForm.orientation === "landscape"
                                  ? "148mm"
                                  : "210mm"
                                : newLetterForm.orientation === "landscape"
                                  ? "210mm"
                                  : "297mm",
                            paddingTop: `${companySettingsForm.marginTop ?? 40}mm`,
                            paddingBottom: `${companySettingsForm.marginBottom ?? 25}mm`,
                            paddingRight: `${companySettingsForm.marginRight ?? 20}mm`,
                            paddingLeft: `${companySettingsForm.marginLeft ?? 20}mm`,
                            fontFamily:
                              companySettingsForm.letterheadFontFamily ||
                              "'Vazirmatn', sans-serif",
                            transform:
                              editorZoom !== 100
                                ? `scale(${editorZoom / 100})`
                                : undefined,
                            transformOrigin: "top center",
                            boxSizing: "border-box",
                          }}
                          dir="rtl"
                        >
                          {/* Background Letterhead in Editor so user sees exact print placement */}
                          {getEffectiveLetterheadDisplayUrl(companySettingsForm) && (
                            <img
                              src={getEffectiveLetterheadDisplayUrl(companySettingsForm)}
                              alt="سربرگ شرکت"
                              className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0 select-none opacity-95"
                            />
                          )}

                          {/* Top-left metadata block (شماره / تاریخ / پیوست) matching Preview & PDF 1:1 */}
                          <div
                            className="pointer-events-none select-none"
                            style={{
                              position: "absolute",
                              top: `${companySettingsForm.metadataTop ?? 25}mm`,
                              left: `${companySettingsForm.metadataLeft ?? 20}mm`,
                              fontSize: `${companySettingsForm.metadataFontSize ?? 11}px`,
                              color: companySettingsForm.metadataColor || "#0f172a",
                              lineHeight: "1.8",
                              fontWeight: companySettingsForm.metadataFontWeight || "bold",
                              opacity: (companySettingsForm.metadataOpacity ?? 100) / 100,
                              fontFamily:
                                companySettingsForm.letterheadFontFamily || "inherit",
                              textAlign: "right",
                              direction: "rtl",
                              zIndex: 20,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <div>
                              شماره:{" "}
                              <span style={{ direction: "ltr", display: "inline-block" }}>
                                {toPersianDigits(
                                  editingLetterId
                                    ? letters.find((l) => l.id === editingLetterId)
                                        ?.letterNumber || "پیش‌نویس"
                                    : "پیش‌نویس",
                                )}
                              </span>
                            </div>
                            <div>
                              تاریخ:{" "}
                              <span style={{ direction: "ltr", display: "inline-block" }}>
                                {toPersianDigits(newLetterForm.date || "-")}
                              </span>
                            </div>
                            <div>
                              پیوست:{" "}
                              {newLetterForm.hasAttachment ||
                              (newLetterForm.attachments &&
                                newLetterForm.attachments.length > 0)
                                ? "دارد"
                                : "ندارد"}
                            </div>
                          </div>

                        {(() => {
                          const cleanText = (newLetterForm.content || "")
                            .replace(/<[^>]*>/g, "")
                            .trim();
                          const wCount = cleanText
                            ? cleanText.split(/\s+/).length
                            : 0;
                          const cCount = cleanText.length;
                          return (
                            <>
                              <ReactQuill
                                ref={quillRef}
                                theme="snow"
                                value={newLetterForm.content}
                                onChange={(val) =>
                                  setNewLetterForm((prev) => ({
                                    ...prev,
                                    content: val,
                                  }))
                                }
                                placeholder="متن رسمی و اداری خود را اینجا بنویسید..."
                                className="text-sm border-none ql-editor-borderless flex-1 relative z-10"
                                modules={{
                                  toolbar: "#letter-custom-quill-toolbar",
                                  clipboard: {
                                    matchVisual: false,
                                  },
                                }}
                              />

                              {/* Word-style Interactive 8-Handle Image Resizer & Rotation Overlay */}
                              {imgOverlayBox && selectedImgEl && (
                                <div
                                  className="img-interactive-overlay absolute z-30 pointer-events-none select-none"
                                  style={{
                                    top: `${imgOverlayBox.top}px`,
                                    left: `${imgOverlayBox.left}px`,
                                    width: `${imgOverlayBox.width}px`,
                                    height: `${imgOverlayBox.height}px`,
                                  }}
                                >
                                  {/* Selection bounding outline & drag-to-move surface */}
                                  <div
                                    onMouseDown={startImageDragMove}
                                    onTouchStart={startImageDragMove}
                                    className="absolute inset-0 border-2 border-blue-500 rounded-xs shadow-sm ring-1 ring-blue-300/60 pointer-events-auto cursor-move bg-blue-500/5 hover:bg-blue-500/10 transition-colors touch-manipulation"
                                    title="برای جابجایی تصویر روی صفحه کلیک یا لمس کرده و بکشید (Drag & Move)"
                                  />

                                  {/* Move & Rotation handles pill on top */}
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-auto bg-blue-600 text-white px-2.5 py-1 rounded-full shadow-md text-[11px] font-bold touch-manipulation">
                                    <button
                                      type="button"
                                      onMouseDown={startImageDragMove}
                                      onTouchStart={startImageDragMove}
                                      className="flex items-center gap-1 cursor-move hover:text-cyan-200 active:scale-95"
                                      title="کلیک و درگ یا لمس برای جابجایی آزاد روی متن"
                                    >
                                      <Move size={13} />
                                      <span>جابجایی</span>
                                    </button>
                                    <div className="w-px h-3.5 bg-blue-400" />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        rotateSelectedImage(90);
                                      }}
                                      className="flex items-center hover:text-cyan-200 active:scale-95"
                                      title="چرخش ۹۰ درجه تصویر"
                                    >
                                      <RotateCw size={13} />
                                    </button>
                                  </div>

                                  {/* 4 Corner Handles (NW, NE, SW, SE) with enlarged touch hitboxes */}
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "nw")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "nw")}
                                    className="absolute -top-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر سایز گوشه چپ بالا"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "ne")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "ne")}
                                    className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر سایز گوشه راست بالا"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "sw")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "sw")}
                                    className="absolute -bottom-3 -left-3 w-6 h-6 flex items-center justify-center cursor-nesw-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر سایز گوشه چپ پایین"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "se")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "se")}
                                    className="absolute -bottom-3 -right-3 w-6 h-6 flex items-center justify-center cursor-nwse-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر سایز گوشه راست پایین"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>

                                  {/* 4 Edge Handles (N, S, W, E) with enlarged touch hitboxes */}
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "n")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "n")}
                                    className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-ns-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر ارتفاع از بالا"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "s")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "s")}
                                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-ns-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر ارتفاع از پایین"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "w")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "w")}
                                    className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 flex items-center justify-center cursor-ew-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر عرض از چپ"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>
                                  <div
                                    onMouseDown={(e) => startImageInteractiveResize(e, "e")}
                                    onTouchStart={(e) => startImageInteractiveResize(e, "e")}
                                    className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 flex items-center justify-center cursor-ew-resize pointer-events-auto touch-manipulation z-40 group"
                                    title="تغییر عرض از راست"
                                  >
                                    <div className="w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-xs shadow-md group-hover:bg-blue-100 group-hover:scale-125 transition-transform" />
                                  </div>

                                  {/* Quick Layout Action Pill */}
                                  <div className="absolute -top-8 right-0 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md shadow-lg px-1.5 py-0.5 pointer-events-auto z-40">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateSelectedImageWrap("in-front");
                                      }}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${selectedImgWrap === "in-front" ? "bg-cyan-600 text-white" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                                      title="شناور روی متن (بدون جابجایی خطوط متن)"
                                    >
                                      روی متن
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectedImageMultiply();
                                      }}
                                      className={`p-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${selectedImgMultiply ? "text-emerald-600 font-bold" : "text-slate-600"}`}
                                      title="حذف پس‌زمینه سفید تصویر (مهر و امضا)"
                                    >
                                      <Sparkles size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateSelectedImageWrap("behind");
                                      }}
                                      className={`p-1 rounded text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${selectedImgWrap === "behind" ? "text-amber-600 font-bold" : "text-slate-600"}`}
                                      title="قرار دادن در پشت متن (واترمارک)"
                                    >
                                      <Layers size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSelectedImage();
                                      }}
                                      className="p-1 rounded text-xs hover:bg-red-50 text-red-600"
                                      title="حذف تصویر"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Realtime Stats Display */}
                              <div className="absolute bottom-3 left-4 select-none bg-slate-50 dark:bg-slate-800 border dark:border-white/5 rounded px-2 py-1 text-[10px] text-slate-400 dark:text-slate-300 font-bold flex items-center gap-2 shadow-sm pointer-events-none">
                                <span>
                                  کلمات:{" "}
                                  <b className="text-slate-700 dark:text-white font-mono">
                                    {wCount}
                                  </b>
                                </span>
                                <span className="text-slate-300 dark:text-slate-700">
                                  |
                                </span>
                                <span>
                                  کاراکترها:{" "}
                                  <b className="text-slate-700 dark:text-white font-mono">
                                    {cCount}
                                  </b>
                                </span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  )}

                    {/* MODE 4: Split View Workspace (ONLYOFFICE + Letterhead side by side) */}
                    {editorViewMode === "split" && (
                      <div className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden">
                        {/* Left Half: ONLYOFFICE */}
                        <div className="w-full md:w-1/2 h-1/2 md:h-full border-b md:border-b-0 md:border-l border-slate-700 flex flex-col bg-slate-900">
                          <div className="bg-slate-900 border-b border-slate-700 px-3 py-1.5 flex items-center justify-between text-xs text-white shrink-0">
                            <div className="flex items-center gap-1.5 font-bold text-orange-400">
                              <Building2 size={14} />
                              <span>ONLYOFFICE Docs</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleSyncFromOnlyOffice}
                              disabled={onlyOfficeSyncing}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <RefreshCw size={11} className={onlyOfficeSyncing ? "animate-spin" : ""} />
                              <span>همگام با سربرگ</span>
                            </button>
                          </div>
                          <div className="flex-1 w-full h-full relative bg-slate-900">
                            {onlyOfficeDocKey && onlyOfficeFileUrl ? (
                              <SafeOnlyOfficeEditor
                                id="onlyoffice-split-editor"
                                documentServerUrl={onlyOfficeDocServerUrl}
                                config={{
                                  document: {
                                    fileType: "docx",
                                    key: onlyOfficeDocKey,
                                    title: onlyOfficeTitle,
                                    url: onlyOfficeFileUrl,
                                  },
                                  documentType: "word",
                                  editorConfig: {
                                    lang: "fa" as any,
                                    mode: "edit",
                                    callbackUrl: onlyOfficeCallbackUrl,
                                  },
                                  height: "100%",
                                  width: "100%",
                                }}
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handlePrepareOnlyOfficeDoc(true)}
                                  className="px-3 py-1.5 rounded-lg bg-orange-600 text-white font-bold"
                                >
                                  بارگذاری ONLYOFFICE
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right Half: Live Letterhead Paper */}
                        <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 overflow-y-auto bg-slate-200 dark:bg-slate-950 flex justify-center custom-scrollbar">
                          <div
                            className="bg-white dark:bg-gray-900 shadow-xl border border-slate-300 dark:border-slate-800 rounded-sm p-6 w-full max-w-lg text-right my-auto"
                            dir="rtl"
                          >
                            <div className="text-xs font-bold text-slate-400 mb-2 border-b pb-1">
                              پیش‌نمایش زنده سربرگ اداری
                            </div>
                            <ReactQuill
                              theme="snow"
                              value={newLetterForm.content}
                              onChange={(val) =>
                                setNewLetterForm({
                                  ...newLetterForm,
                                  content: val,
                                })
                              }
                              className="text-sm border-none ql-editor-borderless"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Microsoft Word / Google Docs Style Bottom Status Bar */}
                  <div className="bg-slate-100 dark:bg-slate-900 border-t border-slate-300 dark:border-slate-800 px-4 py-1.5 flex flex-wrap items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 select-none shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 font-bold text-blue-700 dark:text-blue-400">
                        <FileText size={13} />
                        سند استاندارد {newLetterForm.paperSize || "A4"} ({newLetterForm.orientation === "landscape" ? "افقی" : "عمودی"})
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span>
                        تعداد کلمات:{" "}
                        <strong className="text-slate-900 dark:text-white font-mono">
                          {toPersianDigits(
                            (newLetterForm.content || "").replace(/<[^>]*>/g, "").trim()
                              ? (newLetterForm.content || "").replace(/<[^>]*>/g, "").trim().split(/\s+/).length
                              : 0,
                          )}
                        </strong>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span>
                        کاراکترها:{" "}
                        <strong className="text-slate-900 dark:text-white font-mono">
                          {toPersianDigits((newLetterForm.content || "").replace(/<[^>]*>/g, "").trim().length)}
                        </strong>
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span>
                        تخمین صفحات:{" "}
                        <strong className="text-slate-900 dark:text-white">
                          {toPersianDigits(
                            Math.max(1, Math.ceil((newLetterForm.content || "").replace(/<[^>]*>/g, "").trim().length / 1800)),
                          )}{" "}
                          صفحه
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">زبان: فارسی (RTL)</span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <div className="flex items-center gap-1.5">
                        <span>بزرگ‌نمایی:</span>
                        <button
                          type="button"
                          onClick={() => setEditorZoom((prev) => Math.max(30, prev - 10))}
                          className="hover:bg-slate-200 dark:hover:bg-slate-800 px-1 rounded font-mono font-bold"
                          title="کوچک‌نمایی"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200 min-w-[36px] text-center">
                          %{toPersianDigits(editorZoom)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditorZoom((prev) => Math.min(200, prev + 10))}
                          className="hover:bg-slate-200 dark:hover:bg-slate-800 px-1 rounded font-mono font-bold"
                          title="بزرگ‌نمایی"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorZoom(getAutoFitZoom())}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 font-bold"
                          title="تنظیم خودکار با عرض صفحه"
                        >
                          متناسب با صفحه
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sleek Bottom Action Bar - Mobile and Android Touch-Optimized */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t dark:border-slate-800 pt-2 shrink-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 sm:pb-0 scrollbar-none">
                    <button
                      type="button"
                      onClick={handleSaveAsTemplate}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40 text-xs font-bold px-3 py-2 rounded-lg transition-all shrink-0"
                    >
                      ذخیره به عنوان قالب
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedOptionsModal(true)}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <Sliders size={13} />
                      تنظیمات کاغذ و امضاها ({newLetterForm.signers?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickDocxDownload()}
                      disabled={quickWordDownloading}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 text-xs font-bold px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0"
                      title="دانلود مستقیم سند جاری با فرمت ورد"
                    >
                      <FileDown size={14} className="text-blue-600 dark:text-blue-400" />
                      <span>{quickWordDownloading ? "در حال دریافت..." : "خروجی Word (.docx)"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTableModalTab("custom");
                        setShowTableModal(true);
                      }}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 text-xs font-bold px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0"
                      title="طراحی و مدیریت جداول اداری"
                    >
                      <Table size={14} className="text-blue-600 dark:text-blue-400" />
                      <span>طراحی جدول</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewLetterModal(false)}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl transition-all shrink-0"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="flex-1 sm:flex-none justify-center bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 min-h-[42px]"
                    >
                      <CheckCircle size={15} />
                      ثبت نهایی و صدور شماره نامه
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 1.1 ADVANCED SETTINGS & SIGNERS MODAL */}
      <AnimatePresence>
        {showAdvancedOptionsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto text-right"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
                <h4 className="text-sm font-black text-gray-800 dark:text-white flex items-center gap-2">
                  <Sliders size={16} className="text-purple-600" />
                  تنظیمات ساختاری کاغذ، امضاکنندگان و ضمائم نامه
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptionsModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Page & Stamp Config */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">اندازه کاغذ</label>
                  <select
                    value={newLetterForm.paperSize}
                    onChange={(e) =>
                      setNewLetterForm({
                        ...newLetterForm,
                        paperSize: e.target.value as "A4" | "A5",
                      })
                    }
                    className="w-full border dark:border-slate-700 dark:bg-slate-800 rounded-lg p-2 text-xs font-bold"
                  >
                    <option value="A4">A4 (استاندارد)</option>
                    <option value="A5">A5 (کوچک)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">جهت کاغذ</label>
                  <select
                    value={newLetterForm.orientation}
                    onChange={(e) =>
                      setNewLetterForm({
                        ...newLetterForm,
                        orientation: e.target.value as "portrait" | "landscape",
                      })
                    }
                    className="w-full border dark:border-slate-700 dark:bg-slate-800 rounded-lg p-2 text-xs font-bold"
                  >
                    <option value="portrait">عمودی (Portrait)</option>
                    <option value="landscape">افقی (Landscape)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">مکان امضا و مهر</label>
                  <select
                    value={newLetterForm.signaturePosition}
                    onChange={(e) =>
                      setNewLetterForm({
                        ...newLetterForm,
                        signaturePosition: e.target.value as any,
                      })
                    }
                    className="w-full border dark:border-slate-700 dark:bg-slate-800 rounded-lg p-2 text-xs font-bold"
                  >
                    <option value="bottom_left">پایین سمت چپ</option>
                    <option value="bottom_center">پایین وسط</option>
                    <option value="bottom_right">پایین سمت راست</option>
                  </select>
                </div>
              </div>

              {/* Multi-Stamp Selection & Configuration */}
              {(() => {
                const compSettings = getCompanySettingsForLetter(null, selectedCompany?.id);
                const normStamps = getNormalizedStamps(compSettings);
                return (
                  <div className="space-y-2 border-t dark:border-slate-800 pt-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
                        <Award size={14} className="text-purple-600" />
                        الصاق مهر سازمانی بر روی نامه
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newLetterForm.addCompanyStamp !== false}
                          onChange={(e) =>
                            setNewLetterForm({
                              ...newLetterForm,
                              addCompanyStamp: e.target.checked,
                            })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                      </label>
                    </div>

                    {newLetterForm.addCompanyStamp !== false && (
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border dark:border-slate-700 space-y-2">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                          انتخاب مهر مورد نظر برای این نامه:
                        </div>
                        {normStamps.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {normStamps.map((stamp) => {
                              const isSelected =
                                newLetterForm.selectedStampId === stamp.id ||
                                (!newLetterForm.selectedStampId && (stamp.isDefault || normStamps[0]?.id === stamp.id));
                              const stampUrl = stamp.url || stamp.imageUrl;
                              const stampTitle = stamp.name || stamp.title || "مهر بدون نام";
                              return (
                                <button
                                  key={stamp.id}
                                  type="button"
                                  onClick={() =>
                                    setNewLetterForm({
                                      ...newLetterForm,
                                      selectedStampId: stamp.id,
                                      selectedStampIds: [stamp.id],
                                    })
                                  }
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-right transition-all ${
                                    isSelected
                                      ? "border-purple-600 bg-purple-50/80 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold shadow-xs"
                                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                                  }`}
                                >
                                  {stampUrl ? (
                                    <img
                                      src={stampUrl}
                                      alt={stampTitle}
                                      className="w-9 h-9 object-contain rounded bg-white p-0.5 border"
                                    />
                                  ) : (
                                    <div className="w-9 h-9 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                                      <Award size={16} />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs truncate">{stampTitle}</div>
                                    {stamp.isDefault && (
                                      <span className="text-[9px] text-purple-600 font-medium">پیش‌فرض شرکت</span>
                                    )}
                                  </div>
                                  {isSelected && <CheckCircle size={14} className="text-purple-600 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                            مهری در تنظیمات این شرکت ثبت نشده است. می‌توانید از بخش تنظیمات سربرگ و مهر، مهرهای مختلف را با نام دلخواه آپلود نمایید.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Sign-off text and Signers */}
              <div className="space-y-3 border-t dark:border-slate-800 pt-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
                      متن پایانی نامه (عبارت احترام‌آمیز)
                    </label>
                    {/* Quick Presets */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {["با احترام", "با تشکر", "با احترام و آرزوی توفیق", "با تشکر و تجدید احترام"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setNewLetterForm({
                              ...newLetterForm,
                              signOffText: preset,
                            })
                          }
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-purple-950/60 transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={newLetterForm.signOffText}
                    onChange={(e) =>
                      setNewLetterForm({
                        ...newLetterForm,
                        signOffText: e.target.value,
                      })
                    }
                    placeholder="مثال: با تشکر و تقدیم احترام"
                    className="w-full border dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium"
                  />
                </div>

                <div className="space-y-3 bg-purple-50/40 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-100 dark:border-purple-900/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs text-purple-900 dark:text-purple-200 font-extrabold flex items-center gap-1.5">
                      <UserCheck size={15} className="text-purple-600 dark:text-purple-400" />
                      امضاکنندگان نامه ({newLetterForm.signers?.length || 0} نفر)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* System Users Dropdown Selector */}
                      {users && users.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const uid = e.target.value;
                            if (!uid) return;
                            const u = users.find((x) => x.id === uid || x.username === uid);
                            if (u) {
                              const roleTitle = getRoleTitleInPersian(u.role);
                              const s = newLetterForm.signers || [];
                              setNewLetterForm({
                                ...newLetterForm,
                                signers: [
                                  ...s,
                                  { name: u.fullName || u.username, title: roleTitle, userId: u.id || u.username },
                                ],
                              });
                            }
                            e.target.value = "";
                          }}
                          className="border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 text-purple-800 dark:text-purple-200 rounded-lg px-2.5 py-1 text-xs font-bold shadow-2xs"
                        >
                          <option value="">+ انتخاب امضاکننده از لیست مدیران و کاربران سیستم...</option>
                          {users.map((u) => (
                            <option key={u.id || u.username} value={u.id || u.username}>
                              👤 {u.fullName || u.username} ({getRoleTitleInPersian(u.role)})
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const s = newLetterForm.signers || [];
                          setNewLetterForm({
                            ...newLetterForm,
                            signers: [...s, { name: "", title: "", userId: "" }],
                          });
                        }}
                        className="text-xs text-purple-700 dark:text-purple-300 font-bold bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/60 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0"
                      >
                        + افزودن امضاکننده دستی
                      </button>
                    </div>
                  </div>

                  {(!newLetterForm.signers || newLetterForm.signers.length === 0) && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-2.5 rounded-lg border dark:border-slate-800 text-center font-medium">
                      هیچ امضاکننده‌ای انتخاب نشده است. از منوی بالا امضاکنندگان را از میان مدیران و کاربران سیستم انتخاب کنید یا دستی وارد کنید.
                    </div>
                  )}

                  {newLetterForm.signers?.map((signer, idx) => (
                    <div key={idx} className="p-2 bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-center gap-2">
                      {users && users.length > 0 && (
                        <select
                          value={signer.userId || ""}
                          onChange={(e) => {
                            const uid = e.target.value;
                            const u = users.find((x) => x.id === uid || x.username === uid);
                            const newSigners = [...(newLetterForm.signers || [])];
                            if (u) {
                              newSigners[idx] = {
                                name: u.fullName || u.username,
                                title: getRoleTitleInPersian(u.role),
                                userId: u.id || u.username,
                              };
                            } else {
                              newSigners[idx].userId = "";
                            }
                            setNewLetterForm({ ...newLetterForm, signers: newSigners });
                          }}
                          className="w-full sm:w-44 border dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200"
                        >
                          <option value="">-- اتصال به کاربر --</option>
                          {users.map((u) => (
                            <option key={u.id || u.username} value={u.id || u.username}>
                              {u.fullName || u.username} ({getRoleTitleInPersian(u.role)})
                            </option>
                          ))}
                        </select>
                      )}

                      <input
                        type="text"
                        placeholder="نام امضاکننده (مثال: محمد احمدی)"
                        value={signer.name}
                        onChange={(e) => {
                          const newSigners = [...(newLetterForm.signers || [])];
                          newSigners[idx].name = e.target.value;
                          setNewLetterForm({ ...newLetterForm, signers: newSigners });
                        }}
                        className="flex-1 w-full border dark:border-slate-700 dark:bg-slate-800 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                      />

                      <input
                        type="text"
                        placeholder="سمت (مثال: مدیر عامل)"
                        value={signer.title}
                        onChange={(e) => {
                          const newSigners = [...(newLetterForm.signers || [])];
                          newSigners[idx].title = e.target.value;
                          setNewLetterForm({ ...newLetterForm, signers: newSigners });
                        }}
                        className="flex-1 w-full border dark:border-slate-700 dark:bg-slate-800 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const newSigners = [...(newLetterForm.signers || [])];
                          newSigners.splice(idx, 1);
                          setNewLetterForm({ ...newLetterForm, signers: newSigners });
                        }}
                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 p-1.5 rounded-lg shrink-0 transition-colors"
                        title="حذف امضاکننده"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attachments Section */}
              <div className="space-y-3 border-t dark:border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-800 dark:text-slate-200 font-extrabold flex items-center gap-1.5">
                    <Paperclip size={14} className="text-amber-600" />
                    وضعیت و مدیریت پیوست‌های نامه اداری
                  </label>
                  <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border dark:border-slate-700">
                    <label className={`text-xs font-bold px-3 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${!newLetterForm.hasAttachment && (!newLetterForm.attachments || newLetterForm.attachments.length === 0) ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-xs" : "text-slate-500"}`}>
                      <input
                        type="radio"
                        name="hasAttachmentChoice"
                        checked={!newLetterForm.hasAttachment && (!newLetterForm.attachments || newLetterForm.attachments.length === 0)}
                        onChange={() =>
                          setNewLetterForm({
                            ...newLetterForm,
                            hasAttachment: false,
                          })
                        }
                        className="hidden"
                      />
                      <span>پیوست ندارد</span>
                    </label>
                    <label className={`text-xs font-bold px-3 py-1 rounded-lg cursor-pointer transition-all flex items-center gap-1.5 ${newLetterForm.hasAttachment || (newLetterForm.attachments && newLetterForm.attachments.length > 0) ? "bg-amber-600 text-white shadow-xs" : "text-slate-500"}`}>
                      <input
                        type="radio"
                        name="hasAttachmentChoice"
                        checked={Boolean(newLetterForm.hasAttachment || (newLetterForm.attachments && newLetterForm.attachments.length > 0))}
                        onChange={() =>
                          setNewLetterForm({
                            ...newLetterForm,
                            hasAttachment: true,
                          })
                        }
                        className="hidden"
                      />
                      <span>پیوست دارد</span>
                    </label>
                  </div>
                </div>

                {/* If letter has attachments, show description and preset options */}
                {(newLetterForm.hasAttachment || (newLetterForm.attachments && newLetterForm.attachments.length > 0)) && (
                  <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200">
                        عبارت درج‌شده در سربرگ، خروجی Word و پرینت:
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          "دارد (۱ برگ)",
                          "دارد (۲ برگ)",
                          "دارد (۳ برگ)",
                          "دارد (ضمائم اداری)",
                          "دارد (لوح فشرده)",
                        ].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setNewLetterForm({
                                ...newLetterForm,
                                hasAttachment: true,
                                attachmentDescription: preset.replace(/^دارد\s*\(?|\)?$/g, "").trim(),
                              })
                            }
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold hover:bg-amber-100 transition-colors"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="مثال: ۲ برگ فاکتور رسمی، تصویر چک، یا مدارک هویتی"
                      value={newLetterForm.attachmentDescription || ""}
                      onChange={(e) =>
                        setNewLetterForm({
                          ...newLetterForm,
                          hasAttachment: true,
                          attachmentDescription: e.target.value,
                        })
                      }
                      className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/60 rounded-lg px-3 py-1.5 text-xs font-bold"
                    />
                  </div>
                )}

                {/* Digital File Attachment Uploads */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
                      الصاق فایل‌های دیجیتال (اسناد، تصاویر، فاکتورها، PDF)
                    </label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={(e) => {
                        handleAttachmentUpload(e);
                        setNewLetterForm((prev) => ({
                          ...prev,
                          hasAttachment: true,
                        }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border dark:border-slate-700 px-3 py-1.5 rounded-lg font-bold transition-colors"
                      disabled={uploadingAttachment}
                    >
                      <Upload size={13} />
                      {uploadingAttachment
                        ? "درحال آپلود..."
                        : "انتخاب و الصاق فایل جدید"}
                    </button>
                  </div>

                  {newLetterForm.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {newLetterForm.attachments.map((file, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold px-2.5 py-1 rounded-lg"
                        >
                          <FileText size={12} className="text-purple-600" />
                          <span className="truncate max-w-[150px]">
                            {file.fileName}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(i)}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">
                      هیچ فایل دیجیتالی الصاق نشده است.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptionsModal(false)}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-5 py-2 rounded-xl"
                >
                  تایید و بازگشت به نگارش نامه
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 1.2 SMART ENTERPRISE TABLE STUDIO MODAL */}
      <AnimatePresence>
        {showTableModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-right custom-scrollbar"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600">
                    <Table size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-gray-800 dark:text-white">
                      کارگاه جامع طراحی و مدیریت جداول اداری (مشابه Word)
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      طراحی دقیق، الگوهای رسمی مالی و حقوقی، یا الصاق مستقیم از اکسل
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTableModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs font-bold gap-2">
                <button
                  type="button"
                  onClick={() => setTableModalTab("custom")}
                  className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                    tableModalTab === "custom" || tableModalTab === "grid"
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 font-black"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Table size={14} />
                  طراحی سفارشی جدول
                </button>
                <button
                  type="button"
                  onClick={() => setTableModalTab("templates")}
                  className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                    tableModalTab === "templates"
                      ? "border-purple-600 text-purple-600 dark:text-purple-400 font-black"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <FileSpreadsheet size={14} />
                  قالب‌های آماده اداری و مالی
                </button>
                <button
                  type="button"
                  onClick={() => setTableModalTab("paste")}
                  className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                    tableModalTab === "paste"
                      ? "border-amber-600 text-amber-600 dark:text-amber-400 font-black"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Copy size={14} />
                  پیست مستقیم از اکسل (Paste)
                </button>
              </div>

              {/* TAB 1: Custom Table Designer */}
              {(tableModalTab === "custom" || tableModalTab === "grid") && (
                <div className="space-y-4 py-1">
                  {/* Presets */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                      قالب‌های ابعاد سریع:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { r: 2, c: 2, label: "جدول ۲ × ۲" },
                        { r: 3, c: 3, label: "جدول ۳ × ۳" },
                        { r: 4, c: 3, label: "۴ سطر × ۳ ستون" },
                        { r: 5, c: 4, label: "۵ سطر × ۴ ستون" },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setCustomTableRows(item.r);
                            setCustomTableCols(item.c);
                          }}
                          className={`p-2 border rounded-xl text-xs font-bold transition-all text-center ${
                            customTableRows === item.r && customTableCols === item.c
                              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300 shadow-xs"
                              : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dimension inputs */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <label className="text-[11px] text-slate-600 dark:text-slate-300 font-bold block mb-1">
                        تعداد سطرها:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={customTableRows}
                        onChange={(e) => setCustomTableRows(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs p-2 border rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-600 dark:text-slate-300 font-bold block mb-1">
                        تعداد ستون‌ها:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={customTableCols}
                        onChange={(e) => setCustomTableCols(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full text-xs p-2 border rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Interactive Visual Mini-Preview */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                      پیش‌نمایش ساختار جدول:
                    </label>
                    <div className="border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-950 overflow-x-auto max-h-48 custom-scrollbar">
                      <table className="w-full border-collapse text-[10px] text-center">
                        <thead>
                          <tr className="bg-blue-900 text-white font-bold">
                            {Array.from({ length: Math.min(customTableCols, 8) }).map((_, cIdx) => (
                              <th key={cIdx} className="border border-blue-800 p-1.5">
                                ستون {toPersianDigits(cIdx + 1)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: Math.min(customTableRows - 1, 4) }).map((_, rIdx) => (
                            <tr key={rIdx} className={rIdx % 2 === 1 ? "bg-slate-50 dark:bg-slate-900/60" : ""}>
                              {Array.from({ length: Math.min(customTableCols, 8) }).map((_, cIdx) => (
                                <td key={cIdx} className="border border-slate-200 dark:border-slate-800 p-1.5 text-slate-400">
                                  داده
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowTableModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                    >
                      انصراف
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertCustomTable(customTableRows, customTableCols)}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-md transition-all"
                    >
                      <Table size={14} />
                      درج جدول سفارشی در نامه
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: Pre-built Corporate Table Templates */}
              {tableModalTab === "templates" && (
                <div className="space-y-3 py-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Template 1: Invoice */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/60 dark:bg-slate-800/40 hover:border-blue-400 transition-all flex flex-col justify-between">
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-extrabold text-xs">
                          <Table size={14} />
                          صورت‌حساب مالی و پیش‌فاکتور
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          شامل ستون‌های ردیف، شرح کالا، تعداد، واحد، مبلغ واحد و جمع کل ریالی
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertTemplateTable("invoice")}
                        className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors"
                      >
                        درج این جدول در نامه
                      </button>
                    </div>

                    {/* Template 2: Meeting Minutes */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/60 dark:bg-slate-800/40 hover:border-emerald-400 transition-all flex flex-col justify-between">
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs">
                          <CheckCheck size={14} />
                          جدول صورتجلسه و مصوبات
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          شامل ردیف، شرح مصوبه، مسئول پیگیری، مهلت اقدام و وضعیت پیشرفت
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertTemplateTable("minutes")}
                        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors"
                      >
                        درج این جدول در نامه
                      </button>
                    </div>

                    {/* Template 3: Technical Specs */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-400 transition-all flex flex-col justify-between">
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-extrabold text-xs">
                          <SlidersHorizontal size={14} />
                          مقایسه مشخصات فنی و بازرگانی
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          شامل ردیف، پارامتر فنی، مشخصات درخواستی، مشخصات ارائه‌شده و انطباق
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertTemplateTable("technical")}
                        className="w-full py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
                      >
                        درج این جدول در نامه
                      </button>
                    </div>

                    {/* Template 4: Personnel List */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/60 dark:bg-slate-800/40 hover:border-purple-400 transition-all flex flex-col justify-between">
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300 font-extrabold text-xs">
                          <Users size={14} />
                          اطلاعات پرسنل و اعضای هیئت
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          شامل ردیف، نام و نام خانوادگی، شماره ملی، سمت سازمانی و شماره تماس
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertTemplateTable("personnel")}
                        className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-colors"
                      >
                        درج این جدول در نامه
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Direct Excel Paste Importer */}
              {tableModalTab === "paste" && (
                <div className="space-y-3 py-1">
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl">
                    <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed font-bold">
                      راهنمای کپی از اکسل: سلول‌های مورد نظر را در Excel یا نرم‌افزار Calc با موس انتخاب کرده و کلیدهای Ctrl+C را فشار دهید. سپس در کادر زیر کلیک کرده و با کلیدهای Ctrl+V الصاق (Paste) نمایید.
                    </p>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      داده‌های کپی شده از اکسل:
                    </label>
                    <textarea
                      rows={6}
                      value={sheetDataText}
                      onChange={(e) => setSheetDataText(e.target.value)}
                      placeholder="سلول‌های کپی شده از Excel را اینجا Paste کنید..."
                      className="w-full text-xs p-3 border rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowTableModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      انصراف
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertSheetTable(sheetDataText)}
                      disabled={!sheetDataText.trim()}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow flex items-center gap-2 transition-all"
                    >
                      <Table size={14} />
                      تبدیل هوشمند و درج جدول در نامه
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONLYOFFICE DOCUMENT SERVER SETTINGS MODAL */}
      <AnimatePresence>
        {showOnlyOfficeSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl max-w-xl w-full p-5 shadow-2xl flex flex-col text-right max-h-[90vh] overflow-y-auto"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3 mb-4">
                <h3 className="text-base font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <Building2 size={20} className="text-orange-500" />
                  <span>تنظیمات سرور محلی و آفلاین ONLYOFFICE</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowOnlyOfficeSettingsModal(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 rounded-xl p-3 text-orange-900 dark:text-orange-200 leading-relaxed">
                  <p className="font-bold mb-1">راه‌اندازی کاملاً آفلاین و محلی بر روی سرور شما:</p>
                  <p>
                    برای استفاده از ویرایشگر ONLYOFFICE بدون نیاز به اینترنت، کافیست سرویس داکر آن را بر روی سرور خود اجرا کنید و آدرس آن را در کادر زیر قرار دهید.
                  </p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    آدرس سرور Document Server:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customDocServerInput}
                      onChange={(e) => setCustomDocServerInput(e.target.value)}
                      placeholder="http://localhost:8088 یا http://192.168.1.10:8088"
                      className="flex-1 p-2.5 border rounded-xl border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-left text-xs"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => checkOnlyOfficeHealth(customDocServerInput)}
                      disabled={checkingOnlyOfficeHealth}
                      className="px-3 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-xl font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0"
                    >
                      <RefreshCw size={14} className={checkingOnlyOfficeHealth ? "animate-spin text-orange-500" : ""} />
                      <span>تست اتصال</span>
                    </button>
                  </div>

                  {onlyOfficeHealthStatus && (
                    <div className="mt-2 p-3 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 dark:text-slate-300">تست داکر محلی (پورت 8088):</span>
                        {onlyOfficeHealthStatus.localServer?.ok ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">🟢 فعال و آماده به کار</span>
                        ) : (
                          <span className="text-red-500 dark:text-red-400 font-bold flex items-center gap-1">🔴 خاموش / عدم پاسخ داکر</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700/80 pt-1.5">
                        <span className="font-bold text-slate-700 dark:text-slate-300">تست سرور عمومی آنلاین:</span>
                        {onlyOfficeHealthStatus.publicServer?.ok ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">🟢 آنلاین و در دسترس</span>
                        ) : (
                          <span className="text-slate-400 font-medium">⚪ نامشخص / مسدود</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Presets */}
                <div>
                  <span className="font-bold text-slate-600 dark:text-slate-400 block mb-2">
                    انتخاب سریع سرور:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const origin = typeof window !== "undefined" ? window.location.origin : "";
                        setCustomDocServerInput(`${origin}/onlyoffice-proxy`);
                      }}
                      className="p-2.5 rounded-xl border-2 border-emerald-500/80 bg-emerald-50/60 dark:bg-emerald-950/30 text-right transition-all sm:col-span-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300 block text-[11px]">اتصال از طریق پروکسی امن سامانه (پیش‌فرض پیشنهادی HTTPS - بدون مسدودی مرورگر)</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-extrabold">توصیه شده</span>
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">
                        {typeof window !== "undefined" ? `${window.location.origin}/onlyoffice-proxy` : "/onlyoffice-proxy"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCustomDocServerInput("http://localhost:8088")}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-orange-500 bg-slate-50 dark:bg-slate-800/80 text-right transition-colors"
                    >
                      <span className="font-bold text-slate-800 dark:text-white block text-[11px]">پورت مستقیم داکر روی لوکال‌هاست</span>
                      <span className="text-[10px] text-slate-400 font-mono" dir="ltr">http://localhost:8088</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
                        setCustomDocServerInput(`http://${host}:8088`);
                      }}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-orange-500 bg-slate-50 dark:bg-slate-800/80 text-right transition-colors"
                    >
                      <span className="font-bold text-slate-800 dark:text-white block text-[11px]">آی‌پی شبکه سرور جاری</span>
                      <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                        http://{typeof window !== "undefined" ? window.location.hostname : "IP"}:8088
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCustomDocServerInput("https://documentserver.onlyoffice.com")}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-slate-800/80 text-right transition-colors sm:col-span-2"
                    >
                      <span className="font-bold text-slate-800 dark:text-white block text-[11px]">سرور آنلاین و دمو ONLYOFFICE (نیاز به اینترنت)</span>
                      <span className="text-[10px] text-slate-400 font-mono" dir="ltr">https://documentserver.onlyoffice.com</span>
                    </button>
                  </div>
                </div>

                {/* Docker Quick Command */}
                <div className="bg-slate-900 rounded-xl p-3 border border-slate-700 text-white font-mono text-[11px] space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] font-sans">
                    <span>دستور داکر برای راه‌اندازی در سرور (آفلاین):</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText("docker run -i -t -d -p 8088:80 --name onlyoffice-documentserver --restart=always -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true onlyoffice/documentserver");
                        alert("دستور کپی شد!");
                      }}
                      className="text-orange-400 hover:text-orange-300 font-bold"
                    >
                      کپی دستور
                    </button>
                  </div>
                  <div className="overflow-x-auto text-emerald-400 select-all whitespace-pre-wrap p-1 bg-black/40 rounded-lg" dir="ltr">
                    docker run -i -t -d -p 8088:80 --name onlyoffice-documentserver --restart=always -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true onlyoffice/documentserver
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 mt-4 border-t dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOnlyOfficeSettingsModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-4 py-2 rounded-xl"
                >
                  انصراف
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const cleanUrl = customDocServerInput.trim().replace(/\/+$/, "");
                    if (cleanUrl) {
                      setOnlyOfficeDocServerUrl(cleanUrl);
                      localStorage.setItem("ONLYOFFICE_DOC_SERVER_URL", cleanUrl);
                      setOnlyOfficeLoadError(null);
                      setShowOnlyOfficeSettingsModal(false);
                      handlePrepareOnlyOfficeDoc(true);
                    }
                  }}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-md"
                >
                  ذخیره و اتصال
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. DETAILED LETTER VIEW MODAL */}
      <AnimatePresence>
        {selectedLetterForView && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs overflow-hidden">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`bg-white dark:bg-slate-900 border dark:border-slate-800 shadow-2xl flex flex-col text-right transition-all duration-200 ${
                letterViewFullscreen
                  ? "fixed inset-0 w-full h-full max-w-none max-h-none rounded-none p-2.5 sm:p-4 z-50 overflow-hidden"
                  : "rounded-2xl max-w-6xl w-full p-3 sm:p-5 max-h-[94vh]"
              }`}
              dir="rtl"
            >
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between border-b dark:border-slate-800 pb-2.5 shrink-0 gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <h3 className="text-sm sm:text-base font-black text-gray-800 dark:text-white flex items-center gap-1.5 truncate">
                    <FileText size={18} className="text-purple-600 shrink-0" />
                    <span className="truncate">نامه شماره: {selectedLetterForView.letterNumber}</span>
                  </h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                      selectedLetterForView.type === "internal"
                        ? "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                        : selectedLetterForView.type === "incoming"
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                    }`}
                  >
                    {selectedLetterForView.type === "internal"
                      ? "داخلی"
                      : selectedLetterForView.type === "incoming"
                        ? "وارده"
                        : "صادره"}
                  </span>
                  {selectedLetterForView.isPrivate && (
                    <span className="text-[10px] bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
                      <Lock size={10} /> محرمانه
                    </span>
                  )}
                  {selectedLetterForView.status === SecretariatLetterStatus.ARCHIVED && (
                    <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
                      <Archive size={10} /> بایگانی‌شده
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {canEditLetters && (
                    <button
                      onClick={() =>
                        handleEditLetterClick(selectedLetterForView)
                      }
                      className="p-1.5 text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                      title="ویرایش نامه"
                    >
                      <Edit size={14} /> <span className="hidden sm:inline">ویرایش</span>
                    </button>
                  )}
                  {canDeleteLetters && (
                    <button
                      onClick={() =>
                        handleDeleteLetter(selectedLetterForView.id)
                      }
                      className="p-1.5 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800/40 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                      title="حذف نامه"
                    >
                      <Trash2 size={14} /> <span className="hidden sm:inline">حذف</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsPrintMode(selectedLetterForView)}
                    className="p-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title="چاپ با بالاترین کیفیت"
                  >
                    <Printer size={14} /> <span className="hidden sm:inline">چاپ و PDF</span>
                  </button>
                  <button
                    onClick={() => handleShareSecretariatLetterToChat(selectedLetterForView)}
                    disabled={isSharingLetter}
                    className="p-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title="ارسال مستقیم تصویر نامه اداری به گفتگو"
                  >
                    {isSharingLetter ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                    <span className="hidden sm:inline">ارسال به گفتگو</span>
                  </button>

                  {/* Desktop Wide Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setLetterViewWideMode(!letterViewWideMode)}
                    className={`hidden lg:flex p-1.5 rounded-lg border transition-colors items-center gap-1 text-xs font-bold cursor-pointer ${
                      letterViewWideMode
                        ? "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                    title={letterViewWideMode ? "نمایش دو ستونه (با پنل ارجاعات)" : "نمایش عریض برگه نامه (تمام صفحه)"}
                  >
                    <Columns size={14} />
                    <span className="hidden xl:inline">{letterViewWideMode ? "دو ستونه" : "برگه عریض"}</span>
                  </button>

                  {/* Fullscreen Toggle */}
                  <button
                    type="button"
                    onClick={() => setLetterViewFullscreen(!letterViewFullscreen)}
                    className="p-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title={letterViewFullscreen ? "خروج از حالت تمام صفحه" : "مشاهده تمام صفحه"}
                  >
                    {letterViewFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span className="hidden sm:inline">{letterViewFullscreen ? "پنجره‌ای" : "تمام‌صفحه"}</span>
                  </button>

                  <button
                    onClick={() => setSelectedLetterForView(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Compact Metadata Ribbon (جمع و جور کردن مشخصات و موضوع نامه) */}
              <div className="bg-slate-50 dark:bg-slate-800/80 border dark:border-slate-700/60 rounded-xl p-2 sm:p-2.5 my-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-black text-slate-400 dark:text-slate-400 shrink-0">موضوع:</span>
                  <span className="font-black text-slate-800 dark:text-white truncate max-w-xs sm:max-w-md">{selectedLetterForView.subject}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <div><b className="text-slate-400 font-bold">فرستنده:</b> {selectedLetterForView.sender}</div>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <div><b className="text-slate-400 font-bold">گیرنده:</b> {selectedLetterForView.receiver}</div>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <div><b className="text-slate-400 font-bold">تاریخ:</b> <span className="font-mono">{selectedLetterForView.date}</span></div>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <div><b className="text-slate-400 font-bold">پیوست:</b> {selectedLetterForView.attachments?.length ? `${selectedLetterForView.attachments.length} فایل` : "ندارد"}</div>
                </div>
              </div>

              {/* Mobile View Switcher Tabs (برای گوشی‌های موبایل) */}
              <div className="flex lg:hidden items-center justify-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-2 shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => setLetterViewMobileTab("preview")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    letterViewMobileTab === "preview"
                      ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <FileText size={14} /> مشاهده برگه نامه
                </button>
                <button
                  type="button"
                  onClick={() => setLetterViewMobileTab("actions")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    letterViewMobileTab === "actions"
                      ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  <UserCheck size={14} /> اقدامات و ارجاعات
                  {selectedLetterForView.referredTo?.length ? (
                    <span className="bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] px-1.5 py-0.2 rounded-full mr-1">
                      {selectedLetterForView.referredTo.length}
                    </span>
                  ) : null}
                </button>
              </div>

              {/* Main Two Column layout for Full Visibility */}
              {(() => {
                const viewCompanySettings = getCompanySettingsForLetter(
                  selectedLetterForView,
                  selectedLetterForView.companyId,
                );
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 flex-1 min-h-0 overflow-hidden">
                    {/* Left/Center: Letter Document Paper (High Priority & Space) */}
                    <div
                      className={`flex flex-col min-h-0 overflow-hidden bg-slate-100 dark:bg-slate-950/60 rounded-xl border dark:border-slate-800/80 p-2 sm:p-3 ${
                        letterViewWideMode ? "lg:col-span-12" : "lg:col-span-8"
                      } ${letterViewMobileTab === "preview" ? "flex" : "hidden lg:flex"}`}
                    >
                      {/* Zoom & View Controls Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/90 border dark:border-slate-800 px-3 py-1.5 rounded-lg mb-2 text-xs shrink-0 shadow-2xs">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 text-[11px] font-bold">
                          <FileText size={14} className="text-purple-600" />
                          <span>پیش‌نمایش برگه نامه اداری</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setLetterViewZoom((prev) => Math.max(30, prev - 10))}
                            className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="کوچک‌نمایی (-)"
                          >
                            <ZoomOut size={13} />
                          </button>

                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 min-w-[44px] justify-center">
                            {letterViewZoom}%
                          </div>

                          <button
                            type="button"
                            onClick={() => setLetterViewZoom((prev) => Math.min(180, prev + 10))}
                            className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="بزرگ‌نمایی (+)"
                          >
                            <ZoomIn size={13} />
                          </button>

                          <span className="text-slate-300 dark:text-slate-700 mx-0.5">|</span>

                          <button
                            type="button"
                            onClick={() => setLetterViewZoom(getAutoFitZoom())}
                            className="px-2 py-0.5 text-[11px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 rounded transition-colors cursor-pointer"
                            title="مشاهده متناسب با عرض صفحه نمایش یا گوشی"
                          >
                            متناسب با صفحه
                          </button>
                          <button
                            type="button"
                            onClick={() => setLetterViewZoom(100)}
                            className="px-2 py-0.5 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded transition-colors cursor-pointer hidden sm:inline"
                            title="اندازه واقعی ۱۰۰٪"
                          >
                            ۱۰۰٪
                          </button>
                          <button
                            type="button"
                            onClick={() => setLetterViewZoom(100)}
                            className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="بازنشانی زوم"
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>

                      <div className="overflow-y-auto overflow-x-auto flex-1 flex flex-col items-center justify-start custom-scrollbar p-1 sm:p-4 touch-pan-x touch-pan-y">
                        <div
                          style={{
                            width: letterViewZoom !== 100 ? `${Math.round((selectedLetterForView.paperSize === "A5" ? (selectedLetterForView.orientation === "landscape" ? 794 : 559) : (selectedLetterForView.orientation === "landscape" ? 1123 : 794)) * (letterViewZoom / 100))}px` : undefined,
                            height: letterViewZoom !== 100 ? `${Math.round((selectedLetterForView.paperSize === "A5" ? (selectedLetterForView.orientation === "landscape" ? 559 : 794) : (selectedLetterForView.orientation === "landscape" ? 794 : 1123)) * (letterViewZoom / 100)) + 30}px` : undefined,
                            transform: `scale(${letterViewZoom / 100})`,
                            transformOrigin: "top center",
                            transition: "transform 0.15s ease-out",
                          }}
                          className="flex justify-center shrink-0"
                        >
                          <div
                            id="letter-view-paper-section"
                            className="secretariat-a4-paper bg-white text-slate-900 border border-slate-200 shadow-lg rounded-sm flex flex-col justify-between text-right font-sans relative overflow-hidden shrink-0"
                            style={{
                              width:
                                selectedLetterForView.paperSize === "A5"
                                  ? selectedLetterForView.orientation === "landscape"
                                    ? "210mm"
                                    : "148mm"
                                  : selectedLetterForView.orientation === "landscape"
                                    ? "297mm"
                                  : "210mm",
                              minHeight:
                                selectedLetterForView.paperSize === "A5"
                                  ? selectedLetterForView.orientation === "landscape"
                                    ? "148mm"
                                    : "210mm"
                                  : selectedLetterForView.orientation === "landscape"
                                    ? "210mm"
                                    : "297mm",
                              paddingTop: `${viewCompanySettings.marginTop ?? 40}mm`,
                              paddingBottom: `${viewCompanySettings.marginBottom ?? 25}mm`,
                              paddingRight: `${viewCompanySettings.marginRight ?? 20}mm`,
                              paddingLeft: `${viewCompanySettings.marginLeft ?? 20}mm`,
                              fontFamily:
                                viewCompanySettings.letterheadFontFamily ||
                                "'Vazirmatn', sans-serif",
                              boxSizing: "border-box",
                            }}
                            dir="rtl"
                          >
                            {/* Background Letterhead if uploaded */}
                            {getEffectiveLetterheadDisplayUrl(viewCompanySettings) && (
                              <img
                                src={getEffectiveLetterheadDisplayUrl(viewCompanySettings)}
                                alt="سربرگ شرکت"
                                className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0 select-none"
                              />
                            )}

                            {/* Top-left metadata block (شماره / تاریخ / پیوست) matching Editor & Print 1:1 */}
                            <div
                              style={{
                                position: "absolute",
                                top: `${viewCompanySettings.metadataTop ?? 25}mm`,
                                left: `${viewCompanySettings.metadataLeft ?? 20}mm`,
                                fontSize: `${viewCompanySettings.metadataFontSize ?? 11}px`,
                                color: viewCompanySettings.metadataColor || "#0f172a",
                                lineHeight: "1.8",
                                fontWeight:
                                  viewCompanySettings.metadataFontWeight || "bold",
                                opacity:
                                  (viewCompanySettings.metadataOpacity ?? 100) / 100,
                                fontFamily:
                                  viewCompanySettings.letterheadFontFamily ||
                                  "inherit",
                                textAlign: "right",
                                direction: "rtl",
                                zIndex: 20,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <div>
                                شماره:{" "}
                                <span
                                  style={{
                                    direction: "ltr",
                                    display: "inline-block",
                                  }}
                                >
                                  {toPersianDigits(
                                    selectedLetterForView.letterNumber,
                                  )}
                                </span>
                              </div>
                              <div>
                                تاریخ:{" "}
                                <span
                                  style={{
                                    direction: "ltr",
                                    display: "inline-block",
                                  }}
                                >
                                  {toPersianDigits(selectedLetterForView.date)}
                                </span>
                              </div>
                              <div>
                                پیوست:{" "}
                                {selectedLetterForView.hasAttachment ||
                                selectedLetterForView.attachments?.length > 0
                                  ? "دارد"
                                  : "ندارد"}
                              </div>
                            </div>

                            {/* Letter Body Container matching Editor 1:1 */}
                            <div className="relative z-10 flex flex-col justify-between flex-1">
                              <div
                                className="ql-editor text-slate-900 leading-loose font-medium text-[14px]"
                                dangerouslySetInnerHTML={{
                                  __html: preserveLetterHtmlSpaces(
                                    selectedLetterForView.content || "",
                                  ),
                                }}
                              />

                              {/* Optional Sign-off / Signers / Company Stamp (only if not already inside content) */}
                              {((selectedLetterForView.signers &&
                                selectedLetterForView.signers.length > 0) ||
                                (selectedLetterForView.approvedBy &&
                                  selectedLetterForView.approvedBy.length > 0) ||
                                (selectedLetterForView.addCompanyStamp &&
                                  viewCompanySettings.companyStampUrl)) && (
                                <div className="pt-4 mt-4 space-y-3 break-inside-avoid">
                                  <div className="flex flex-wrap items-end justify-between gap-4">
                                    {selectedLetterForView.addCompanyStamp &&
                                      viewCompanySettings.companyStampUrl && (
                                        <div className="flex flex-col items-center">
                                          <img
                                            src={viewCompanySettings.companyStampUrl}
                                            alt="مهر شرکت"
                                            className="h-20 w-auto object-contain mix-blend-multiply opacity-90"
                                          />
                                        </div>
                                      )}

                                    <div className="flex flex-wrap gap-3 justify-end ml-auto">
                                      {selectedLetterForView.approvedBy &&
                                      selectedLetterForView.approvedBy.length > 0
                                        ? selectedLetterForView.approvedBy.map(
                                            (userId, i) => {
                                              const signer = users.find(
                                                (u) => u.id === userId,
                                              );
                                              const sigUrl =
                                                selectedLetterForView
                                                  .signatureImageUrls?.[i];
                                              return (
                                                <div
                                                  key={i}
                                                  className="text-center space-y-1 p-1.5 min-w-[100px]"
                                                >
                                                  {sigUrl && (
                                                    <img
                                                      src={sigUrl}
                                                      className="h-12 mx-auto object-contain mix-blend-multiply"
                                                    />
                                                  )}
                                                  <span className="text-[11px] font-bold text-gray-800 block">
                                                    {signer?.fullName ||
                                                      "کاربر سیستم"}
                                                  </span>
                                                </div>
                                              );
                                            },
                                          )
                                        : selectedLetterForView.signers &&
                                          selectedLetterForView.signers.length > 0
                                          ? selectedLetterForView.signers.map(
                                              (s, i) => (
                                                <div
                                                  key={i}
                                                  className="text-center space-y-0.5 min-w-[100px] pt-1"
                                                >
                                                  <div className="text-[12px] font-bold text-slate-800">
                                                    {s.name}
                                                  </div>
                                                  <div className="text-[11px] text-slate-500">
                                                    {s.title}
                                                  </div>
                                                </div>
                                              ),
                                            )
                                          : null}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Letter attachments view link */}
                    {selectedLetterForView.attachments?.length > 0 && (
                      <div className="w-full max-w-2xl mt-3 space-y-1.5 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl p-3">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block flex items-center gap-1">
                          <FileText size={13} className="text-purple-600" />
                          فایل‌های الصاقی (پیوست‌ها):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {selectedLetterForView.attachments.map((file, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <a
                                href={file.url}
                                target="_blank"
                                rel="referrer"
                                className="flex-1 flex items-center justify-between bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-purple-700 dark:text-purple-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all font-bold truncate"
                              >
                                <span className="flex items-center gap-1 truncate">
                                  <FileText size={13} className="shrink-0" /> <span className="truncate">{file.fileName}</span>
                                </span>
                                <span className="text-[9px] text-slate-400 shrink-0 ml-1">
                                  دانلود
                                </span>
                              </a>
                              <button
                                type="button"
                                onClick={() => openSendToChat({
                                  fileUrl: file.url,
                                  fileName: file.fileName,
                                  title: `ارسال پیوست ${file.fileName} به گفتگو`,
                                  defaultMessage: `📎 فایل پیوست نامه شماره ${selectedLetterForView.letterNumber || '-'}: ${file.fileName}`
                                })}
                                className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg border border-emerald-200 dark:border-emerald-800/40 transition-colors cursor-pointer shrink-0"
                                title="ارسال مستقیم پیوست به گفتگو"
                              >
                                <MessageSquare size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>

                {/* Right: Side Actions, Referrals & Comments */}
                <div
                  className={`flex flex-col gap-3 overflow-y-auto pr-1 min-h-0 custom-scrollbar ${
                    letterViewWideMode ? "hidden" : "lg:col-span-4"
                  } ${letterViewMobileTab === "actions" ? "flex" : "hidden lg:flex"}`}
                >
                  {/* Approval Actions Panel */}
                  <div className="p-3.5 border dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-2.5 shadow-xs">
                    <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5 border-b dark:border-slate-800 pb-2">
                      <UserCheck size={14} className="text-purple-600" />
                      اقدامات و تایید نامه اداری
                    </span>

                    <div className="flex flex-col gap-2">
                      {/* Sign and Confirm Button */}
                      <button
                        onClick={handleApproveSign}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-sm hover:shadow transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus size={15} /> تایید و امضای رسمی نامه (الصاق تصویر امضا)
                      </button>

                      {/* Reject Letter */}
                      <button
                        onClick={handleRejectLetter}
                        className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold text-xs py-1.5 px-3 rounded-lg border border-red-200 dark:border-red-800/40 transition-colors flex items-center justify-center gap-1"
                      >
                        مخالفت و رد نامه اداری
                      </button>

                      {/* Company Stamp toggle */}
                      {companySettingsForm.companyStampUrl && (
                        <label className="flex items-center gap-2 bg-red-50/40 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-2 rounded-lg cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedLetterForView.addCompanyStamp || false}
                            onChange={async (e) => {
                              const updated: SecretariatLetter = {
                                ...selectedLetterForView,
                                addCompanyStamp: e.target.checked,
                                updatedAt: Date.now(),
                              };
                              try {
                                const letters = await updateSecretariatLetter(updated);
                                setLetters(letters);
                                setSelectedLetterForView(updated);
                              } catch (err) {
                                alert("خطا در تغییر وضعیت مهر شرکت");
                              }
                            }}
                            className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                            <Award size={13} className="text-red-600" /> درج مهر رسمی شرکت پای این نامه
                          </span>
                        </label>
                      )}
                    </div>

                    {/* Quick status controls (Archive/Unarchive/Delete) */}
                    <div className="flex gap-2 border-t dark:border-slate-800 pt-2.5">
                      <button
                        onClick={() => handleToggleArchive(selectedLetterForView)}
                        className="flex-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Archive size={12} />
                        {selectedLetterForView.status === SecretariatLetterStatus.ARCHIVED
                          ? "خروج از بایگانی"
                          : "انتقال به بایگانی اسناد"}
                      </button>
                    </div>
                  </div>

                  {/* Letter Official Export PDF/DOCX Card */}
                  <div className="p-3.5 border dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-2 shadow-xs">
                    <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5 border-b dark:border-slate-800 pb-2">
                      <Download size={14} className="text-blue-600" />
                      خروجی رسمی و دریافت فایل
                    </span>

                    <button
                      type="button"
                      onClick={() => openSendToChat({
                        fileUrl: `/api/secretariat/letters/${selectedLetterForView.id}/pdf`,
                        fileName: `Letter_${selectedLetterForView.letterNumber || selectedLetterForView.id}.pdf`,
                        title: "ارسال فایل PDF رسمی نامه به گفتگو",
                        defaultMessage: `📄 فایل PDF رسمی نامه اداری شماره ${selectedLetterForView.letterNumber || '-'}: ${selectedLetterForView.subject || ''}`
                      })}
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg py-1.5 text-[11px] font-bold transition-all cursor-pointer"
                    >
                      <MessageSquare size={13} />
                      ارسال فایل PDF رسمی به گفتگو
                    </button>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuickPdfDownload(selectedLetterForView, false)}
                        className="flex items-center justify-center gap-1 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-300 hover:bg-red-100 rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <FileText size={12} /> PDF با سربرگ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickPdfDownload(selectedLetterForView, true)}
                        className="flex items-center justify-center gap-1 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <FileText size={12} /> PDF بدون سربرگ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickDocxDownload(selectedLetterForView, false)}
                        className="flex items-center justify-center gap-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <FileText size={12} /> Word با سربرگ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickDocxDownload(selectedLetterForView, true)}
                        className="flex items-center justify-center gap-1 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 rounded-lg py-1.5 text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <FileText size={12} /> Word بدون سربرگ
                      </button>
                    </div>
                  </div>

                  {/* Referral Panel */}
                  <div className="p-3.5 border dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-2 shadow-xs">
                    <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5 border-b dark:border-slate-800 pb-2">
                      <Share2 size={14} className="text-amber-600" /> ارجاع نامه به پرسنل
                    </span>

                    <div className="max-h-28 overflow-y-auto border dark:border-slate-800 rounded-lg p-1.5 space-y-1 bg-slate-50/50 dark:bg-slate-800/50">
                      {users
                        .filter((u) => u.id !== currentUser.id)
                        .map((u) => {
                          const isReferred =
                            selectedLetterForView.referredTo?.includes(u.id);
                          const isSelected = selectedReferrals.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className="flex items-center gap-2 text-[11px] hover:bg-white dark:hover:bg-slate-800 p-1 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isReferred || isSelected}
                                disabled={isReferred}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedReferrals((p) =>
                                      p.filter((id) => id !== u.id),
                                    );
                                  } else {
                                    setSelectedReferrals((p) => [...p, u.id]);
                                  }
                                }}
                                className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                              />
                              <span
                                className={`font-bold ${isReferred ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}
                              >
                                {u.fullName} {isReferred && "(ارجاع شده)"}
                              </span>
                            </label>
                          );
                        })}
                    </div>

                    <button
                      onClick={handleReferLetter}
                      disabled={selectedReferrals.length === 0}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ثبت ارجاعات انتخابی
                    </button>
                  </div>

                  {/* Comments Panel */}
                  <div className="p-3.5 border dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 space-y-2 shadow-xs">
                    <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5 border-b dark:border-slate-800 pb-2">
                      <MessageSquare size={14} className="text-indigo-600" />
                      نظرات و پیگیری پاراف‌ها
                    </span>

                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                      {!selectedLetterForView.comments ||
                      selectedLetterForView.comments.length === 0 ? (
                        <p className="text-[10px] text-slate-400 text-center py-2">
                          نظری برای این نامه ثبت نشده است.
                        </p>
                      ) : (
                        selectedLetterForView.comments.map((c) => (
                          <div
                            key={c.id}
                            className="bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg text-[10px] space-y-0.5 leading-relaxed border dark:border-slate-700"
                          >
                            <div className="flex justify-between items-center text-slate-400">
                              <span className="font-bold text-slate-700 dark:text-slate-200">
                                {c.username}
                              </span>
                              <span>
                                {new Date(c.createdAt).toLocaleDateString(
                                  "fa-IR",
                                )}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 font-medium">
                              {c.comment}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex gap-1.5 pt-1.5 border-t dark:border-slate-800">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="ثبت نظر یا پاراف اداری..."
                        className="flex-1 border dark:border-slate-700 dark:bg-slate-800 rounded-lg px-2 py-1 text-xs"
                      />
                      <button
                        onClick={handleAddComment}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition-colors"
                      >
                        ارسال
                      </button>
                    </div>
                  </div>
                </div>
              </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. HIGH QUALITY PRINT & PDF GENERATOR LAYOUT MODAL */}
      <AnimatePresence>
        {isPrintMode && (() => {
          const printSettings = getCompanySettingsForLetter(
            isPrintMode,
            isPrintMode.companyId,
          );
          const paperWidth =
            isPrintMode.paperSize === "A5"
              ? isPrintMode.orientation === "landscape"
                ? "210mm"
                : "148mm"
              : isPrintMode.orientation === "landscape"
                ? "297mm"
                : "210mm";
          const paperHeight =
            isPrintMode.paperSize === "A5"
              ? isPrintMode.orientation === "landscape"
                ? "148mm"
                : "210mm"
              : isPrintMode.orientation === "landscape"
                ? "210mm"
                : "297mm";

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto">
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                className={`bg-white dark:bg-slate-900 border dark:border-slate-800 shadow-2xl flex flex-col text-right transition-all duration-200 ${
                  printPreviewFullscreen
                    ? "fixed inset-0 w-full h-full max-w-none max-h-none rounded-none p-3 sm:p-5 z-50 overflow-hidden"
                    : "rounded-2xl max-w-5xl w-full p-4 sm:p-6 max-h-[94vh]"
                }`}
                dir="rtl"
              >
                {/* UI controls that are hidden on print */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b dark:border-slate-800 pb-3 print:hidden shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-lg">
                      <Printer size={18} />
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-gray-800 dark:text-white">
                        پیش‌نمایش چاپ فوق‌العاده با کیفیت (فرمت {isPrintMode.paperSize || "A4"})
                      </h3>
                      <p className="text-[10px] sm:text-xs text-slate-400">
                        نمایش بدون برش و با سربرگ اصلی شرکت متناسب با استانداردهای چاپ
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-none">
                    {/* Zoom in/out controls */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border dark:border-slate-700 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPrintPreviewZoom((prev) => Math.max(30, prev - 10))}
                        className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 rounded transition-colors cursor-pointer"
                        title="کوچک‌نمایی (-)"
                      >
                        <ZoomOut size={14} />
                      </button>
                      <div className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 px-1 min-w-[38px] text-center">
                        {printPreviewZoom}%
                      </div>
                      <button
                        type="button"
                        onClick={() => setPrintPreviewZoom((prev) => Math.min(180, prev + 10))}
                        className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 rounded transition-colors cursor-pointer"
                        title="بزرگ‌نمایی (+)"
                      >
                        <ZoomIn size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintPreviewZoom(getAutoFitZoom())}
                        className="px-2 py-0.5 text-[10px] font-bold bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 rounded shadow-2xs cursor-pointer whitespace-nowrap"
                        title="مشاهده متناسب با عرض صفحه"
                      >
                        متناسب با صفحه
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrintPreviewZoom(100)}
                        className="px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 rounded cursor-pointer whitespace-nowrap hidden sm:inline"
                        title="اندازه ۱۰۰٪"
                      >
                        ۱۰۰٪
                      </button>
                    </div>

                    {/* Fullscreen Toggle */}
                    <button
                      type="button"
                      onClick={() => setPrintPreviewFullscreen(!printPreviewFullscreen)}
                      className="p-2 text-slate-700 hover:text-slate-900 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer shrink-0"
                      title={printPreviewFullscreen ? "خروج از حالت تمام صفحه" : "تمام صفحه"}
                    >
                      {printPreviewFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>

                    <button
                      onClick={() => {
                        const printElem = document.getElementById("print-content-section");
                        if (printElem) {
                          executeCrossPlatformPrint(printElem, {
                            title: `نامه اداری ${isPrintMode.letterNumber || ''}`,
                            orientation: isPrintMode.orientation === "landscape" ? "landscape" : "portrait",
                            fileName: `Letter_${String(isPrintMode.letterNumber || isPrintMode.id).replace(/[\/\\]/g, '_')}.pdf`
                          });
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm hover:shadow transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
                    >
                      <Printer size={15} /> چاپ مرورگر
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickPdfDownload(isPrintMode, false)}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-sm hover:shadow transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
                      title="دانلود و چاپ مستقیم فایل PDF با سربرگ برداری با کیفیت فوق‌العاده ۳۰۰ DPI"
                    >
                      <FileText size={15} /> PDF سربرگ (۳۰۰ DPI)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickDocxDownload(isPrintMode, false)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-sm hover:shadow transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
                      title="دانلود فایل رسمی Word بر اساس قالب سربرگ ورد"
                    >
                      <FileText size={15} /> Word (.docx)
                    </button>

                    <button
                      onClick={() => handleShareSecretariatLetterToChat(isPrintMode)}
                      disabled={isSharingLetter}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-sm hover:shadow transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
                      title="ارسال مستقیم تصویر و برگه نامه به گفتگوی سازمانی"
                    >
                      {isSharingLetter ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <MessageSquare size={15} />
                      )}
                      ارسال به گفتگو
                    </button>

                    <button
                      onClick={() => setIsPrintMode(null)}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
                    >
                      بستن
                    </button>
                  </div>
                </div>

                {/* SCROLLABLE PREVIEW VIEWPORT (PREVENTS CUTOFFS) */}
                <div className="flex-1 overflow-auto p-1 sm:p-4 bg-slate-100 dark:bg-slate-950/80 rounded-xl flex justify-center items-start custom-scrollbar min-h-0 touch-pan-x touch-pan-y">
                  <div
                    style={{
                      width: printPreviewZoom !== 100 ? `${Math.round((isPrintMode.paperSize === "A5" ? (isPrintMode.orientation === "landscape" ? 794 : 559) : (isPrintMode.orientation === "landscape" ? 1123 : 794)) * (printPreviewZoom / 100))}px` : undefined,
                      height: printPreviewZoom !== 100 ? `${Math.round((isPrintMode.paperSize === "A5" ? (isPrintMode.orientation === "landscape" ? 559 : 794) : (isPrintMode.orientation === "landscape" ? 794 : 1123)) * (printPreviewZoom / 100)) + 30}px` : undefined,
                      transform: `scale(${printPreviewZoom / 100})`,
                      transformOrigin: "top center",
                      transition: "transform 0.15s ease-out",
                    }}
                    className="flex justify-center shrink-0"
                  >
                    {/* PRINTABLE AREA (100% Unified with Editor & PDF) */}
                    <div
                      id="print-content-section"
                      className="secretariat-a4-paper bg-white text-black shadow-lg relative rounded-sm border border-slate-200 shrink-0"
                      style={{
                        width: paperWidth,
                        minHeight: paperHeight,
                        paddingTop: `${printSettings.marginTop ?? 40}mm`,
                        paddingBottom: `${printSettings.marginBottom ?? 25}mm`,
                        paddingRight: `${printSettings.marginRight ?? 20}mm`,
                        paddingLeft: `${printSettings.marginLeft ?? 20}mm`,
                        fontFamily:
                          printSettings.letterheadFontFamily ||
                          "'Vazirmatn', sans-serif",
                        overflow: "hidden",
                        boxSizing: "border-box",
                      }}
                      dir="rtl"
                    >
                      {/* Custom Image Letterhead Background */}
                      {getEffectiveLetterheadDisplayUrl(printSettings) && (
                        <img
                          src={getEffectiveLetterheadDisplayUrl(printSettings)}
                          alt="سربرگ رسمی"
                          crossOrigin="anonymous"
                          style={{
                            printColorAdjust: "exact",
                            WebkitPrintColorAdjust: "exact",
                          }}
                          className="absolute inset-0 w-full h-full object-fill opacity-100 z-0 pointer-events-none select-none"
                        />
                      )}

                      {/* Top-left metadata block (شماره / تاریخ / پیوست) at exact mm coordinates */}
                      <div
                        style={{
                          position: "absolute",
                          top: `${printSettings.metadataTop ?? 25}mm`,
                          left: `${printSettings.metadataLeft ?? 20}mm`,
                          fontSize: `${printSettings.metadataFontSize ?? 11}px`,
                          color: printSettings.metadataColor || "#0f172a",
                          lineHeight: "1.8",
                          fontWeight: printSettings.metadataFontWeight || "bold",
                          opacity: (printSettings.metadataOpacity ?? 100) / 100,
                          fontFamily:
                            printSettings.letterheadFontFamily || "inherit",
                          textAlign: "right",
                          direction: "rtl",
                          zIndex: 50,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div>
                          شماره:{" "}
                          <span
                            style={{ direction: "ltr", display: "inline-block" }}
                          >
                            {toPersianDigits(isPrintMode.letterNumber)}
                          </span>
                        </div>
                        <div>
                          تاریخ:{" "}
                          <span
                            style={{ direction: "ltr", display: "inline-block" }}
                          >
                            {toPersianDigits(isPrintMode.date)}
                          </span>
                        </div>
                        <div>
                          پیوست:{" "}
                          {isPrintMode.hasAttachment ||
                          isPrintMode.attachments?.length > 0
                            ? "دارد"
                            : "ندارد"}
                        </div>
                      </div>

                      {/* Letter Body Context (1:1 coordinate match with Editor .ql-editor) */}
                      <div className="text-sm leading-loose text-slate-900 relative z-10">
                        <div
                          className="ql-editor leading-loose font-medium text-slate-900 text-[14px]"
                          dangerouslySetInnerHTML={{
                            __html: preserveLetterHtmlSpaces(
                              isPrintMode.content || "",
                            ),
                          }}
                        />

                        {/* Signatures & Stamp block (only when signers/approvedBy/addCompanyStamp are used) */}
                        {((isPrintMode.signers &&
                          isPrintMode.signers.length > 0) ||
                          (isPrintMode.approvedBy &&
                            isPrintMode.approvedBy.length > 0) ||
                          (isPrintMode.addCompanyStamp &&
                            printSettings.companyStampUrl)) && (
                          <div
                            className={`mt-8 w-64 text-center space-y-2 break-inside-avoid ${
                              isPrintMode.signaturePosition === "bottom_left"
                                ? "mr-auto ml-0"
                                : isPrintMode.signaturePosition ===
                                    "bottom_center"
                                  ? "mx-auto"
                                  : "ml-auto mr-0"
                            }`}
                          >
                            {isPrintMode.signers &&
                              isPrintMode.signers.length > 0 && (
                                <div className="flex gap-4 justify-center flex-wrap mt-2">
                                  {isPrintMode.signers.map((signer, idx) => (
                                    <div
                                      key={idx}
                                      className="flex flex-col items-center"
                                    >
                                      <div className="font-bold text-sm">
                                        {signer.name}
                                      </div>
                                      <div className="text-xs text-gray-600 font-bold">
                                        {signer.title}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                            <div className="relative mt-2 flex justify-center items-center">
                              {isPrintMode.approvedBy &&
                                isPrintMode.approvedBy.length > 0 && (
                                  <div className="flex justify-center gap-2 relative z-10 w-full flex-wrap">
                                    {isPrintMode.approvedBy.map(
                                      (userId, idx) => {
                                        const sigUrl =
                                          isPrintMode.signatureImageUrls?.[idx];
                                        return sigUrl ? (
                                          <img
                                            key={idx}
                                            src={sigUrl}
                                            className="h-16 object-contain mix-blend-multiply"
                                          />
                                        ) : null;
                                      },
                                    )}
                                  </div>
                                )}
                              {isPrintMode.addCompanyStamp &&
                                printSettings.companyStampUrl && (
                                  <img
                                    src={printSettings.companyStampUrl}
                                    alt="مهر شرکت"
                                    className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-multiply z-0"
                                    style={{
                                      height: printSettings.companyStampSize
                                        ? `${printSettings.companyStampSize}px`
                                        : "120px",
                                      width: printSettings.companyStampSize
                                        ? `${printSettings.companyStampSize}px`
                                        : "120px",
                                      opacity: printSettings.companyStampOpacity
                                        ? printSettings.companyStampOpacity / 100
                                        : 0.7,
                                    }}
                                  />
                                )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer bar containing metadata of address/phone */}
                      {!printSettings.hideAutoFooter &&
                        !printSettings.letterheadUrl &&
                        (selectedCompany.address || selectedCompany.phone) && (
                      <div className="absolute bottom-6 left-8 right-8 text-[10px] text-slate-400 border-t pt-2 flex justify-between items-center flex-wrap gap-2 print:border-t">
                        <span>نشانی: {selectedCompany.address || "ثبت نشده"}</span>
                        <div className="flex gap-4">
                          <span>تلفن: {selectedCompany.phone || "ثبت نشده"}</span>
                          <span>کدپستی: {selectedCompany.postalCode || "-"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default SecretariatModule;
