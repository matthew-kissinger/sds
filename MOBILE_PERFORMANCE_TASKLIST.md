# Mobile Performance Optimization Tasklist

## Executive Summary
Zero-impact mobile optimization preserving desktop quality while achieving 45-60 FPS on mobile devices through strategic LOD, frustum culling, and mobile-specific rendering pipelines.

## Task Sequence & Context

### Task 1: Mobile Grass System Overhaul
**Priority**: P0 - Critical Path
**Impact**: 90% GPU load reduction on mobile
**Desktop Impact**: Zero (preserved via isMobile flag)

```typescript
// Context: TerrainBuilder.js mobile optimization
// Senior Dev Note: Use existing isMobile flag system for zero-impact desktop preservation
// Performance Target: 80k grass instances vs 800k desktop

interface MobileGrassConfig {
  instanceCount: 80000; // Mobile-specific
  distributionBounds: { width: 200, height: 200 }; // Concentrated play area
  shaderMode: 'static' | 'animated'; // Mobile gets static
  cullingDistance: 200; // Frustum culling threshold
}

// Implementation Strategy:
// 1. Leverage existing isMobile detection in TerrainBuilder constructor
// 2. Conditional grass count based on platform
// 3. Preserve desktop 800k instances via early return
```

### Task 2: Comprehensive Frustum Culling System
**Priority**: P0 - High Impact
**Impact**: 60-80% overdraw reduction
**Method**: Three.js Frustum class with spatial partitioning

```typescript
// Context: Advanced culling for mobile optimization
// Senior Dev Note: Implement hierarchical frustum culling with distance-based LOD

interface CullingSystem {
  frustum: THREE.Frustum;
  frustumMatrix: THREE.Matrix4;
  cullingTargets: ['grass', 'trees', 'rocks', 'mountains'];
  lodDistances: {
    near: 50;    // Full detail
    mid: 150;    // Reduced detail
    far: 300;    // Minimal detail
    horizon: 500; // Billboard/impostor
  };
}

// Performance Strategy:
// 1. Single frustum update per frame
// 2. Hierarchical culling (zone-based)
// 3. Distance-based LOD transitions
// 4. Instance matrix batching
```

### Task 3: Mobile Performance UI & Controls
**Priority**: P1 - User Experience
**Impact**: Real-time performance monitoring
**Integration**: MobileControls.js extension

```typescript
// Context: Mobile UI performance toggle system
// Senior Dev Note: React-style component with state management

interface MobilePerformanceUI {
  toggleButton: {
    position: 'fixed';
    bottom: '150px';
    right: '20px';
    zIndex: 1000;
  };
  statsPanel: {
    fps: number;
    instanceCount: number;
    triangleCount: number;
    drawCalls: number;
    memoryUsage: number;
  };
  qualityPresets: ['performance', 'balanced', 'quality'];
}
```

### Task 4: Mobile-Specific Material Pipeline
**Priority**: P1 - Rendering Optimization
**Impact**: 3-5x GPU performance improvement
**Strategy**: Shader complexity reduction

```typescript
// Context: Mobile material optimization
// Senior Dev Note: Conditional material system with fallbacks

interface MobileMaterialSystem {
  grass: {
    desktop: 'complex-shader';
    mobile: 'basic-lambert';
  };
  trees: {
    desktop: 'standard-material';
    mobile: 'basic-material';
  };
  rocks: {
    desktop: 'pbr-material';
    mobile: 'lambert-material';
  };
}
```

### Task 5: Dynamic Quality Scaling
**Priority**: P2 - Adaptive Performance
**Impact**: Auto-adjustment based on device capability
**Method**: FPS-based quality modulation

```typescript
// Context: Runtime performance adaptation
// Senior Dev Note: Observer pattern with debounced adjustments

interface QualityScaler {
  targetFPS: 45;
  adjustmentThreshold: 5; // FPS drop threshold
  adjustmentInterval: 2000; // ms
  scalingFactors: {
    grassReduction: 0.25;
    lodDistanceReduction: 0.8;
    materialSimplification: true;
  };
}
```

## Implementation Sequence

### Phase 1: Foundation (Tasks 1-2)
**Duration**: 2-3 hours
**Files**: `js/TerrainBuilder.js`, `js/SceneManager.js`

1. **Mobile Grass Reduction**
   - [ ] Modify `createGrass()` method with mobile detection
   - [ ] Implement 80k instance limit for mobile
   - [ ] Concentrate grass in 200x200 play area
   - [ ] Add static shader for mobile, animated for desktop

2. **Frustum Culling Implementation**
   - [ ] Add `updateMobileFrustumCulling()` method
   - [ ] Implement grass culling with 200m threshold
   - [ ] Add tree culling with LOD transitions
   - [ ] Add rock culling system
   - [ ] Add mountain LOD with billboard fallback

### Phase 2: UI Integration (Tasks 3-4)
**Duration**: 1-2 hours
**Files**: `js/MobileControls.js`, `js/PerformanceMonitor.js`

3. **Performance Toggle Button**
   - [ ] Add mobile performance toggle below fullscreen
   - [ ] Create React-style component with state
   - [ ] Implement real-time stats display
   - [ ] Add quality preset selector

4. **Performance Monitoring**
   - [ ] Extend PerformanceMonitor for mobile stats
   - [ ] Add FPS tracking with rolling average
   - [ ] Add instance count monitoring
   - [ ] Add memory usage tracking

### Phase 3: Advanced Features (Task 5)
**Duration**: 1 hour
**Files**: `js/TerrainBuilder.js`

5. **Dynamic Quality Scaling**
   - [ ] Add FPS observer pattern
   - [ ] Implement debounced quality adjustments
   - [ ] Add user preference persistence
   - [ ] Add smooth transition animations

## Technical Specifications

### Performance Targets
- **Mobile FPS**: 45-60 sustained
- **Memory Reduction**: 75% on mobile
- **Desktop Impact**: Zero (verified via isMobile flag)
- **Battery Life**: 3-4x improvement

### Code Quality Standards
- **Zero Desktop Impact**: All changes wrapped in `if (isMobile)` blocks
- **Modern Patterns**: Observer pattern for quality scaling
- **Performance**: Single frustum update per frame
- **Maintainability**: Modular culling system with clear interfaces

### Testing Strategy
1. **Desktop Verification**: Ensure 800k grass instances unchanged
2. **Mobile Validation**: Verify 80k instances on mobile
3. **Performance Testing**: Use new mobile stats panel
4. **Cross-Device**: Test on various mobile devices

## Risk Mitigation

### Desktop Preservation
- **Method**: Early return on `!isMobile` conditions
- **Verification**: Desktop performance monitoring
- **Rollback**: Single flag change to disable mobile optimizations

### Mobile Compatibility
- **Fallback**: Basic materials for older devices
- **Detection**: Enhanced mobile detection with GPU tier
- **User Control**: Manual quality override via UI

## Deployment Checklist

- [ ] All changes tested on desktop (zero impact verified)
- [ ] Mobile performance validated on multiple devices
- [ ] UI toggle button functional and accessible
- [ ] Performance metrics accurate and real-time
- [ ] Quality presets working correctly
- [ ] Dynamic scaling smooth and responsive

## Next Steps

1. **Toggle to Act mode** to begin implementation
2. **Start with Task 1** (mobile grass reduction)
3. **Test each phase** before proceeding
4. **Validate desktop preservation** after each change

The implementation follows senior-level patterns with zero-impact desktop preservation and comprehensive mobile optimization.
