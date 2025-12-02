/**
 * FenceEditor Component
 * 2D visual editor for placing fences in sandbox mode
 */
import React, { createElement, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button, BackButton } from '../ui/Button.js';
import { FIELD_SIZES, FIELD_SHAPES } from '../../FieldConfig.js';

// Tool types
const TOOLS = {
    SELECT: 'select',
    FENCE: 'fence',
    GATE: 'gate',
    ERASE: 'erase',
    PAN: 'pan',
    SHAPE: 'shape'  // For drawing custom field shapes
};

// Tool button component
function ToolButton({ tool, currentTool, onClick, icon, label }) {
    const isActive = currentTool === tool;
    return createElement('button', {
        onClick: () => onClick(tool),
        className: `flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
            isActive
                ? 'bg-emerald-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
        }`,
        title: label
    }, [
        createElement('span', { key: 'icon', className: 'text-lg' }, icon),
        createElement('span', { key: 'label', className: 'text-[10px] mt-0.5' }, label)
    ]);
}

// Canvas-based fence editor
function EditorCanvas({ config, onConfigChange, tool, canvasSize, t }) {
    const canvasRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(null);
    const [dragEnd, setDragEnd] = useState(null);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [selectedFence, setSelectedFence] = useState(null);

    // Get bounds and border points from config
    const bounds = config.field?.bounds || { ...FIELD_SIZES.medium };
    const fieldShape = config.field?.shape || 'square';
    const fieldWidth = bounds.maxX - bounds.minX;
    const fieldHeight = bounds.maxZ - bounds.minZ;

    // Compute border points from shape if not provided directly
    // This ensures the canvas always shows the correct shape
    const borderPoints = useMemo(() => {
        // First check if config has borderPoints
        if (config.field?.borderPoints && config.field.borderPoints.length >= 3) {
            return config.field.borderPoints;
        }
        // Otherwise compute from shape
        const shapeConfig = FIELD_SHAPES[fieldShape];
        if (shapeConfig?.getBorderPoints) {
            return shapeConfig.getBorderPoints(bounds);
        }
        // Fallback to square
        return [
            { x: bounds.minX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.minZ },
            { x: bounds.maxX, z: bounds.maxZ },
            { x: bounds.minX, z: bounds.maxZ }
        ];
    }, [config.field?.borderPoints, config.field?.shape, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, fieldShape]);

    const customBorderPoints = config.field?.customBorderPoints || null;  // User-drawn shape

    // Convert world coordinates to canvas coordinates
    // NOTE: X axis is flipped to match the 3D game camera view
    // In the 3D game, camera looks from behind (south), so left/right are intuitive
    const worldToCanvas = useCallback((worldX, worldZ) => {
        const scale = Math.min(canvasSize.width, canvasSize.height) / Math.max(fieldWidth, fieldHeight) * zoom;
        const centerX = canvasSize.width / 2 + viewOffset.x;
        const centerY = canvasSize.height / 2 + viewOffset.y;
        return {
            x: centerX - worldX * scale,  // Flip X to match game view
            y: centerY - worldZ * scale   // Invert Z for screen coords
        };
    }, [canvasSize, fieldWidth, fieldHeight, zoom, viewOffset]);

    // Convert canvas coordinates to world coordinates
    // NOTE: X axis is flipped to match the 3D game camera view
    const canvasToWorld = useCallback((canvasX, canvasY) => {
        const scale = Math.min(canvasSize.width, canvasSize.height) / Math.max(fieldWidth, fieldHeight) * zoom;
        const centerX = canvasSize.width / 2 + viewOffset.x;
        const centerY = canvasSize.height / 2 + viewOffset.y;
        return {
            x: -(canvasX - centerX) / scale,  // Flip X to match game view
            z: -(canvasY - centerY) / scale   // Invert for world coords
        };
    }, [canvasSize, fieldWidth, fieldHeight, zoom, viewOffset]);

    // Snap to grid
    const snapToGrid = (value, gridSize = 10) => {
        return Math.round(value / gridSize) * gridSize;
    };

    // Draw the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

        // Draw grid
        const scale = Math.min(canvasSize.width, canvasSize.height) / Math.max(fieldWidth, fieldHeight) * zoom;
        const gridSize = 20;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;

        for (let x = bounds.minX; x <= bounds.maxX; x += gridSize) {
            const { x: cx } = worldToCanvas(x, 0);
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, canvasSize.height);
            ctx.stroke();
        }
        for (let z = bounds.minZ; z <= bounds.maxZ; z += gridSize) {
            const { y: cy } = worldToCanvas(0, z);
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(canvasSize.width, cy);
            ctx.stroke();
        }

        // Draw field boundary - polygon if available, otherwise rectangle
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 3;

        if (borderPoints && borderPoints.length >= 3) {
            // Draw polygon shape
            ctx.beginPath();
            const firstPoint = worldToCanvas(borderPoints[0].x, borderPoints[0].z);
            ctx.moveTo(firstPoint.x, firstPoint.y);

            for (let i = 1; i < borderPoints.length; i++) {
                const point = worldToCanvas(borderPoints[i].x, borderPoints[i].z);
                ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();

            // Fill with semi-transparent grass color
            ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
            ctx.fill();
            ctx.stroke();
        } else {
            // Draw rectangle
            const topLeft = worldToCanvas(bounds.minX, bounds.maxZ);
            const bottomRight = worldToCanvas(bounds.maxX, bounds.minZ);
            ctx.strokeRect(
                topLeft.x,
                topLeft.y,
                bottomRight.x - topLeft.x,
                bottomRight.y - topLeft.y
            );
        }

        // Draw pastures
        (config.pastures || []).forEach(pasture => {
            const pTopLeft = worldToCanvas(pasture.minX, pasture.maxZ);
            const pBottomRight = worldToCanvas(pasture.maxX, pasture.minZ);
            ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
            ctx.fillRect(
                pTopLeft.x,
                pTopLeft.y,
                pBottomRight.x - pTopLeft.x,
                pBottomRight.y - pTopLeft.y
            );
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(
                pTopLeft.x,
                pTopLeft.y,
                pBottomRight.x - pTopLeft.x,
                pBottomRight.y - pTopLeft.y
            );
            ctx.setLineDash([]);
        });

        // Draw gates
        (config.gates || []).forEach((gate, index) => {
            const gatePos = worldToCanvas(gate.position.x, gate.position.z);
            const gateWidth = gate.width * scale;

            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;

            // Draw gate as a line with markers
            if (gate.direction === 'north' || gate.direction === 'south') {
                ctx.beginPath();
                ctx.moveTo(gatePos.x - gateWidth / 2, gatePos.y);
                ctx.lineTo(gatePos.x + gateWidth / 2, gatePos.y);
                ctx.stroke();
                // Gate posts
                ctx.beginPath();
                ctx.arc(gatePos.x - gateWidth / 2, gatePos.y, 5, 0, Math.PI * 2);
                ctx.arc(gatePos.x + gateWidth / 2, gatePos.y, 5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.moveTo(gatePos.x, gatePos.y - gateWidth / 2);
                ctx.lineTo(gatePos.x, gatePos.y + gateWidth / 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(gatePos.x, gatePos.y - gateWidth / 2, 5, 0, Math.PI * 2);
                ctx.arc(gatePos.x, gatePos.y + gateWidth / 2, 5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Gate label
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Gate ${index + 1}`, gatePos.x, gatePos.y - 12);
        });

        // Draw custom fences
        (config.fences || []).forEach(fence => {
            const start = worldToCanvas(fence.start.x, fence.start.z);
            const end = worldToCanvas(fence.end.x, fence.end.z);

            const isSelected = selectedFence === fence.id;
            ctx.strokeStyle = isSelected ? '#60a5fa' : '#a78bfa';
            ctx.lineWidth = isSelected ? 4 : 3;
            ctx.lineCap = 'round';

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            // Draw endpoints
            ctx.fillStyle = isSelected ? '#60a5fa' : '#a78bfa';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
            ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw drag preview
        if (isDragging && dragStart && dragEnd && (tool === TOOLS.FENCE || tool === TOOLS.GATE)) {
            const start = worldToCanvas(dragStart.x, dragStart.z);
            const end = worldToCanvas(dragEnd.x, dragEnd.z);

            ctx.strokeStyle = tool === TOOLS.GATE ? 'rgba(251, 191, 36, 0.7)' : 'rgba(167, 139, 250, 0.7)';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Show length
            const length = Math.sqrt(
                Math.pow(dragEnd.x - dragStart.x, 2) +
                Math.pow(dragEnd.z - dragStart.z, 2)
            );
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(length)}m`, midX, midY - 8);
        }

        // Draw dog start position
        const dogStart = config.dog?.startPosition || { x: 0, z: -30 };
        const dogPos = worldToCanvas(dogStart.x, dogStart.z);
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(dogPos.x, dogPos.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('fenceEditor.dogLabel'), dogPos.x, dogPos.y);

        // Draw sheep spawn area indicator
        const spawnCenter = worldToCanvas(0, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(spawnCenter.x, spawnCenter.y, 50 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '10px sans-serif';
        ctx.fillText(t('fenceEditor.sheepSpawn'), spawnCenter.x, spawnCenter.y);

    }, [config, canvasSize, zoom, viewOffset, isDragging, dragStart, dragEnd, tool, selectedFence, worldToCanvas, bounds, borderPoints, fieldWidth, fieldHeight]);

    // Mouse handlers
    const handleMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = canvasToWorld(x, y);
        const snappedPos = {
            x: snapToGrid(worldPos.x),
            z: snapToGrid(worldPos.z)
        };

        if (tool === TOOLS.PAN) {
            setIsDragging(true);
            setDragStart({ x, y, offsetX: viewOffset.x, offsetY: viewOffset.y });
        } else if (tool === TOOLS.FENCE || tool === TOOLS.GATE) {
            setIsDragging(true);
            setDragStart(snappedPos);
            setDragEnd(snappedPos);
        } else if (tool === TOOLS.ERASE) {
            // Find and remove fence at click position
            const clickedFence = (config.fences || []).find(fence => {
                const dist = pointToLineDistance(
                    worldPos,
                    fence.start,
                    fence.end
                );
                return dist < 5;
            });
            if (clickedFence) {
                const newFences = config.fences.filter(f => f.id !== clickedFence.id);
                onConfigChange({ ...config, fences: newFences, preset: 'custom' });
            }
        } else if (tool === TOOLS.SELECT) {
            // Select fence
            const clickedFence = (config.fences || []).find(fence => {
                const dist = pointToLineDistance(
                    worldPos,
                    fence.start,
                    fence.end
                );
                return dist < 5;
            });
            setSelectedFence(clickedFence?.id || null);
        }
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (tool === TOOLS.PAN && dragStart) {
            setViewOffset({
                x: dragStart.offsetX + (x - dragStart.x),
                y: dragStart.offsetY + (y - dragStart.y)
            });
        } else if (tool === TOOLS.FENCE || tool === TOOLS.GATE) {
            const worldPos = canvasToWorld(x, y);
            setDragEnd({
                x: snapToGrid(worldPos.x),
                z: snapToGrid(worldPos.z)
            });
        }
    };

    const handleMouseUp = () => {
        if (isDragging && dragStart && dragEnd) {
            if (tool === TOOLS.FENCE) {
                // Add fence if it has length
                const length = Math.sqrt(
                    Math.pow(dragEnd.x - dragStart.x, 2) +
                    Math.pow(dragEnd.z - dragStart.z, 2)
                );
                if (length > 5) {
                    const newFence = {
                        id: 'fence_' + Date.now().toString(36),
                        start: { ...dragStart },
                        end: { ...dragEnd },
                        type: 'fence'
                    };
                    const newFences = [...(config.fences || []), newFence];
                    onConfigChange({ ...config, fences: newFences, preset: 'custom' });
                }
            }
        }

        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(0.5, Math.min(3, z * delta)));
    };

    // Touch handlers for mobile support
    const handleTouchStart = (e) => {
        e.preventDefault();
        const rect = canvasRef.current.getBoundingClientRect();

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const worldPos = canvasToWorld(x, y);
            const snappedPos = {
                x: snapToGrid(worldPos.x),
                z: snapToGrid(worldPos.z)
            };

            if (tool === TOOLS.PAN) {
                setIsDragging(true);
                setDragStart({ x, y, offsetX: viewOffset.x, offsetY: viewOffset.y });
            } else if (tool === TOOLS.FENCE || tool === TOOLS.GATE) {
                setIsDragging(true);
                setDragStart(snappedPos);
                setDragEnd(snappedPos);
            } else if (tool === TOOLS.ERASE) {
                // Find and remove fence at touch position
                const clickedFence = (config.fences || []).find(fence => {
                    const dist = pointToLineDistance(worldPos, fence.start, fence.end);
                    return dist < 10; // Larger touch target
                });
                if (clickedFence) {
                    const newFences = config.fences.filter(f => f.id !== clickedFence.id);
                    onConfigChange({ ...config, fences: newFences, preset: 'custom' });
                }
            } else if (tool === TOOLS.SELECT) {
                // Select fence
                const clickedFence = (config.fences || []).find(fence => {
                    const dist = pointToLineDistance(worldPos, fence.start, fence.end);
                    return dist < 10; // Larger touch target
                });
                setSelectedFence(clickedFence?.id || null);
            }
        } else if (e.touches.length === 2) {
            // Two finger touch - start panning
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            setIsDragging(true);
            setDragStart({
                x: centerX - rect.left,
                y: centerY - rect.top,
                offsetX: viewOffset.x,
                offsetY: viewOffset.y,
                isTwoFinger: true
            });
        }
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        if (!isDragging || !dragStart) return;

        const rect = canvasRef.current.getBoundingClientRect();

        if (e.touches.length === 2 || dragStart.isTwoFinger) {
            // Two finger pan
            const touch1 = e.touches[0];
            const touch2 = e.touches[1] || touch1;
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            setViewOffset({
                x: dragStart.offsetX + ((centerX - rect.left) - dragStart.x),
                y: dragStart.offsetY + ((centerY - rect.top) - dragStart.y)
            });
        } else if (e.touches.length === 1) {
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            if (tool === TOOLS.PAN) {
                setViewOffset({
                    x: dragStart.offsetX + (x - dragStart.x),
                    y: dragStart.offsetY + (y - dragStart.y)
                });
            } else if (tool === TOOLS.FENCE || tool === TOOLS.GATE) {
                const worldPos = canvasToWorld(x, y);
                setDragEnd({
                    x: snapToGrid(worldPos.x),
                    z: snapToGrid(worldPos.z)
                });
            }
        }
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();

        if (isDragging && dragStart && dragEnd && !dragStart.isTwoFinger) {
            if (tool === TOOLS.FENCE) {
                // Add fence if it has length
                const length = Math.sqrt(
                    Math.pow(dragEnd.x - dragStart.x, 2) +
                    Math.pow(dragEnd.z - dragStart.z, 2)
                );
                if (length > 5) {
                    const newFence = {
                        id: 'fence_' + Date.now().toString(36),
                        start: { ...dragStart },
                        end: { ...dragEnd },
                        type: 'fence'
                    };
                    const newFences = [...(config.fences || []), newFence];
                    onConfigChange({ ...config, fences: newFences, preset: 'custom' });
                }
            }
        }

        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
    };

    // Point to line distance calculation
    const pointToLineDistance = (point, lineStart, lineEnd) => {
        const A = point.x - lineStart.x;
        const B = point.z - lineStart.z;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.z - lineStart.z;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.z;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.z;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.z + param * D;
        }

        const dx = point.x - xx;
        const dz = point.z - yy;
        return Math.sqrt(dx * dx + dz * dz);
    };

    return createElement('canvas', {
        ref: canvasRef,
        width: canvasSize.width,
        height: canvasSize.height,
        onMouseDown: handleMouseDown,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp,
        onMouseLeave: handleMouseUp,
        onWheel: handleWheel,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        className: 'rounded-lg cursor-crosshair',
        style: {
            cursor: tool === TOOLS.PAN ? 'grab' : tool === TOOLS.ERASE ? 'not-allowed' : 'crosshair',
            touchAction: 'none'  // Prevent browser scroll/zoom on touch
        }
    });
}

// Preset card with visual mini-preview
function PresetCard({ preset, isSelected, onClick, t }) {
    const presetInfo = {
        open: { icon: '🌾', color: '#10b981', descKey: 'fenceEditor.presets.open' },
        corridor: { icon: '🚧', color: '#3b82f6', descKey: 'fenceEditor.presets.corridor' },
        funnel: { icon: '📐', color: '#8b5cf6', descKey: 'fenceEditor.presets.funnel' },
        maze: { icon: '🧩', color: '#f59e0b', descKey: 'fenceEditor.presets.maze' },
        obstacles: { icon: '🪨', color: '#ef4444', descKey: 'fenceEditor.presets.obstacles' }
    };

    const info = presetInfo[preset] || { icon: '?', color: '#666', descKey: '' };

    return createElement('button', {
        onClick,
        className: `p-3 rounded-xl transition-all flex flex-col items-center gap-1 ${
            isSelected
                ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 ring-2 ring-emerald-400 text-white'
                : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
        }`,
        style: isSelected ? { boxShadow: `0 0 20px ${info.color}40` } : {}
    }, [
        createElement('span', { key: 'icon', className: 'text-2xl' }, info.icon),
        createElement('span', {
            key: 'name',
            className: 'text-xs font-medium capitalize'
        }, t(`sandbox.fencePresets.${preset}`)),
        createElement('span', {
            key: 'desc',
            className: 'text-[10px] text-white/50'
        }, t(info.descKey))
    ]);
}

export function FenceEditor({ config, onConfigChange, onDone, onBack }) {
    const { t } = useTranslation();
    const { isCompact } = useResponsive();
    const [tool, setTool] = useState(TOOLS.FENCE);
    const containerRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: 400, height: 400 });
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Calculate canvas size based on container
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const size = Math.min(rect.width - 16, rect.height - 16, 500);
                setCanvasSize({ width: size, height: size });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Track history for undo/redo
    const saveToHistory = (fences) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push([...fences]);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    // Enhanced config change with history
    const handleConfigChangeWithHistory = (newConfig) => {
        if (newConfig.fences !== config.fences) {
            saveToHistory(newConfig.fences || []);
        }
        onConfigChange(newConfig);
    };

    // Undo
    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            onConfigChange({ ...config, fences: history[newIndex], preset: 'custom' });
        }
    };

    // Redo
    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            onConfigChange({ ...config, fences: history[newIndex], preset: 'custom' });
        }
    };

    // Apply preset
    const handleApplyPreset = (presetName) => {
        import('../../SandboxConfig.js').then(({ SandboxConfig }) => {
            const tempConfig = new SandboxConfig({ ...config, preset: presetName, fences: [] });
            tempConfig.applyPreset(presetName);
            saveToHistory(tempConfig.fences);
            onConfigChange({
                ...config,
                fences: tempConfig.fences,
                preset: presetName
            });
        });
    };

    // Clear all fences
    const handleClearAll = () => {
        saveToHistory([]);
        onConfigChange({
            ...config,
            fences: [],
            preset: 'open'
        });
    };

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;
    const fenceCount = (config.fences || []).length;

    // Get current shape info for display
    const currentShape = FIELD_SHAPES[config.field?.shape || 'square'];
    const currentSize = config.field?.size || 'medium';

    return createElement(Panel, {
        size: 'xl',
        maxWidth: isCompact ? '100%' : '52rem',
        className: 'overflow-hidden'
    }, [
        // Header with title and stats
        createElement('div', {
            key: 'header',
            className: 'flex items-center justify-between mb-4'
        }, [
            createElement('div', { key: 'left', className: 'flex items-center gap-3' }, [
                createElement(PanelTitle, { key: 'title' }, t('fenceEditor.title')),
                createElement('span', {
                    key: 'count',
                    className: 'px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs rounded-full'
                }, fenceCount === 1 ? t('fenceEditor.fenceCount', { count: fenceCount }) : t('fenceEditor.fenceCountPlural', { count: fenceCount })),
                createElement('span', {
                    key: 'shape',
                    className: 'px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full flex items-center gap-1'
                }, [
                    createElement('span', { key: 'icon' }, currentShape?.icon || '⬜'),
                    createElement('span', { key: 'label' }, `${t(`sandbox.shapes.${currentShape?.id || 'square'}`)} (${t(`sandbox.sizes.${currentSize}`)})`)
                ])
            ]),
            // Undo/Redo buttons
            createElement('div', { key: 'right', className: 'flex gap-1' }, [
                createElement('button', {
                    key: 'undo',
                    onClick: handleUndo,
                    disabled: !canUndo,
                    className: `p-2 rounded-lg transition-all ${
                        canUndo
                            ? 'bg-white/10 text-white hover:bg-white/20'
                            : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }`,
                    title: 'Undo'
                }, '↩'),
                createElement('button', {
                    key: 'redo',
                    onClick: handleRedo,
                    disabled: !canRedo,
                    className: `p-2 rounded-lg transition-all ${
                        canRedo
                            ? 'bg-white/10 text-white hover:bg-white/20'
                            : 'bg-white/5 text-white/30 cursor-not-allowed'
                    }`,
                    title: 'Redo'
                }, '↪')
            ])
        ]),

        // Preset cards row
        createElement('div', {
            key: 'presets',
            className: 'mb-4'
        }, [
            createElement('div', {
                key: 'label',
                className: 'text-xs text-white/50 mb-2 uppercase tracking-wide'
            }, t('fenceEditor.quickLayouts')),
            createElement('div', {
                key: 'cards',
                className: 'grid grid-cols-5 gap-2'
            }, ['open', 'corridor', 'funnel', 'maze', 'obstacles'].map(preset =>
                createElement(PresetCard, {
                    key: preset,
                    preset,
                    isSelected: config.preset === preset,
                    onClick: () => handleApplyPreset(preset),
                    t
                })
            ))
        ]),

        // Main content area
        createElement('div', {
            key: 'main',
            className: 'flex gap-4'
        }, [
            // Left side - Canvas
            createElement('div', {
                key: 'canvas-area',
                className: 'flex-1'
            }, [
                createElement('div', {
                    key: 'canvas-wrapper',
                    ref: containerRef,
                    className: 'flex items-center justify-center bg-gradient-to-br from-slate-900/80 to-slate-800/80 rounded-xl p-3 min-h-[320px] border border-white/10'
                }, createElement(EditorCanvas, {
                    config,
                    onConfigChange: handleConfigChangeWithHistory,
                    tool,
                    canvasSize,
                    t
                }))
            ]),

            // Right side - Tools
            createElement('div', {
                key: 'tools-area',
                className: 'w-24 flex flex-col gap-3'
            }, [
                createElement('div', {
                    key: 'tools-label',
                    className: 'text-xs text-white/50 uppercase tracking-wide'
                }, t('fenceEditor.tools')),
                createElement('div', {
                    key: 'tools',
                    className: 'flex flex-col gap-1'
                }, [
                    createElement(ToolButton, { key: 'fence', tool: TOOLS.FENCE, currentTool: tool, onClick: setTool, icon: '📏', label: t('fenceEditor.draw') }),
                    createElement(ToolButton, { key: 'select', tool: TOOLS.SELECT, currentTool: tool, onClick: setTool, icon: '👆', label: t('fenceEditor.select') }),
                    createElement(ToolButton, { key: 'erase', tool: TOOLS.ERASE, currentTool: tool, onClick: setTool, icon: '🗑️', label: t('fenceEditor.erase') }),
                    createElement(ToolButton, { key: 'pan', tool: TOOLS.PAN, currentTool: tool, onClick: setTool, icon: '✋', label: t('fenceEditor.pan') })
                ]),
                createElement('div', { key: 'spacer', className: 'flex-1' }),
                createElement('button', {
                    key: 'clear',
                    onClick: handleClearAll,
                    className: 'p-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all text-xs text-center'
                }, t('fenceEditor.clearAll'))
            ])
        ]),

        // Help text
        createElement('div', {
            key: 'help',
            className: 'text-xs text-white/40 text-center mt-3 bg-white/5 rounded-lg p-2'
        }, tool === TOOLS.FENCE
            ? t('fenceEditor.helpDraw')
            : tool === TOOLS.ERASE
            ? t('fenceEditor.helpErase')
            : tool === TOOLS.PAN
            ? t('fenceEditor.helpPan')
            : t('fenceEditor.helpSelect')),

        // Footer
        createElement('div', {
            key: 'footer',
            className: 'flex gap-3 mt-4 pt-4 border-t border-white/10'
        }, [
            createElement(BackButton, {
                key: 'back',
                onClick: onBack
            }, t('common.back')),
            createElement(Button, {
                key: 'done',
                variant: 'primary',
                onClick: onDone,
                className: 'flex-1'
            }, fenceCount > 0 ? `${t('fenceEditor.done')} (${fenceCount})` : t('fenceEditor.done'))
        ])
    ]);
}
