// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ShapeEditor Component
 * Visual editor for drawing custom field boundary shapes
 * Two-step process: 1) Draw shape boundary 2) Select gate position
 */
import { createElement, useState, useEffect, useRef, useCallback } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button, BackButton } from '../ui/Button.js';
import { FIELD_SIZES } from '../../FieldConfig.js';

// Shape canvas for drawing polygon boundaries and selecting gate position
function ShapeCanvas({ bounds, shapePoints, setShapePoints, canvasSize, step, gatePosition, setGatePosition, gateWidth }) {
    const canvasRef = useRef(null);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState(null);
    const [hoverPoint, setHoverPoint] = useState(null);
    const [hoverEdge, setHoverEdge] = useState(null);

    const fieldWidth = bounds.maxX - bounds.minX;
    const fieldHeight = bounds.maxZ - bounds.minZ;

    // Convert world coordinates to canvas coordinates
    // NOTE: X axis is flipped to match the 3D game camera view
    const worldToCanvas = useCallback((worldX, worldZ) => {
        const scale = Math.min(canvasSize.width, canvasSize.height) / Math.max(fieldWidth, fieldHeight) * zoom * 0.8;
        const centerX = canvasSize.width / 2 + viewOffset.x;
        const centerY = canvasSize.height / 2 + viewOffset.y;
        return {
            x: centerX - worldX * scale,  // Flip X to match game view
            y: centerY - worldZ * scale
        };
    }, [canvasSize, fieldWidth, fieldHeight, zoom, viewOffset]);

    // Convert canvas coordinates to world coordinates
    // NOTE: X axis is flipped to match the 3D game camera view
    const canvasToWorld = useCallback((canvasX, canvasY) => {
        const scale = Math.min(canvasSize.width, canvasSize.height) / Math.max(fieldWidth, fieldHeight) * zoom * 0.8;
        const centerX = canvasSize.width / 2 + viewOffset.x;
        const centerY = canvasSize.height / 2 + viewOffset.y;
        return {
            x: -(canvasX - centerX) / scale,  // Flip X to match game view
            z: -(canvasY - centerY) / scale
        };
    }, [canvasSize, fieldWidth, fieldHeight, zoom, viewOffset]);

    // Snap to grid
    const snapToGrid = (value, gridSize = 10) => {
        return Math.round(value / gridSize) * gridSize;
    };

    // Find closest point on polygon perimeter (for gate placement)
    const findClosestPointOnPerimeter = useCallback((worldX, worldZ) => {
        if (shapePoints.length < 3) return null;

        let closest = null;
        let minDist = Infinity;

        for (let i = 0; i < shapePoints.length; i++) {
            const start = shapePoints[i];
            const end = shapePoints[(i + 1) % shapePoints.length];

            // Find closest point on this edge
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            const edgeLength = Math.sqrt(dx * dx + dz * dz);

            if (edgeLength === 0) continue;

            // Project point onto edge
            const t = Math.max(0, Math.min(1,
                ((worldX - start.x) * dx + (worldZ - start.z) * dz) / (edgeLength * edgeLength)
            ));

            const closestX = start.x + t * dx;
            const closestZ = start.z + t * dz;
            const dist = Math.sqrt(
                Math.pow(worldX - closestX, 2) + Math.pow(worldZ - closestZ, 2)
            );

            if (dist < minDist) {
                minDist = dist;
                closest = {
                    x: closestX,
                    z: closestZ,
                    edgeIndex: i,
                    t: t,
                    edgeAngle: Math.atan2(dz, dx),
                    edgeLength: edgeLength
                };
            }
        }

        return closest;
    }, [shapePoints]);

    // Draw the canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

        // Background. Cycle 61 P2: warm dark editor surface (was the cold indigo
        // #1e1b4b -> #0f0a1f) to match the pastoral chrome.
        const gradient = ctx.createRadialGradient(
            canvasSize.width / 2, canvasSize.height / 2, 0,
            canvasSize.width / 2, canvasSize.height / 2, canvasSize.width
        );
        gradient.addColorStop(0, '#3a3228');
        gradient.addColorStop(1, '#221d18');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

        // Draw grid
        const gridSize = 20;
        ctx.strokeStyle = 'rgba(224, 164, 88, 0.1)';
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

        // Draw bounds rectangle (reference area). Cycle 61 P2: warm gold (was
        // purple) reference outline.
        ctx.strokeStyle = 'rgba(224, 164, 88, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        const topLeft = worldToCanvas(bounds.minX, bounds.maxZ);
        const bottomRight = worldToCanvas(bounds.maxX, bounds.minZ);
        ctx.strokeRect(
            topLeft.x,
            topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
        );
        ctx.setLineDash([]);

        // Draw center crosshair
        const center = worldToCanvas(0, 0);
        ctx.strokeStyle = 'rgba(247, 241, 230, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center.x - 10, center.y);
        ctx.lineTo(center.x + 10, center.y);
        ctx.moveTo(center.x, center.y - 10);
        ctx.lineTo(center.x, center.y + 10);
        ctx.stroke();

        // Draw the shape polygon
        if (shapePoints.length > 0) {
            ctx.beginPath();
            const firstPt = worldToCanvas(shapePoints[0].x, shapePoints[0].z);
            ctx.moveTo(firstPt.x, firstPt.y);

            for (let i = 1; i < shapePoints.length; i++) {
                const pt = worldToCanvas(shapePoints[i].x, shapePoints[i].z);
                ctx.lineTo(pt.x, pt.y);
            }

            // Close and fill if 3+ points
            if (shapePoints.length >= 3) {
                ctx.closePath();
                ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
                ctx.fill();
            }

            // Cycle 61 P2: warm gold for the in-progress (under-3-point) shape,
            // meadow-adjacent green once it is a valid closed shape.
            ctx.strokeStyle = shapePoints.length >= 3 ? '#22c55e' : '#e0a458';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw vertices
            shapePoints.forEach((pt, i) => {
                const canvasPt = worldToCanvas(pt.x, pt.z);
                const isFirst = i === 0;
                const isHovered = hoverPoint === i;

                // Point circle
                ctx.beginPath();
                ctx.arc(canvasPt.x, canvasPt.y, isFirst ? 12 : 8, 0, Math.PI * 2);

                if (isFirst && shapePoints.length >= 3) {
                    ctx.fillStyle = '#22c55e';
                } else if (isHovered) {
                    ctx.fillStyle = '#f97316';
                } else {
                    ctx.fillStyle = '#e0a458';
                }
                ctx.fill();

                ctx.strokeStyle = '#f7f1e6';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Point number
                ctx.fillStyle = '#f7f1e6';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(i + 1), canvasPt.x, canvasPt.y);

                // Coordinates label for first point
                if (isFirst) {
                    ctx.fillStyle = 'rgba(247, 241, 230, 0.7)';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(`(${pt.x}, ${pt.z})`, canvasPt.x, canvasPt.y + 22);
                }
            });

            // Draw "click to close" indicator on first point
            if (shapePoints.length >= 3) {
                const firstCanvasPt = worldToCanvas(shapePoints[0].x, shapePoints[0].z);
                ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Click to close', firstCanvasPt.x, firstCanvasPt.y - 20);
            }
        }

        // Hover preview
        if (hoverPoint !== null && hoverPoint === -1) {
            // Not hovering on existing point - show add preview
        }

        // Gate placement mode visuals
        if (step === 'gate' && shapePoints.length >= 3) {
            const halfWidth = gateWidth / 2;

            // Draw hover indicator on edge
            if (hoverEdge) {
                const hoverCanvas = worldToCanvas(hoverEdge.x, hoverEdge.z);

                // Calculate gate endpoints along the edge
                const edgeAngle = hoverEdge.edgeAngle;
                const gateStart = worldToCanvas(
                    hoverEdge.x - Math.cos(edgeAngle) * halfWidth,
                    hoverEdge.z - Math.sin(edgeAngle) * halfWidth
                );
                const gateEnd = worldToCanvas(
                    hoverEdge.x + Math.cos(edgeAngle) * halfWidth,
                    hoverEdge.z + Math.sin(edgeAngle) * halfWidth
                );

                // Draw gate preview line
                ctx.beginPath();
                ctx.moveTo(gateStart.x, gateStart.y);
                ctx.lineTo(gateEnd.x, gateEnd.y);
                ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
                ctx.lineWidth = 8;
                ctx.stroke();

                // Draw center marker
                ctx.beginPath();
                ctx.arc(hoverCanvas.x, hoverCanvas.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
                ctx.fill();
            }

            // Draw selected gate position
            if (gatePosition) {
                const gateCanvas = worldToCanvas(gatePosition.x, gatePosition.z);
                const edgeAngle = gatePosition.edgeAngle || 0;

                // Calculate gate endpoints
                const gateStart = worldToCanvas(
                    gatePosition.x - Math.cos(edgeAngle) * halfWidth,
                    gatePosition.z - Math.sin(edgeAngle) * halfWidth
                );
                const gateEnd = worldToCanvas(
                    gatePosition.x + Math.cos(edgeAngle) * halfWidth,
                    gatePosition.z + Math.sin(edgeAngle) * halfWidth
                );

                // Draw gate line
                ctx.beginPath();
                ctx.moveTo(gateStart.x, gateStart.y);
                ctx.lineTo(gateEnd.x, gateEnd.y);
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 8;
                ctx.stroke();

                // Draw gate posts
                ctx.beginPath();
                ctx.arc(gateStart.x, gateStart.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#92400e';
                ctx.fill();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(gateEnd.x, gateEnd.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#92400e';
                ctx.fill();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Gate center marker
                ctx.beginPath();
                ctx.arc(gateCanvas.x, gateCanvas.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#fbbf24';
                ctx.fill();
                ctx.strokeStyle = '#f7f1e6';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Label
                ctx.fillStyle = '#f7f1e6';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('GATE', gateCanvas.x, gateCanvas.y + 22);
            }
        }

        // Instructions
        ctx.fillStyle = 'rgba(247, 241, 230, 0.6)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';

        if (step === 'draw') {
            if (shapePoints.length === 0) {
                ctx.fillText('Click to place the first point of your shape', canvasSize.width / 2, canvasSize.height - 20);
            } else if (shapePoints.length < 3) {
                ctx.fillText(`Add ${3 - shapePoints.length} more point(s) to complete the shape`, canvasSize.width / 2, canvasSize.height - 20);
            } else {
                ctx.fillText('Shape complete! Click "Next: Place Gate" to continue', canvasSize.width / 2, canvasSize.height - 20);
            }
        } else if (step === 'gate') {
            if (!gatePosition) {
                ctx.fillText('Click on any edge to place the gate', canvasSize.width / 2, canvasSize.height - 20);
            } else {
                ctx.fillText('Gate placed! Click "Confirm" to use this shape, or click to reposition', canvasSize.width / 2, canvasSize.height - 20);
            }
        }

    }, [canvasSize, zoom, viewOffset, bounds, shapePoints, worldToCanvas, fieldWidth, fieldHeight, hoverPoint, step, gatePosition, hoverEdge, gateWidth]);

    // Mouse handlers
    const handleMouseDown = (e) => {
        if (e.button === 1 || e.shiftKey) {
            // Middle click or shift+click to pan
            setIsPanning(true);
            setPanStart({
                x: e.clientX,
                y: e.clientY,
                offsetX: viewOffset.x,
                offsetY: viewOffset.y
            });
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const worldPos = canvasToWorld(x, y);

        // Gate placement mode
        if (step === 'gate') {
            const closest = findClosestPointOnPerimeter(worldPos.x, worldPos.z);
            if (closest) {
                // Ensure gate fits on this edge
                const halfWidth = gateWidth / 2;
                if (closest.edgeLength >= gateWidth) {
                    // Clamp position so gate doesn't extend past edge
                    const minT = halfWidth / closest.edgeLength;
                    const maxT = 1 - minT;
                    const clampedT = Math.max(minT, Math.min(maxT, closest.t));

                    const start = shapePoints[closest.edgeIndex];
                    const end = shapePoints[(closest.edgeIndex + 1) % shapePoints.length];
                    const dx = end.x - start.x;
                    const dz = end.z - start.z;

                    setGatePosition({
                        x: start.x + clampedT * dx,
                        z: start.z + clampedT * dz,
                        edgeIndex: closest.edgeIndex,
                        edgeAngle: closest.edgeAngle
                    });
                }
            }
            return;
        }

        // Draw mode
        const snappedPos = {
            x: snapToGrid(worldPos.x),
            z: snapToGrid(worldPos.z)
        };

        // Check if clicking on first point to close (if 3+ points)
        if (shapePoints.length >= 3) {
            const firstPt = shapePoints[0];
            const firstCanvas = worldToCanvas(firstPt.x, firstPt.z);
            const distToFirst = Math.sqrt(Math.pow(x - firstCanvas.x, 2) + Math.pow(y - firstCanvas.y, 2));

            if (distToFirst < 20) {
                // Shape is already closed visually, just confirm
                console.log('[SHAPE] Shape closed with', shapePoints.length, 'points');
                return;
            }
        }

        // Check if clicking on existing point (to select/remove)
        for (let i = 1; i < shapePoints.length; i++) {
            const pt = shapePoints[i];
            const canvasPt = worldToCanvas(pt.x, pt.z);
            const dist = Math.sqrt(Math.pow(x - canvasPt.x, 2) + Math.pow(y - canvasPt.y, 2));

            if (dist < 15) {
                // Remove this point
                const newPoints = [...shapePoints];
                newPoints.splice(i, 1);
                setShapePoints(newPoints);
                return;
            }
        }

        // Add new point
        setShapePoints([...shapePoints, snappedPos]);
    };

    const handleMouseMove = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isPanning && panStart) {
            setViewOffset({
                x: panStart.offsetX + (e.clientX - panStart.x),
                y: panStart.offsetY + (e.clientY - panStart.y)
            });
            return;
        }

        // Gate mode - show hover on edge
        if (step === 'gate' && shapePoints.length >= 3) {
            const worldPos = canvasToWorld(x, y);
            const closest = findClosestPointOnPerimeter(worldPos.x, worldPos.z);

            if (closest && closest.edgeLength >= gateWidth) {
                // Clamp position so gate preview doesn't extend past edge
                const halfWidth = gateWidth / 2;
                const minT = halfWidth / closest.edgeLength;
                const maxT = 1 - minT;
                const clampedT = Math.max(minT, Math.min(maxT, closest.t));

                const start = shapePoints[closest.edgeIndex];
                const end = shapePoints[(closest.edgeIndex + 1) % shapePoints.length];
                const dx = end.x - start.x;
                const dz = end.z - start.z;

                setHoverEdge({
                    x: start.x + clampedT * dx,
                    z: start.z + clampedT * dz,
                    edgeIndex: closest.edgeIndex,
                    edgeAngle: closest.edgeAngle
                });
            } else {
                setHoverEdge(null);
            }
            return;
        }

        // Draw mode - check hover on points
        let foundHover = null;
        for (let i = 0; i < shapePoints.length; i++) {
            const pt = shapePoints[i];
            const canvasPt = worldToCanvas(pt.x, pt.z);
            const dist = Math.sqrt(Math.pow(x - canvasPt.x, 2) + Math.pow(y - canvasPt.y, 2));

            if (dist < 15) {
                foundHover = i;
                break;
            }
        }
        setHoverPoint(foundHover);
        setHoverEdge(null);
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        setPanStart(null);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(z => Math.max(0.5, Math.min(3, z * delta)));
    };

    // Touch handlers for mobile support
    const handleTouchStart = (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const rect = canvasRef.current.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const worldPos = canvasToWorld(x, y);

            // Gate placement mode
            if (step === 'gate') {
                const closest = findClosestPointOnPerimeter(worldPos.x, worldPos.z);
                if (closest) {
                    const halfWidth = gateWidth / 2;
                    if (closest.edgeLength >= gateWidth) {
                        const minT = halfWidth / closest.edgeLength;
                        const maxT = 1 - minT;
                        const clampedT = Math.max(minT, Math.min(maxT, closest.t));

                        const start = shapePoints[closest.edgeIndex];
                        const end = shapePoints[(closest.edgeIndex + 1) % shapePoints.length];
                        const dx = end.x - start.x;
                        const dz = end.z - start.z;

                        setGatePosition({
                            x: start.x + clampedT * dx,
                            z: start.z + clampedT * dz,
                            edgeIndex: closest.edgeIndex,
                            edgeAngle: closest.edgeAngle
                        });
                    }
                }
                return;
            }

            // Draw mode
            const snappedPos = {
                x: snapToGrid(worldPos.x),
                z: snapToGrid(worldPos.z)
            };

            // Check if tapping on first point to close
            if (shapePoints.length >= 3) {
                const firstPt = shapePoints[0];
                const firstCanvas = worldToCanvas(firstPt.x, firstPt.z);
                const distToFirst = Math.sqrt(Math.pow(x - firstCanvas.x, 2) + Math.pow(y - firstCanvas.y, 2));
                if (distToFirst < 30) { // Larger touch target
                    console.log('[SHAPE] Shape closed with', shapePoints.length, 'points');
                    return;
                }
            }

            // Check if tapping on existing point to remove
            for (let i = 1; i < shapePoints.length; i++) {
                const pt = shapePoints[i];
                const canvasPt = worldToCanvas(pt.x, pt.z);
                const dist = Math.sqrt(Math.pow(x - canvasPt.x, 2) + Math.pow(y - canvasPt.y, 2));
                if (dist < 25) { // Larger touch target
                    const newPoints = [...shapePoints];
                    newPoints.splice(i, 1);
                    setShapePoints(newPoints);
                    return;
                }
            }

            // Add new point
            setShapePoints([...shapePoints, snappedPos]);
        } else if (e.touches.length === 2) {
            // Two finger touch - start panning
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            setIsPanning(true);
            setPanStart({
                x: centerX,
                y: centerY,
                offsetX: viewOffset.x,
                offsetY: viewOffset.y
            });
        }
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        if (e.touches.length === 2 && isPanning && panStart) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            setViewOffset({
                x: panStart.offsetX + (centerX - panStart.x),
                y: panStart.offsetY + (centerY - panStart.y)
            });
        }
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        setIsPanning(false);
        setPanStart(null);
    };

    // Determine cursor style
    let cursorStyle = 'crosshair';
    if (isPanning) {
        cursorStyle = 'grabbing';
    } else if (step === 'gate') {
        cursorStyle = hoverEdge ? 'pointer' : 'crosshair';
    } else if (hoverPoint !== null) {
        cursorStyle = 'pointer';
    }

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
        className: 'rounded-lg',
        style: {
            cursor: cursorStyle,
            touchAction: 'none'  // Prevent browser scroll/zoom on touch
        }
    });
}

// Validation helper
function validateShape(points) {
    if (points.length < 3) {
        return { valid: false, error: `Need at least 3 points (have ${points.length})` };
    }

    // Check for self-intersection (basic check)
    // For now, just check that all points are unique
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            if (points[i].x === points[j].x && points[i].z === points[j].z) {
                return { valid: false, error: 'Duplicate points detected' };
            }
        }
    }

    // Calculate area to ensure it's not degenerate
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].z;
        area -= points[j].x * points[i].z;
    }
    area = Math.abs(area) / 2;

    if (area < 100) {
        return { valid: false, error: 'Shape is too small (area < 100 sq units)' };
    }

    return { valid: true, area };
}

export function ShapeEditor({ config, onConfigChange, onDone, onBack }) {
    const { isCompact } = useResponsive();
    const containerRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: 450, height: 450 });
    const [shapePoints, setShapePoints] = useState(config.field?.customBorderPoints || []);
    const [step, setStep] = useState('draw'); // 'draw' | 'gate'
    const [gatePosition, setGatePosition] = useState(null);
    const gateWidth = config.gates?.[0]?.width || 8;

    const bounds = config.field?.bounds || { ...FIELD_SIZES.medium };
    const validation = validateShape(shapePoints);

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

    // Clear all points
    const handleClear = () => {
        setShapePoints([]);
        setGatePosition(null);
        setStep('draw');
    };

    // Undo last point
    const handleUndo = () => {
        if (shapePoints.length > 0) {
            setShapePoints(shapePoints.slice(0, -1));
        }
    };

    // Move to gate placement step
    const handleNextStep = () => {
        if (validation.valid) {
            setStep('gate');
        }
    };

    // Go back to draw step
    const handleBackToShape = () => {
        setStep('draw');
        setGatePosition(null);
    };

    // Confirm and save shape with gate position
    const handleConfirm = () => {
        if (!validation.valid || !gatePosition) return;

        // Save the custom border points and gate position to config
        // Clear dog.startPosition so it gets recalculated for the new shape/gate
        const newConfig = {
            ...config,
            field: {
                ...config.field,
                shape: 'custom',
                customBorderPoints: shapePoints,
                borderPoints: shapePoints
            },
            gates: [{
                position: { x: gatePosition.x, z: gatePosition.z },
                width: gateWidth,
                direction: 'north', // Direction will be calculated from edge angle
                edgeAngle: gatePosition.edgeAngle
            }],
            dog: {
                ...config.dog,
                startPosition: null  // Force recalculation based on new shape/gate
            }
        };
        onConfigChange(newConfig);
        onDone();
    };

    return createElement(Panel, {
        size: 'lg',
        maxWidth: isCompact ? '100%' : '40rem',
        className: 'overflow-hidden'
    }, [
        // Header
        createElement('div', {
            key: 'header',
            className: 'flex items-center justify-between mb-4'
        }, [
            createElement('div', { key: 'left', className: 'flex items-center gap-3' }, [
                createElement(PanelTitle, { key: 'title' },
                    step === 'draw' ? 'Step 1: Draw Shape' : 'Step 2: Place Gate'
                ),
                createElement('span', {
                    key: 'status',
                    className: `px-2 py-0.5 text-xs rounded-full ${
                        step === 'draw'
                            ? (validation.valid ? 'bg-[#5e9e6e]/20 text-[#7dbf8e]' : 'bg-[#e0a458]/20 text-[#e0a458]')
                            : (gatePosition ? 'bg-[#5e9e6e]/20 text-[#7dbf8e]' : 'bg-[#e0a458]/20 text-[#e0a458]')
                    }`
                }, step === 'draw'
                    ? (validation.valid ? `${shapePoints.length} points` : validation.error || `${shapePoints.length} points`)
                    : (gatePosition ? 'Gate placed' : 'Click to place gate'))
            ]),
            createElement('div', { key: 'right', className: 'flex gap-2' },
                step === 'draw' ? [
                    createElement('button', {
                        key: 'undo',
                        onClick: handleUndo,
                        disabled: shapePoints.length === 0,
                        className: `px-3 py-1.5 rounded-lg text-xs transition-all ${
                            shapePoints.length > 0
                                ? 'bg-[#f7f1e6]/10 text-[#f7f1e6] hover:bg-[#f7f1e6]/20'
                                : 'bg-[#f7f1e6]/5 text-[#f7f1e6]/30 cursor-not-allowed'
                        }`
                    }, 'Undo'),
                    createElement('button', {
                        key: 'clear',
                        onClick: handleClear,
                        disabled: shapePoints.length === 0,
                        className: `px-3 py-1.5 rounded-lg text-xs transition-all ${
                            shapePoints.length > 0
                                ? 'bg-[#d99a8f]/20 text-[#e8b4ab] hover:bg-[#d99a8f]/30'
                                : 'bg-[#f7f1e6]/5 text-[#f7f1e6]/30 cursor-not-allowed'
                        }`
                    }, 'Clear')
                ] : [
                    createElement('button', {
                        key: 'back-to-shape',
                        onClick: handleBackToShape,
                        className: 'px-3 py-1.5 rounded-lg text-xs bg-[#f7f1e6]/10 text-[#f7f1e6] hover:bg-[#f7f1e6]/20 transition-all'
                    }, 'Edit Shape')
                ]
            )
        ]),

        // Instructions
        createElement('div', {
            key: 'instructions',
            className: 'text-xs text-[#f7f1e6]/60 mb-3 p-2 bg-[#f7f1e6]/5 rounded-lg'
        }, step === 'draw' ? [
            createElement('p', { key: 'p1' }, '• Click to place points around the field boundary'),
            createElement('p', { key: 'p2' }, '• Points snap to a 10-unit grid'),
            createElement('p', { key: 'p3' }, '• Click an existing point to remove it'),
            createElement('p', { key: 'p4' }, '• Minimum 3 points required to form a valid shape')
        ] : [
            createElement('p', { key: 'p1' }, '• Click on any edge to place the gate'),
            createElement('p', { key: 'p2' }, `• Gate width: ${gateWidth} units`),
            createElement('p', { key: 'p3' }, '• Gate must fit on an edge (edges too short are skipped)'),
            createElement('p', { key: 'p4' }, '• The pasture will be placed beyond the gate')
        ]),

        // Canvas
        createElement('div', {
            key: 'canvas-wrapper',
            ref: containerRef,
            className: 'flex items-center justify-center bg-gradient-to-br from-[#3a3228]/40 to-[#221d18]/90 rounded-xl p-3 min-h-[350px] border border-[#e0a458]/20'
        }, createElement(ShapeCanvas, {
            bounds,
            shapePoints,
            setShapePoints,
            canvasSize,
            step,
            gatePosition,
            setGatePosition,
            gateWidth
        })),

        // Validation info
        validation.valid && createElement('div', {
            key: 'area-info',
            className: 'text-xs text-[#7dbf8e]/80 text-center mt-2'
        }, `Shape area: ${Math.round(validation.area).toLocaleString()} sq units`),

        // Footer
        createElement('div', {
            key: 'footer',
            className: 'flex gap-3 mt-4 pt-4 border-t border-[#f7f1e6]/10'
        }, step === 'draw' ? [
            createElement(BackButton, {
                key: 'back',
                onClick: onBack
            }, 'Cancel'),
            createElement(Button, {
                key: 'next',
                variant: 'primary',
                onClick: handleNextStep,
                disabled: !validation.valid,
                className: `flex-1 ${!validation.valid ? 'opacity-50 cursor-not-allowed' : ''}`
            }, validation.valid ? 'Next: Place Gate' : 'Complete Shape First')
        ] : [
            createElement(BackButton, {
                key: 'back',
                onClick: handleBackToShape
            }, 'Back to Shape'),
            createElement(Button, {
                key: 'confirm',
                variant: 'primary',
                onClick: handleConfirm,
                disabled: !gatePosition,
                className: `flex-1 ${!gatePosition ? 'opacity-50 cursor-not-allowed' : ''}`
            }, gatePosition ? 'Confirm & Use Shape' : 'Place Gate First')
        ])
    ]);
}
