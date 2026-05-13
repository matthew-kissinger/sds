import {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
} from 'mediabunny';

const DEFAULT_BITRATE = 12_000_000;

export async function recordSdsShotToMp4({ cinema, shot, fps = 30 }) {
    if (!cinema) throw new Error('cinema API missing');
    if (typeof VideoEncoder === 'undefined') throw new Error('WebCodecs VideoEncoder unavailable');

    const canvas = cinema.renderer?.domElement;
    if (!canvas) throw new Error('renderer canvas missing');

    const target = new BufferTarget();
    const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
    });
    const source = new CanvasSource(canvas, {
        codec: 'avc',
        bitrate: shot.bitrate || DEFAULT_BITRATE,
        keyFrameInterval: 2,
    });

    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    const durationMs = Math.max(1, shot.durationMs || 1000);
    const frameCount = Math.max(1, Math.ceil((durationMs / 1000) * fps));
    const frameDuration = 1 / fps;
    const frameIntervalMs = 1000 / fps;

    cinema.pauseSimulation?.();
    try {
        if (shot.cameraRig === 'follow') {
            cinema.resetFollowCamera?.();
            for (let i = 0; i < Math.round(fps * 0.75); i++) {
                applyShotPose(cinema, shot, 0, frameDuration);
                renderCinemaFrame(cinema);
            }
        }
        for (let i = 0; i < frameCount; i++) {
            const tMs = Math.min(durationMs, i * frameIntervalMs);
            applyShotPose(cinema, shot, tMs, frameDuration);
            renderCinemaFrame(cinema);
            await withTimeout(
                source.add(i * frameDuration, frameDuration, {
                    keyFrame: i === 0 || i % Math.max(1, Math.round(fps * 2)) === 0,
                }),
                5000,
                `Mediabunny frame ${i} encode timeout`,
            );
        }
    } finally {
        cinema.resumeSimulation?.();
    }

    await output.finalize();
    const bytes = target.buffer instanceof Uint8Array
        ? target.buffer
        : new Uint8Array(target.buffer);

    return {
        base64: uint8ToBase64(bytes),
        bytes: bytes.byteLength,
        frameCount,
        durationMs,
        fps,
        codec: 'avc',
        container: 'mp4',
        width: canvas.width,
        height: canvas.height,
    };
}

function withTimeout(promise, timeoutMs, message) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function renderCinemaFrame(cinema) {
    if (cinema.renderFrame?.()) return;
    cinema.renderer?.render?.(cinema.scene, cinema.camera);
}

function applyShotPose(cinema, shot, tMs, delta) {
    cinema.hideUI?.();
    cinema.setSun?.(shot.sun ?? 0.5);

    if (shot.dogPath) {
        cinema.poseDogOnPath(shot.dogPath, tMs, delta);
    } else if (shot.dogPose) {
        cinema.poseDog(
            shot.dogPose.x,
            shot.dogPose.z,
            shot.dogPose.velocity || { x: 0, z: 0 },
            delta,
        );
    }
    if (shot.menuHerding) {
        cinema.tickMenuHerding?.(delta);
    }

    if (shot.cameraRig === 'follow') {
        cinema.updateFollowCamera?.(delta, shot.followZoom || 16);
    } else if (shot.cameraRig === 'dog-track') {
        cinema.setDogTrackCamera?.(shot.dogCamera || {});
    } else {
        cinema.freeFlyActive = true;
        if (shot.cameraPath) {
            const pose = sampleCamera(shot.cameraPath, tMs, shot.durationMs);
            cinema.setCameraPose(pose.pos, pose.target);
        } else if (shot.camera) {
            cinema.setCameraPose(shot.camera.pos, shot.camera.target);
        }
    }
}

function sampleCamera(path, tMs, durationMs) {
    const normalized = Math.max(0, Math.min(1, tMs / Math.max(1, durationMs || 1)));
    let a = path[0];
    let b = path[path.length - 1];
    for (let i = 0; i < path.length - 1; i++) {
        if (normalized >= path[i].t && normalized <= path[i + 1].t) {
            a = path[i];
            b = path[i + 1];
            break;
        }
    }
    const span = Math.max(0.0001, b.t - a.t);
    const k = Math.max(0, Math.min(1, (normalized - a.t) / span));
    const sk = k * k * (3 - 2 * k);
    return {
        pos: lerpVec(a.pos, b.pos, sk),
        target: lerpVec(a.target, b.target, sk),
    };
}

function lerpVec(a, b, k) {
    return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        z: a.z + (b.z - a.z) * k,
    };
}

function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}
