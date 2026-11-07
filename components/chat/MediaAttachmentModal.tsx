import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    X, Send, Plus, Trash2, Edit3, Crop, RotateCw, Type, 
    Square, Circle, ArrowUpRight, Undo, Redo, RefreshCw, 
    Sliders, Check, Smile, FileText, Image as ImageIcon,
    File as FileIcon, Eye, ShieldAlert, Sparkles, AlertCircle,
    Maximize2, Minimize2, ZoomIn, ZoomOut
} from 'lucide-react';

export interface AttachmentItem {
    id: string;
    file: File;
    previewUrl: string;
    isImage: boolean;
    isPdf: boolean;
    caption: string;
    // Edited image data if modified
    editedBlob?: Blob;
    editedPreviewUrl?: string;
    rotation?: number; // 0, 90, 180, 270
    resizeScale?: number; // 0.25, 0.5, 0.75, 1.0
}

interface DrawingPath {
    tool: 'pen' | 'highlighter' | 'arrow' | 'rect' | 'circle' | 'blur';
    color: string;
    size: number;
    points: { x: number; y: number }[];
    text?: string;
}

interface TextOverlay {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
}

interface CropRect {
    x: number; // 0 to 1
    y: number; // 0 to 1
    w: number; // 0 to 1
    h: number; // 0 to 1
}

interface MediaAttachmentModalProps {
    isOpen: boolean;
    initialFiles: File[];
    targetName: string;
    onClose: () => void;
    onSend: (items: { file: File; caption: string }[]) => Promise<void> | void;
    replyingTo?: { id: string; sender: string; message?: string } | null;
    onCancelReply?: () => void;
    initialCaption?: string;
}

const COLOR_PALETTE = [
    '#ffffff', // White
    '#000000', // Black
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#a855f7', // Purple
    '#ec4899', // Pink
];

const EMOJI_LIST = [
    '👍', '❤️', '🔥', '👏', '😊', '😂', '🙏', '💯', 
    '✅', '✨', '🎉', '🌟', '🌹', '🤝', '👌', '📌',
    '😍', '🙌', '💼', '📊', '🚀', '⭐', '💡', '⚠️'
];

export const MediaAttachmentModal: React.FC<MediaAttachmentModalProps> = ({
    isOpen,
    initialFiles,
    targetName,
    onClose,
    onSend,
    replyingTo,
    onCancelReply,
    initialCaption
}) => {
    const [items, setItems] = useState<AttachmentItem[]>([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isSending, setIsSending] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    // Image Editing States for Active Image
    const [activeTool, setActiveTool] = useState<'none' | 'pen' | 'highlighter' | 'arrow' | 'rect' | 'circle' | 'blur' | 'text' | 'crop' | 'resize'>('none');
    const [drawColor, setDrawColor] = useState<string>('#ef4444');
    const [strokeSize, setStrokeSize] = useState<number>(4);
    const [drawingHistory, setDrawingHistory] = useState<Record<string, DrawingPath[]>>({});
    const [redoHistory, setRedoHistory] = useState<Record<string, DrawingPath[]>>({});
    const [textOverlays, setTextOverlays] = useState<Record<string, TextOverlay[]>>({});
    const [currentTextValue, setCurrentTextValue] = useState<string>('');
    const [isAddingText, setIsAddingText] = useState<boolean>(false);
    const [activeResizeScale, setActiveResizeScale] = useState<number>(1.0);

    // Interactive Crop States
    const [cropRect, setCropRect] = useState<CropRect>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    const [cropAspect, setCropAspect] = useState<number | null>(null); // null = free, 1 = 1:1, etc.
    const [cropUndoHistory, setCropUndoHistory] = useState<Record<string, Array<{ file: File; previewUrl: string; editedBlob?: Blob }>>>({});

    // Canvas references
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
    const isDrawingRef = useRef(false);
    const currentPathRef = useRef<DrawingPath | null>(null);
    const fileInputAdditionalRef = useRef<HTMLInputElement | null>(null);
    const captionInputRef = useRef<HTMLInputElement | null>(null);

    // Initialize items from initialFiles
    useEffect(() => {
        if (!isOpen || !initialFiles || initialFiles.length === 0) {
            setItems([]);
            setActiveIndex(0);
            return;
        }

        const newItems: AttachmentItem[] = initialFiles.map((file, idx) => {
            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name);
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            const previewUrl = URL.createObjectURL(file);

            return {
                id: Math.random().toString(36).substring(2, 9),
                file,
                previewUrl,
                isImage,
                isPdf,
                caption: idx === 0 && initialCaption ? initialCaption : '',
                rotation: 0,
                resizeScale: 1.0
            };
        });

        setItems(newItems);
        setActiveIndex(0);
        setActiveTool('none');
        setCropRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
        setCropAspect(null);
        setDrawingHistory({});
        setRedoHistory({});
        setTextOverlays({});
        setCropUndoHistory({});

        // Auto focus caption
        setTimeout(() => {
            captionInputRef.current?.focus();
        }, 150);

        return () => {
            newItems.forEach(item => {
                if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                if (item.editedPreviewUrl) URL.revokeObjectURL(item.editedPreviewUrl);
            });
        };
    }, [isOpen, initialFiles, initialCaption]);

    const activeItem = items[activeIndex] || null;

    // Handle Adding More Files
    const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const addedFiles = e.target.files;
        if (!addedFiles || addedFiles.length === 0) return;

        const newItems: AttachmentItem[] = Array.from(addedFiles).map((file) => {
            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name);
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            const previewUrl = URL.createObjectURL(file);

            return {
                id: Math.random().toString(36).substring(2, 9),
                file,
                previewUrl,
                isImage,
                isPdf,
                caption: '',
                rotation: 0,
                resizeScale: 1.0
            };
        });

        setItems(prev => [...prev, ...newItems]);
        if (fileInputAdditionalRef.current) fileInputAdditionalRef.current.value = '';
    };

    const handleRemoveItem = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (items.length <= 1) {
            onClose();
            return;
        }

        const removed = items[index];
        if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        if (removed.editedPreviewUrl) URL.revokeObjectURL(removed.editedPreviewUrl);

        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
        if (activeIndex >= newItems.length) {
            setActiveIndex(newItems.length - 1);
        }
    };

    const handleCaptionChange = (val: string) => {
        if (!activeItem) return;
        setItems(prev => prev.map((it, idx) => idx === activeIndex ? { ...it, caption: val } : it));
    };

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // --- Image Editing & Canvas Logic ---
    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !activeItem || !activeItem.isImage) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = activeItem.previewUrl;

        img.onload = () => {
            const rotation = activeItem.rotation || 0;
            const isRotated90or270 = rotation === 90 || rotation === 270;
            
            const origW = img.naturalWidth || img.width;
            const origH = img.naturalHeight || img.height;
            
            const displayW = isRotated90or270 ? origH : origW;
            const displayH = isRotated90or270 ? origW : origH;

            canvas.width = displayW;
            canvas.height = displayH;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();

            // Handle Rotation
            if (rotation !== 0) {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.drawImage(img, -origW / 2, -origH / 2, origW, origH);
            } else {
                ctx.drawImage(img, 0, 0, origW, origH);
            }
            ctx.restore();

            // Draw Paths
            const paths = drawingHistory[activeItem.id] || [];
            paths.forEach(p => {
                ctx.save();
                if (p.tool === 'highlighter') {
                    ctx.globalAlpha = 0.35;
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = p.size * 3.5;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                } else if (p.tool === 'blur') {
                    // Pixelate / blur effect placeholder drawing
                    ctx.fillStyle = 'rgba(120, 120, 120, 0.85)';
                } else {
                    ctx.globalAlpha = 1.0;
                    ctx.strokeStyle = p.color;
                    ctx.fillStyle = p.color;
                    ctx.lineWidth = p.size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                }

                if (p.tool === 'pen' || p.tool === 'highlighter') {
                    if (p.points.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(p.points[0].x, p.points[0].y);
                        for (let i = 1; i < p.points.length; i++) {
                            ctx.lineTo(p.points[i].x, p.points[i].y);
                        }
                        ctx.stroke();
                    } else if (p.points.length === 1) {
                        ctx.beginPath();
                        ctx.arc(p.points[0].x, p.points[0].y, p.size / 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (p.tool === 'rect') {
                    if (p.points.length >= 2) {
                        const start = p.points[0];
                        const end = p.points[p.points.length - 1];
                        ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
                    }
                } else if (p.tool === 'circle') {
                    if (p.points.length >= 2) {
                        const start = p.points[0];
                        const end = p.points[p.points.length - 1];
                        const radiusX = Math.abs(end.x - start.x) / 2;
                        const radiusY = Math.abs(end.y - start.y) / 2;
                        const centerX = Math.min(start.x, end.x) + radiusX;
                        const centerY = Math.min(start.y, end.y) + radiusY;
                        ctx.beginPath();
                        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                } else if (p.tool === 'arrow') {
                    if (p.points.length >= 2) {
                        const from = p.points[0];
                        const to = p.points[p.points.length - 1];
                        const headlen = Math.max(16, p.size * 3.5);
                        const dx = to.x - from.x;
                        const dy = to.y - from.y;
                        const angle = Math.atan2(dy, dx);

                        ctx.beginPath();
                        ctx.moveTo(from.x, from.y);
                        ctx.lineTo(to.x, to.y);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(to.x, to.y);
                        ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
                        ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
                        ctx.closePath();
                        ctx.fill();
                    }
                } else if (p.tool === 'blur') {
                    if (p.points.length >= 2) {
                        const start = p.points[0];
                        const end = p.points[p.points.length - 1];
                        ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
                    }
                }
                ctx.restore();
            });

            // Draw Texts
            const texts = textOverlays[activeItem.id] || [];
            texts.forEach(t => {
                ctx.save();
                ctx.font = `bold ${t.fontSize || 28}px Vazirmatn, Tahoma, sans-serif`;
                ctx.fillStyle = t.color || '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,0.8)';
                ctx.shadowBlur = 6;
                ctx.fillText(t.text, t.x, t.y);
                ctx.restore();
            });
        };
    }, [activeItem, drawingHistory, textOverlays]);

    useEffect(() => {
        if (activeItem && activeItem.isImage) {
            redrawCanvas();
        }
    }, [activeItem, redrawCanvas]);

    // Canvas Mouse / Touch Coordinates Converter
    const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (activeTool === 'none' || activeTool === 'crop' || activeTool === 'resize') return;
        
        const pt = getCanvasPoint(e);
        if (!pt || !activeItem) return;

        if (activeTool === 'text') {
            setIsAddingText(true);
            return;
        }

        isDrawingRef.current = true;
        currentPathRef.current = {
            tool: activeTool,
            color: drawColor,
            size: strokeSize,
            points: [pt]
        };
    };

    const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current || !currentPathRef.current || !activeItem) return;
        const pt = getCanvasPoint(e);
        if (!pt) return;

        if (currentPathRef.current.tool === 'pen' || currentPathRef.current.tool === 'highlighter') {
            currentPathRef.current.points.push(pt);
        } else {
            // For shape tools: start point & current point
            if (currentPathRef.current.points.length === 1) {
                currentPathRef.current.points.push(pt);
            } else {
                currentPathRef.current.points[currentPathRef.current.points.length - 1] = pt;
            }
        }

        // Fast redraw with current active path
        setDrawingHistory(prev => {
            const currentList = prev[activeItem.id] || [];
            return {
                ...prev,
                [activeItem.id]: [...currentList.filter(p => p !== currentPathRef.current), currentPathRef.current!]
            };
        });
    };

    const handlePointerUp = () => {
        if (!isDrawingRef.current || !currentPathRef.current || !activeItem) return;
        isDrawingRef.current = false;
        
        // Finalize path
        setDrawingHistory(prev => {
            const currentList = prev[activeItem.id] || [];
            const exists = currentList.some(p => p === currentPathRef.current);
            if (!exists && currentPathRef.current) {
                return { ...prev, [activeItem.id]: [...currentList, currentPathRef.current] };
            }
            return prev;
        });

        // Reset redo
        setRedoHistory(prev => ({ ...prev, [activeItem.id]: [] }));
        currentPathRef.current = null;
    };

    // Interactive Crop Drag and Resize Logic
    const handleCropStart = (e: React.PointerEvent, handleType: string) => {
        e.preventDefault();
        e.stopPropagation();

        const wrapper = canvasWrapperRef.current;
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const initialCrop = { ...cropRect };
        const canvasW = canvasRef.current?.width || 1000;
        const canvasH = canvasRef.current?.height || 1000;

        const handlePointerMove = (moveEv: PointerEvent) => {
            moveEv.preventDefault();
            const deltaPxX = moveEv.clientX - startX;
            const deltaPxY = moveEv.clientY - startY;
            const dx = deltaPxX / rect.width;
            const dy = deltaPxY / rect.height;

            let next = { ...initialCrop };

            if (handleType === 'move') {
                next.x = Math.max(0, Math.min(1 - next.w, initialCrop.x + dx));
                next.y = Math.max(0, Math.min(1 - next.h, initialCrop.y + dy));
            } else {
                let x1 = initialCrop.x;
                let y1 = initialCrop.y;
                let x2 = initialCrop.x + initialCrop.w;
                let y2 = initialCrop.y + initialCrop.h;

                const minW = 0.05;
                const minH = 0.05;

                if (handleType.includes('w')) {
                    x1 = Math.max(0, Math.min(x2 - minW, initialCrop.x + dx));
                }
                if (handleType.includes('e')) {
                    x2 = Math.min(1, Math.max(x1 + minW, (initialCrop.x + initialCrop.w) + dx));
                }
                if (handleType.includes('n')) {
                    y1 = Math.max(0, Math.min(y2 - minH, initialCrop.y + dy));
                }
                if (handleType.includes('s')) {
                    y2 = Math.min(1, Math.max(y1 + minH, (initialCrop.y + initialCrop.h) + dy));
                }

                if (cropAspect) {
                    const pixelW = (x2 - x1) * canvasW;
                    const pixelH = (y2 - y1) * canvasH;
                    if (handleType.includes('w') || handleType.includes('e')) {
                        const targetPixelH = pixelW / cropAspect;
                        const targetNormH = targetPixelH / canvasH;
                        if (handleType.includes('n')) {
                            y1 = Math.max(0, y2 - targetNormH);
                        } else {
                            y2 = Math.min(1, y1 + targetNormH);
                        }
                    } else {
                        const targetPixelW = pixelH * cropAspect;
                        const targetNormW = targetPixelW / canvasW;
                        if (handleType.includes('w')) {
                            x1 = Math.max(0, x2 - targetNormW);
                        } else {
                            x2 = Math.min(1, x1 + targetNormW);
                        }
                    }
                }

                next = {
                    x: Math.max(0, x1),
                    y: Math.max(0, y1),
                    w: Math.max(minW, Math.min(1 - x1, x2 - x1)),
                    h: Math.max(minH, Math.min(1 - y1, y2 - y1))
                };
            }

            setCropRect(next);
        };

        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    };

    const setPresetAspect = (ratio: number | null) => {
        setCropAspect(ratio);
        if (!ratio || !canvasRef.current) return;

        const canvasW = canvasRef.current.width || 800;
        const canvasH = canvasRef.current.height || 600;
        const canvasRatio = canvasW / canvasH;

        let newW = 0.8;
        let newH = 0.8;

        if (ratio > canvasRatio) {
            newW = 0.85;
            newH = (newW * canvasW) / (ratio * canvasH);
        } else {
            newH = 0.85;
            newW = (newH * ratio * canvasH) / canvasW;
        }

        newW = Math.min(0.96, Math.max(0.1, newW));
        newH = Math.min(0.96, Math.max(0.1, newH));

        const newX = Math.max(0, (1 - newW) / 2);
        const newY = Math.max(0, (1 - newH) / 2);

        setCropRect({ x: newX, y: newY, w: newW, h: newH });
    };

    const handleApplyCrop = () => {
        const canvas = canvasRef.current;
        if (!canvas || !activeItem) return;

        const sx = Math.max(0, Math.round(cropRect.x * canvas.width));
        const sy = Math.max(0, Math.round(cropRect.y * canvas.height));
        const sw = Math.min(canvas.width - sx, Math.round(cropRect.w * canvas.width));
        const sh = Math.min(canvas.height - sy, Math.round(cropRect.h * canvas.height));

        if (sw < 10 || sh < 10) return;

        // Save for undo
        setCropUndoHistory(prev => ({
            ...prev,
            [activeItem.id]: [...(prev[activeItem.id] || []), {
                file: activeItem.file,
                previewUrl: activeItem.previewUrl,
                editedBlob: activeItem.editedBlob
            }]
        }));

        const offscreen = document.createElement('canvas');
        offscreen.width = sw;
        offscreen.height = sh;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        offscreen.toBlob((blob) => {
            if (!blob) return;

            const newUrl = URL.createObjectURL(blob);
            const ext = activeItem.file.name.includes('.') ? activeItem.file.name.split('.').pop() : 'jpg';
            const baseName = activeItem.file.name.replace(/\.[^/.]+$/, "");
            const newName = `${baseName}_crop.${ext === 'png' ? 'png' : 'jpg'}`;
            const newFile = new File([blob], newName, { type: blob.type || 'image/jpeg' });

            setItems(prev => prev.map((it, idx) => {
                if (idx !== activeIndex) return it;
                return {
                    ...it,
                    file: newFile,
                    previewUrl: newUrl,
                    editedPreviewUrl: newUrl,
                    editedBlob: blob,
                    rotation: 0
                };
            }));

            // Reset drawing paths as they have been baked into the cropped image
            setDrawingHistory(prev => ({ ...prev, [activeItem.id]: [] }));
            setRedoHistory(prev => ({ ...prev, [activeItem.id]: [] }));
            setTextOverlays(prev => ({ ...prev, [activeItem.id]: [] }));

            setActiveTool('none');
            setCropAspect(null);
            setCropRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
        }, activeItem.file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.95);
    };

    // Undo action
    const handleUndo = () => {
        if (!activeItem) return;
        const list = drawingHistory[activeItem.id] || [];
        if (list.length > 0) {
            const last = list[list.length - 1];
            const remaining = list.slice(0, list.length - 1);

            setDrawingHistory(prev => ({ ...prev, [activeItem.id]: remaining }));
            setRedoHistory(prev => ({ ...prev, [activeItem.id]: [...(prev[activeItem.id] || []), last] }));
            return;
        }

        // Revert crop if available
        const cropList = cropUndoHistory[activeItem.id] || [];
        if (cropList.length > 0) {
            const prevCrop = cropList[cropList.length - 1];
            const remainingCrop = cropList.slice(0, cropList.length - 1);
            setCropUndoHistory(prev => ({ ...prev, [activeItem.id]: remainingCrop }));

            setItems(prev => prev.map((it, idx) => {
                if (idx !== activeIndex) return it;
                return {
                    ...it,
                    file: prevCrop.file,
                    previewUrl: prevCrop.previewUrl,
                    editedPreviewUrl: prevCrop.previewUrl,
                    editedBlob: prevCrop.editedBlob,
                    rotation: 0
                };
            }));
        }
    };

    // Redo action
    const handleRedo = () => {
        if (!activeItem) return;
        const redoList = redoHistory[activeItem.id] || [];
        if (redoList.length === 0) return;

        const next = redoList[redoList.length - 1];
        const remainingRedo = redoList.slice(0, redoList.length - 1);

        setDrawingHistory(prev => ({ ...prev, [activeItem.id]: [...(prev[activeItem.id] || []), next] }));
        setRedoHistory(prev => ({ ...prev, [activeItem.id]: remainingRedo }));
    };

    // Rotate active image
    const handleRotate = () => {
        if (!activeItem || !activeItem.isImage) return;
        const nextRotation = (((activeItem.rotation || 0) + 90) % 360);
        setItems(prev => prev.map((it, idx) => idx === activeIndex ? { ...it, rotation: nextRotation } : it));
    };

    // Add Text Overlay
    const handleConfirmText = () => {
        if (!currentTextValue.trim() || !activeItem) {
            setIsAddingText(false);
            return;
        }

        const canvas = canvasRef.current;
        const centerX = canvas ? canvas.width / 2 - 80 : 100;
        const centerY = canvas ? canvas.height / 2 : 100;

        const newText: TextOverlay = {
            id: Math.random().toString(36).substring(2, 9),
            text: currentTextValue.trim(),
            x: Math.max(30, centerX),
            y: Math.max(50, centerY),
            color: drawColor,
            fontSize: 32
        };

        setTextOverlays(prev => ({
            ...prev,
            [activeItem.id]: [...(prev[activeItem.id] || []), newText]
        }));

        setCurrentTextValue('');
        setIsAddingText(false);
        setActiveTool('none');
    };

    // Export Canvas / Image to File for Sending
    const processItemForSending = async (item: AttachmentItem): Promise<{ file: File; caption: string }> => {
        if (!item.isImage) {
            return { file: item.file, caption: item.caption };
        }

        const hasDrawings = (drawingHistory[item.id] && drawingHistory[item.id].length > 0);
        const hasTexts = (textOverlays[item.id] && textOverlays[item.id].length > 0);
        const isRotated = (item.rotation && item.rotation !== 0);
        const isRescaled = (item.resizeScale && item.resizeScale < 1.0);

        // If no modifications, send original file
        if (!hasDrawings && !hasTexts && !isRotated && !isRescaled) {
            return { file: item.file, caption: item.caption };
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = item.previewUrl;

            img.onload = () => {
                const offscreen = document.createElement('canvas');
                const rotation = item.rotation || 0;
                const isRotated90or270 = rotation === 90 || rotation === 270;
                
                const origW = img.naturalWidth || img.width;
                const origH = img.naturalHeight || img.height;
                
                let targetW = isRotated90or270 ? origH : origW;
                let targetH = isRotated90or270 ? origW : origH;

                const scale = item.resizeScale || 1.0;
                targetW = Math.round(targetW * scale);
                targetH = Math.round(targetH * scale);

                offscreen.width = targetW;
                offscreen.height = targetH;

                const ctx = offscreen.getContext('2d');
                if (!ctx) {
                    resolve({ file: item.file, caption: item.caption });
                    return;
                }

                ctx.save();
                ctx.scale(scale, scale);

                // Rotation handling
                const unscaledW = isRotated90or270 ? origH : origW;
                const unscaledH = isRotated90or270 ? origW : origH;

                if (rotation !== 0) {
                    ctx.translate(unscaledW / 2, unscaledH / 2);
                    ctx.rotate((rotation * Math.PI) / 180);
                    ctx.drawImage(img, -origW / 2, -origH / 2, origW, origH);
                } else {
                    ctx.drawImage(img, 0, 0, origW, origH);
                }
                ctx.restore();

                // Re-render drawings on export canvas
                ctx.save();
                ctx.scale(scale, scale);
                const paths = drawingHistory[item.id] || [];
                paths.forEach(p => {
                    ctx.save();
                    if (p.tool === 'highlighter') {
                        ctx.globalAlpha = 0.35;
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = p.size * 3.5;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                    } else if (p.tool === 'blur') {
                        ctx.fillStyle = 'rgba(120, 120, 120, 0.85)';
                    } else {
                        ctx.globalAlpha = 1.0;
                        ctx.strokeStyle = p.color;
                        ctx.fillStyle = p.color;
                        ctx.lineWidth = p.size;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                    }

                    if (p.tool === 'pen' || p.tool === 'highlighter') {
                        if (p.points.length > 1) {
                            ctx.beginPath();
                            ctx.moveTo(p.points[0].x, p.points[0].y);
                            for (let i = 1; i < p.points.length; i++) {
                                ctx.lineTo(p.points[i].x, p.points[i].y);
                            }
                            ctx.stroke();
                        } else if (p.points.length === 1) {
                            ctx.beginPath();
                            ctx.arc(p.points[0].x, p.points[0].y, p.size / 2, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    } else if (p.tool === 'rect') {
                        if (p.points.length >= 2) {
                            const start = p.points[0];
                            const end = p.points[p.points.length - 1];
                            ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
                        }
                    } else if (p.tool === 'circle') {
                        if (p.points.length >= 2) {
                            const start = p.points[0];
                            const end = p.points[p.points.length - 1];
                            const radiusX = Math.abs(end.x - start.x) / 2;
                            const radiusY = Math.abs(end.y - start.y) / 2;
                            const centerX = Math.min(start.x, end.x) + radiusX;
                            const centerY = Math.min(start.y, end.y) + radiusY;
                            ctx.beginPath();
                            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                    } else if (p.tool === 'arrow') {
                        if (p.points.length >= 2) {
                            const from = p.points[0];
                            const to = p.points[p.points.length - 1];
                            const headlen = Math.max(16, p.size * 3.5);
                            const dx = to.x - from.x;
                            const dy = to.y - from.y;
                            const angle = Math.atan2(dy, dx);

                            ctx.beginPath();
                            ctx.moveTo(from.x, from.y);
                            ctx.lineTo(to.x, to.y);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(to.x, to.y);
                            ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
                            ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
                            ctx.closePath();
                            ctx.fill();
                        }
                    } else if (p.tool === 'blur') {
                        if (p.points.length >= 2) {
                            const start = p.points[0];
                            const end = p.points[p.points.length - 1];
                            ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
                        }
                    }
                    ctx.restore();
                });

                // Texts
                const texts = textOverlays[item.id] || [];
                texts.forEach(t => {
                    ctx.save();
                    ctx.font = `bold ${t.fontSize || 28}px Vazirmatn, Tahoma, sans-serif`;
                    ctx.fillStyle = t.color || '#ffffff';
                    ctx.shadowColor = 'rgba(0,0,0,0.8)';
                    ctx.shadowBlur = 6;
                    ctx.fillText(t.text, t.x, t.y);
                    ctx.restore();
                });

                ctx.restore();

                // Convert to WebP / JPEG Blob
                offscreen.toBlob((blob) => {
                    if (!blob) {
                        resolve({ file: item.file, caption: item.caption });
                        return;
                    }
                    const ext = item.file.name.includes('.') ? item.file.name.split('.').pop() : 'jpg';
                    const newFileName = item.file.name.replace(/\.[^/.]+$/, "") + `_edited.${ext === 'png' ? 'png' : 'jpg'}`;
                    const processedFile = new File([blob], newFileName, { type: blob.type || 'image/jpeg' });
                    resolve({ file: processedFile, caption: item.caption });
                }, item.file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
            };

            img.onerror = () => {
                resolve({ file: item.file, caption: item.caption });
            };
        });
    };

    // Handle Send Action
    const handleSendAll = async () => {
        if (items.length === 0 || isSending) return;
        setIsSending(true);

        try {
            const processedItems = await Promise.all(items.map(item => processItemForSending(item)));
            // Close modal immediately so the user returns to the chat instantly
            onClose();
            // Start background upload & optimistic chat delivery
            Promise.resolve(onSend(processedItems)).catch(err => {
                console.error("Error in onSend handler:", err);
            });
        } catch (error) {
            console.error("Error sending attachments:", error);
            alert("خطا در پردازش فایل‌ها");
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen || items.length === 0) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md text-white select-none overflow-hidden animate-fade-in" dir="rtl">
            {/* Top Toolbar (WhatsApp Web Style) */}
            <div className="absolute top-0 left-0 right-0 h-14 bg-zinc-950/80 border-b border-white/10 px-4 flex items-center justify-between z-20">
                {/* Close Button */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                        title="انصراف و بستن (Esc)"
                    >
                        <X size={22} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-sm font-black text-white flex items-center gap-2">
                            <span>پیش‌نمایش و ویرایش فایل</span>
                            <span className="text-[11px] font-normal text-zinc-400 bg-white/10 px-2 py-0.5 rounded-full">
                                {activeIndex + 1} از {items.length}
                            </span>
                        </span>
                        <span className="text-[11px] text-zinc-400 truncate max-w-xs sm:max-w-md">
                            ارسال به: <b className="text-emerald-400">{targetName || 'گفتگو'}</b>
                        </span>
                    </div>
                </div>

                {/* Top Center Tooling for Images (Pencil, Text, Rotate, Resize, Undo) */}
                {activeItem?.isImage && (
                    <div className="flex items-center gap-1 sm:gap-2 bg-zinc-900/90 border border-white/15 px-2 py-1 rounded-2xl shadow-lg">
                        {/* Drawing Tools Selector */}
                        <button
                            onClick={() => setActiveTool(activeTool === 'pen' ? 'none' : 'pen')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'pen' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="مداد و خط‌کشی روی عکس"
                        >
                            <Edit3 size={16} />
                            <span className="hidden md:inline">مداد</span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'highlighter' ? 'none' : 'highlighter')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'highlighter' ? 'bg-amber-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="ماژیک هایلایتر نیمه‌شفاف"
                        >
                            <Sparkles size={16} />
                            <span className="hidden md:inline">هایلایتر</span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'arrow' ? 'none' : 'arrow')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'arrow' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="فلش و اشاره‌گر"
                        >
                            <ArrowUpRight size={16} />
                            <span className="hidden lg:inline">پیکان</span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'rect' ? 'none' : 'rect')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'rect' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="کادر مستطیل"
                        >
                            <Square size={16} />
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'circle' ? 'none' : 'circle')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'circle' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="کادر دایره"
                        >
                            <Circle size={16} />
                        </button>

                        <button
                            onClick={() => {
                                setActiveTool('text');
                                setIsAddingText(true);
                            }}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'text' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="افزودن متن روی عکس"
                        >
                            <Type size={16} />
                            <span className="hidden md:inline">متن</span>
                        </button>

                        <div className="w-[1px] h-5 bg-white/20 mx-0.5" />

                        {/* Crop Tool */}
                        <button
                            onClick={() => {
                                if (activeTool === 'crop') {
                                    setActiveTool('none');
                                } else {
                                    setActiveTool('crop');
                                    setCropRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
                                    setCropAspect(null);
                                }
                            }}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'crop' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="برش و کراپ عکس با حرکت ماوس"
                        >
                            <Crop size={16} />
                            <span className="hidden md:inline">کراپ</span>
                        </button>

                        {/* Rotate Tool */}
                        <button
                            onClick={handleRotate}
                            className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="چرخش ۹۰ درجه"
                        >
                            <RotateCw size={16} />
                        </button>

                        {/* Resize / Scale Tool */}
                        <button
                            onClick={() => setActiveTool(activeTool === 'resize' ? 'none' : 'resize')}
                            className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                activeTool === 'resize' ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-white/10'
                            }`}
                            title="تغییر ابعاد و فشرده‌سازی تصویر"
                        >
                            <Sliders size={16} />
                            <span className="hidden lg:inline">ابعاد ({Math.round((activeItem.resizeScale || 1) * 100)}%)</span>
                        </button>

                        <div className="w-[1px] h-5 bg-white/20 mx-0.5" />

                        {/* Undo / Redo */}
                        <button
                            onClick={handleUndo}
                            disabled={
                                (!drawingHistory[activeItem.id] || drawingHistory[activeItem.id].length === 0) &&
                                (!cropUndoHistory[activeItem.id] || cropUndoHistory[activeItem.id].length === 0)
                            }
                            className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                            title="لغو آخرین تغییر (Undo)"
                        >
                            <Undo size={16} />
                        </button>

                        <button
                            onClick={handleRedo}
                            disabled={!redoHistory[activeItem.id] || redoHistory[activeItem.id].length === 0}
                            className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                            title="تکرار مجدد (Redo)"
                        >
                            <Redo size={16} />
                        </button>
                    </div>
                )}

                {/* Right Placeholder or Help Info */}
                <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
                    <span>{formatFileSize(activeItem?.file?.size || 0)}</span>
                </div>
            </div>

            {/* Sub-toolbar for Colors and Stroke Size when a drawing tool is active */}
            {activeItem?.isImage && activeTool !== 'none' && activeTool !== 'resize' && activeTool !== 'crop' && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-zinc-900/95 border border-white/20 px-3 py-1.5 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-slide-down">
                    {/* Color Circles */}
                    <div className="flex items-center gap-1.5">
                        {COLOR_PALETTE.map((c) => (
                            <button
                                key={c}
                                onClick={() => setDrawColor(c)}
                                style={{ backgroundColor: c }}
                                className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                                    drawColor === c ? 'scale-125 border-white ring-2 ring-emerald-400 shadow-md' : 'border-black/30 hover:scale-110'
                                }`}
                                title={c}
                            />
                        ))}
                    </div>

                    <div className="w-[1px] h-5 bg-white/20" />

                    {/* Stroke Size */}
                    <div className="flex items-center gap-1 text-xs">
                        <span className="text-[11px] text-zinc-400">ضخامت:</span>
                        {[2, 5, 9, 15].map((size) => (
                            <button
                                key={size}
                                onClick={() => setStrokeSize(size)}
                                className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                                    strokeSize === size ? 'bg-emerald-600 border-emerald-400 text-white font-black' : 'border-white/10 hover:bg-white/10 text-zinc-400'
                                }`}
                            >
                                <span style={{ width: size + 2, height: size + 2, backgroundColor: strokeSize === size ? '#fff' : '#aaa', borderRadius: '50%' }} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Sub-toolbar for Interactive Crop */}
            {activeItem?.isImage && activeTool === 'crop' && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 border border-white/20 p-2 sm:p-2.5 rounded-2xl shadow-2xl flex flex-wrap items-center justify-center gap-2 max-w-[95vw] animate-slide-down">
                    <div className="flex items-center gap-1 sm:gap-1.5 text-xs">
                        <span className="font-bold text-emerald-400 flex items-center gap-1 px-1">
                            <Crop size={14} /> نسبت:
                        </span>
                        {[
                            { label: 'آزاد', val: null },
                            { label: '۱:۱', val: 1 },
                            { label: '۴:۳', val: 4 / 3 },
                            { label: '۱۶:۹', val: 16 / 9 },
                            { label: '۳:۴', val: 3 / 4 },
                            { label: '۹:۱۶', val: 9 / 16 },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                onClick={() => setPresetAspect(opt.val)}
                                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    cropAspect === opt.val
                                        ? 'bg-emerald-600 text-white shadow-md'
                                        : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <div className="w-[1px] h-5 bg-white/20 hidden sm:block" />

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => {
                                setCropAspect(null);
                                setCropRect({ x: 0, y: 0, w: 1, h: 1 });
                            }}
                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-zinc-300 text-xs rounded-lg transition-colors cursor-pointer"
                            title="پوشش کل تصویر"
                        >
                            کل تصویر
                        </button>

                        <button
                            type="button"
                            onClick={handleApplyCrop}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-md hover:scale-105"
                        >
                            <Check size={14} /> تایید برش
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTool('none')}
                            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                            title="انصراف"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Sub-toolbar for Resize / Scaling */}
            {activeItem?.isImage && activeTool === 'resize' && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-zinc-900/95 border border-white/20 p-3 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center gap-3 animate-slide-down">
                    <span className="text-xs font-bold text-zinc-300">مقیاس ابعاد و فشرده‌سازی:</span>
                    <div className="flex items-center gap-2">
                        {[
                            { label: 'اصلی (۱۰۰٪)', scale: 1.0 },
                            { label: 'متوسط (۷۵٪)', scale: 0.75 },
                            { label: 'کوچک (۵۰٪)', scale: 0.5 },
                            { label: 'بسیار فشرده (۲۵٪)', scale: 0.25 },
                        ].map((opt) => (
                            <button
                                key={opt.scale}
                                onClick={() => {
                                    setItems(prev => prev.map((it, idx) => idx === activeIndex ? { ...it, resizeScale: opt.scale } : it));
                                }}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    (activeItem.resizeScale || 1.0) === opt.scale
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setActiveTool('none')}
                        className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors"
                    >
                        تایید ابعاد
                    </button>
                </div>
            )}

            {/* Modal for Typing Text to Put on Image */}
            {isAddingText && (
                <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 border border-white/20 p-3.5 rounded-2xl shadow-2xl flex items-center gap-2 min-w-[280px] animate-scale-in">
                    <input
                        type="text"
                        value={currentTextValue}
                        onChange={(e) => setCurrentTextValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleConfirmText()}
                        placeholder="متن مورد نظر را بنویسید..."
                        autoFocus
                        className="bg-black/50 border border-white/20 text-white text-sm rounded-xl px-3 py-1.5 flex-1 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                        onClick={handleConfirmText}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                    >
                        <Check size={14} /> درج
                    </button>
                    <button
                        onClick={() => { setIsAddingText(false); setActiveTool('none'); }}
                        className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Main Center Preview Viewport */}
            <div className="flex-1 w-full h-full pt-16 pb-28 flex items-center justify-center overflow-hidden p-2 sm:p-6 relative">
                {activeItem?.isImage ? (
                    <div className="relative max-w-full max-h-full flex items-center justify-center">
                        <div ref={canvasWrapperRef} className="relative inline-block select-none max-w-[85vw] max-h-[62vh]">
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handlePointerDown}
                                onMouseMove={handlePointerMove}
                                onMouseUp={handlePointerUp}
                                onMouseLeave={handlePointerUp}
                                onTouchStart={handlePointerDown}
                                onTouchMove={handlePointerMove}
                                onTouchEnd={handlePointerUp}
                                className={`block max-w-[85vw] max-h-[62vh] object-contain rounded-lg shadow-2xl transition-all ${
                                    activeTool !== 'none' && activeTool !== 'resize' && activeTool !== 'crop' ? 'cursor-crosshair' : 'cursor-default'
                                }`}
                                style={{
                                    touchAction: activeTool !== 'none' ? 'none' : 'auto'
                                }}
                            />

                            {/* Crop Box Overlay with Mouse & Touch Control */}
                            {activeItem?.isImage && activeTool === 'crop' && (
                                <div className="absolute inset-0 z-30 select-none overflow-hidden touch-none pointer-events-auto">
                                    {/* Shaded Masks Around the Crop Selection */}
                                    <div
                                        className="absolute top-0 left-0 right-0 bg-black/65 pointer-events-none transition-none"
                                        style={{ height: `${cropRect.y * 100}%` }}
                                    />
                                    <div
                                        className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none transition-none"
                                        style={{ top: `${(cropRect.y + cropRect.h) * 100}%` }}
                                    />
                                    <div
                                        className="absolute left-0 bg-black/65 pointer-events-none transition-none"
                                        style={{
                                            top: `${cropRect.y * 100}%`,
                                            width: `${cropRect.x * 100}%`,
                                            height: `${cropRect.h * 100}%`
                                        }}
                                    />
                                    <div
                                        className="absolute right-0 bg-black/65 pointer-events-none transition-none"
                                        style={{
                                            top: `${cropRect.y * 100}%`,
                                            left: `${(cropRect.x + cropRect.w) * 100}%`,
                                            height: `${cropRect.h * 100}%`
                                        }}
                                    />

                                    {/* Draggable & Resizable Crop Window */}
                                    <div
                                        className="absolute border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.8),inset_0_0_0_1px_rgba(0,0,0,0.4)] cursor-move select-none"
                                        style={{
                                            left: `${cropRect.x * 100}%`,
                                            top: `${cropRect.y * 100}%`,
                                            width: `${cropRect.w * 100}%`,
                                            height: `${cropRect.h * 100}%`
                                        }}
                                        onPointerDown={(e) => handleCropStart(e, 'move')}
                                    >
                                        {/* Rule of Thirds Grid (3x3) */}
                                        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-60">
                                            <div className="border-r border-b border-white/40" />
                                            <div className="border-r border-b border-white/40" />
                                            <div className="border-b border-white/40" />
                                            <div className="border-r border-b border-white/40" />
                                            <div className="border-r border-b border-white/40" />
                                            <div className="border-b border-white/40" />
                                            <div className="border-r border-white/40" />
                                            <div className="border-r border-white/40" />
                                            <div />
                                        </div>

                                        {/* 4 Corner Handles (Thick L-Brackets) */}
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'nw')}
                                            className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white cursor-nwse-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش از گوشه بالا-چپ"
                                        />
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'ne')}
                                            className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white cursor-nesw-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش از گوشه بالا-راست"
                                        />
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'sw')}
                                            className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white cursor-nesw-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش از گوشه پایین-چپ"
                                        />
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'se')}
                                            className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white cursor-nwse-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش از گوشه پایین-راست"
                                        />

                                        {/* 4 Edge Handles (Center Pills) */}
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'n')}
                                            className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-white rounded-full cursor-ns-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش لبه بالا"
                                        />
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 's')}
                                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-white rounded-full cursor-ns-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش لبه پایین"
                                        />
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'w')}
                                            className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-8 bg-white rounded-full cursor-ew-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش لبه چپ"
                                        />
                                        <div
                                            onPointerDown={(e) => handleCropStart(e, 'e')}
                                            className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-8 bg-white rounded-full cursor-ew-resize z-40 filter drop-shadow-md hover:scale-110 transition-transform"
                                            title="برش لبه راست"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeItem?.isPdf ? (
                    /* High Quality PDF File Preview Card */
                    <div className="bg-zinc-900/90 border border-rose-500/30 p-8 rounded-3xl max-w-md w-full text-center flex flex-col items-center gap-4 shadow-2xl backdrop-blur-md">
                        <div className="w-20 h-20 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center justify-center text-rose-500 shadow-inner">
                            <FileText size={42} />
                        </div>
                        <div className="space-y-1 w-full">
                            <h4 className="text-base font-black text-white truncate w-full" dir="ltr">
                                {activeItem.file.name}
                            </h4>
                            <div className="flex items-center justify-center gap-3 text-xs text-zinc-400">
                                <span className="bg-rose-500/20 text-rose-400 px-2.5 py-0.5 rounded-full font-bold">
                                    سند PDF
                                </span>
                                <span>حجم: {formatFileSize(activeItem.file.size)}</span>
                            </div>
                        </div>
                        <p className="text-xs text-zinc-400 bg-white/5 p-3 rounded-xl w-full">
                            این فایل پس از ارسال، مستقیماً در پنجره چت قابل مشاهده و پیش‌نمایش خواهد بود.
                        </p>
                    </div>
                ) : (
                    /* General Document File Card */
                    <div className="bg-zinc-900/90 border border-blue-500/30 p-8 rounded-3xl max-w-md w-full text-center flex flex-col items-center gap-4 shadow-2xl backdrop-blur-md">
                        <div className="w-20 h-20 bg-blue-500/20 border border-blue-500/40 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
                            <FileIcon size={42} />
                        </div>
                        <div className="space-y-1 w-full">
                            <h4 className="text-base font-black text-white truncate w-full" dir="ltr">
                                {activeItem?.file?.name || 'فایل ارسالی'}
                            </h4>
                            <div className="flex items-center justify-center gap-3 text-xs text-zinc-400">
                                <span className="bg-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-full font-bold">
                                    {activeItem?.file?.name?.split('.').pop()?.toUpperCase() || 'FILE'}
                                </span>
                                <span>حجم: {formatFileSize(activeItem?.file?.size || 0)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Floating Bar: Caption Input, Thumbnail Strip, Send Button */}
            <div className="absolute bottom-0 left-0 right-0 bg-zinc-950/90 border-t border-white/10 px-3 sm:px-6 py-3 flex flex-col gap-2.5 z-30">
                {/* Reply Context Preview Banner */}
                {replyingTo && (
                    <div className="flex items-center justify-between bg-zinc-900/95 border-r-4 border-emerald-500 rounded-2xl px-3.5 py-2 text-xs text-zinc-300 shadow-xl max-w-4xl mx-auto w-full">
                        <div className="flex items-center gap-2 truncate">
                            <span className="text-emerald-400 font-bold shrink-0">در حال پاسخ به {replyingTo.sender}:</span>
                            <span className="text-zinc-400 truncate max-w-xs sm:max-w-md">{replyingTo.message || 'فایل / پیوست'}</span>
                        </div>
                        {onCancelReply && (
                            <button
                                type="button"
                                onClick={onCancelReply}
                                className="p-1 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0 mr-2"
                                title="لغو پاسخ"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}

                {/* Caption Input Line (WhatsApp Web Style) */}
                <div className="flex items-center gap-2 max-w-4xl mx-auto w-full relative">
                    {/* Emoji Trigger */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                            title="افزودن ایموجی"
                        >
                            <Smile size={22} />
                        </button>

                        {showEmojiPicker && (
                            <div className="absolute bottom-12 right-0 z-50 bg-zinc-900 border border-white/20 p-2 rounded-2xl shadow-2xl grid grid-cols-6 gap-1.5 w-64 animate-scale-in">
                                {EMOJI_LIST.map((em) => (
                                    <button
                                        key={em}
                                        onClick={() => {
                                            handleCaptionChange((activeItem?.caption || '') + em);
                                            setShowEmojiPicker(false);
                                        }}
                                        className="text-xl p-1.5 hover:bg-white/10 rounded-xl transition-transform hover:scale-125"
                                    >
                                        {em}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Caption Input Field */}
                    <div className="flex-1 relative">
                        <input
                            ref={captionInputRef}
                            type="text"
                            value={activeItem?.caption || ''}
                            onChange={(e) => handleCaptionChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendAll();
                                }
                            }}
                            placeholder="افزودن توضیحات یا متن همراه فایل... (Enter برای ارسال)"
                            className="w-full bg-zinc-900/90 border border-white/15 focus:border-emerald-500 text-white text-sm rounded-2xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-zinc-500 shadow-inner"
                        />
                    </div>
                </div>

                {/* Bottom Gallery Strip and Send Button */}
                <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto w-full">
                    {/* Thumbnails Row */}
                    <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar flex-1">
                        {items.map((it, idx) => (
                            <div
                                key={it.id}
                                onClick={() => setActiveIndex(idx)}
                                className={`relative group w-12 h-12 rounded-xl overflow-hidden cursor-pointer border-2 transition-all shrink-0 flex items-center justify-center ${
                                    idx === activeIndex
                                        ? 'border-emerald-500 ring-2 ring-emerald-500/40 scale-105 shadow-md bg-zinc-800'
                                        : 'border-white/20 hover:border-white/40 bg-zinc-900 opacity-70 hover:opacity-100'
                                }`}
                            >
                                {it.isImage ? (
                                    <img src={it.previewUrl} alt="thumb" className="w-full h-full object-cover" />
                                ) : it.isPdf ? (
                                    <FileText size={20} className="text-rose-400" />
                                ) : (
                                    <FileIcon size={20} className="text-blue-400" />
                                )}

                                {/* Delete single item */}
                                {items.length > 1 && (
                                    <button
                                        onClick={(e) => handleRemoveItem(idx, e)}
                                        className="absolute -top-1 -right-1 p-0.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                                        title="حذف این مورد"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Add More Files Button (+) */}
                        <button
                            type="button"
                            onClick={() => fileInputAdditionalRef.current?.click()}
                            className="w-12 h-12 rounded-xl border border-dashed border-white/30 hover:border-emerald-500 bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors shrink-0 cursor-pointer"
                            title="افزودن فایل بیشتر"
                        >
                            <Plus size={20} />
                        </button>
                        <input
                            type="file"
                            ref={fileInputAdditionalRef}
                            onChange={handleAddMoreFiles}
                            multiple
                            className="hidden"
                            accept="image/*,application/pdf,video/*,.doc,.docx,.xls,.xlsx,.zip,.rar"
                        />
                    </div>

                    {/* Send Button (WhatsApp Green Floating Action Button) */}
                    <button
                        onClick={handleSendAll}
                        disabled={isSending || items.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white p-3.5 rounded-full shadow-lg hover:shadow-emerald-500/30 hover:scale-105 transition-all flex items-center justify-center cursor-pointer shrink-0"
                        title="ارسال (Enter)"
                    >
                        {isSending ? (
                            <RefreshCw size={22} className="animate-spin text-white" />
                        ) : (
                            <Send size={22} className="transform rotate-180" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
