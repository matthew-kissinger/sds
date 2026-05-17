export function installGrassInteractionProofHarness(game) {
    if (typeof window === 'undefined') return null;

    const api = {
        setSheepPose(state = {}) {
            const index = Number.isFinite(state.index) ? Math.max(0, Math.floor(state.index)) : 0;
            const x = Number(state.x);
            const z = Number(state.z);
            if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
            const sheepSystem = game.gameState?.optimizedSheepSystem;
            const sheep = sheepSystem?.sheep?.[index];
            if (!sheep || !sheepSystem?.instancedMesh) return false;
            sheep.position.x = x;
            sheep.position.z = z;
            sheep.renderPosition.x = x;
            sheep.renderPosition.z = z;
            if (Number.isFinite(state.facingDirection)) {
                sheep.facingDirection = state.facingDirection;
                sheep.renderFacingDirection = state.facingDirection;
            }
            sheepSystem.update(
                0,
                null,
                null,
                null,
                game.gameState?.getBoundary?.(),
                game.gameState?.params,
                false,
                false,
                null
            );
            return true;
        },
        setPauseState(paused = true) {
            const nextPaused = paused !== false;
            if (game.inputHandler) game.inputHandler.isPaused = nextPaused;
            game.gameTimer?.setPaused?.(nextPaused);
            game.gameState?.setPaused?.(nextPaused);
            return nextPaused;
        },
        setGrassWind(state = {}) {
            const grass = game.terrainBuilder?.grassSystem;
            if (!grass) return false;
            const strength = Number.isFinite(state.strength) ? state.strength : 0;
            const direction = state.direction ?? { x: 1, y: 0 };
            grass.setWind(strength, direction);
            return true;
        },
        setGrassInteractors(entities = []) {
            const grass = game.terrainBuilder?.grassSystem;
            if (!grass) return null;
            const normalized = Array.isArray(entities) ? entities
                .filter((entity) => entity?.position)
                .map((entity) => ({
                    position: entity.position,
                    type: entity.type ?? 'dog',
                    currentRotation: entity.currentRotation,
                    facingDirection: entity.facingDirection,
                    facing: entity.facing,
                })) : [];
            grass.updateInteractors(normalized);
            return {
                count: grass.interactorCount,
                sample: grass.getInteractorSample?.(8) ?? [],
                contract: grass.grassMaterial?.userData?.konveyorGrassBladeInteractors ?? null,
            };
        },
        setActorVisibility(state = {}) {
            if (typeof state.dog === 'boolean' && game.sheepdog?.mesh) {
                game.sheepdog.mesh.visible = state.dog;
            }
            if (typeof state.sheep === 'boolean' && game.gameState?.optimizedSheepSystem?.instancedMesh) {
                game.gameState.optimizedSheepSystem.instancedMesh.visible = state.sheep;
            }
            if (Number.isFinite(state.sheepCount) && game.gameState?.optimizedSheepSystem?.instancedMesh) {
                const sheepMesh = game.gameState.optimizedSheepSystem.instancedMesh;
                sheepMesh.count = Math.max(0, Math.min(sheepMesh.instanceMatrix.count, Math.floor(state.sheepCount)));
            }
            return {
                dog: game.sheepdog?.mesh?.visible ?? null,
                sheep: game.gameState?.optimizedSheepSystem?.instancedMesh?.visible ?? null,
                sheepCount: game.gameState?.optimizedSheepSystem?.instancedMesh?.count ?? null,
            };
        },
        async renderOnce() {
            await game.sceneManager?.render?.();
            return true;
        },
    };

    window.__sdsGrassProof = api;
    return api;
}
