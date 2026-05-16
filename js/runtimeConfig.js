const WORKER_BASE = typeof __SDS_WORKER_BASE__ !== 'undefined'
    ? __SDS_WORKER_BASE__
    : 'https://sds-worker.matt-m-kissinger.workers.dev';
const LOCAL_API_BASE = 'http://localhost:8787';

export function isLocalRuntime() {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '';
}

export function getApiBase() {
    if (isLocalRuntime()) return LOCAL_API_BASE;
    return WORKER_BASE || 'https://sds-worker.matt-m-kissinger.workers.dev';
}

export function getWsBase() {
    return getApiBase().replace(/^http/, 'ws');
}

export function isTelemetryEnabled() {
    return !isLocalRuntime();
}
