export type ScanQueueStatus = 'queued' | 'syncing' | 'succeeded' | 'failed' | 'needs_reason' | 'expired';

export interface ScanQueueItem {
    id: string;
    key: string;
    action: 'checkin';
    reservationCode: string;
    guestName?: string | null;
    scannedAt: string;
    status: ScanQueueStatus;
    lastError?: string | null;
    overrideReason?: string | null;
    attempts: number;
}

const STORAGE_KEY = 'hillside.scan.queue';
const MAX_QUEUE_SIZE = 100;
const TTL_MS = 1000 * 60 * 60 * 48;

function normalizeItem(item: Partial<ScanQueueItem>): ScanQueueItem {
    const reservationCode = item.reservationCode || '';
    const action: 'checkin' = item.action || 'checkin';
    const key = item.key || `${reservationCode}:${action}`;
    const scannedAt = item.scannedAt || new Date().toISOString();
    const attempts = typeof item.attempts === 'number' ? item.attempts : 0;
    return {
        id: item.id || crypto.randomUUID(),
        key,
        action,
        reservationCode,
        guestName: item.guestName ?? null,
        scannedAt,
        status: item.status || 'queued',
        lastError: item.lastError ?? null,
        overrideReason: item.overrideReason ?? null,
        attempts,
    };
}

function applyTTL(items: ScanQueueItem[]) {
    const now = Date.now();
    return items.map((item) => {
        const age = now - new Date(item.scannedAt).getTime();
        if (age > TTL_MS) {
            return {
                ...item,
                status: 'expired' as ScanQueueStatus,
                lastError: item.lastError || 'Expired (48 hours)',
            };
        }
        return item;
    });
}

function enforceMaxSize(items: ScanQueueItem[]) {
    if (items.length <= MAX_QUEUE_SIZE) return { items, removed: 0 };
    const sorted = [...items].sort((a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime());
    const toRemove = sorted.length - MAX_QUEUE_SIZE;
    const removedIds = new Set(sorted.slice(0, toRemove).map((i) => i.id));
    const next = items.filter((item) => !removedIds.has(item.id));
    return { items: next, removed: toRemove };
}

function safeParse(value: string | null): ScanQueueItem[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => normalizeItem(item as Partial<ScanQueueItem>));
    } catch {
        return [];
    }
}

export function loadScanQueue(): ScanQueueItem[] {
    const items = applyTTL(safeParse(localStorage.getItem(STORAGE_KEY)));
    saveScanQueue(items);
    return items;
}

export function saveScanQueue(items: ScanQueueItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function upsertScanToQueue(reservationCode: string, overrideReason?: string | null) {
    const items = loadScanQueue();
    const key = `${reservationCode}:checkin`;
    const existingIndex = items.findIndex((item) => item.key === key);
    let deduped = false;
    let item: ScanQueueItem;

    if (existingIndex >= 0) {
        deduped = true;
        const existing = items[existingIndex];
        const keepNeedsReason = existing.status === 'needs_reason' && !overrideReason && !existing.overrideReason;
        item = {
            ...existing,
            scannedAt: new Date().toISOString(),
            overrideReason: overrideReason ?? existing.overrideReason ?? null,
            lastError: null,
            status: keepNeedsReason ? 'needs_reason' : 'queued',
            attempts: keepNeedsReason ? existing.attempts : 0,
        };
        items.splice(existingIndex, 1);
        items.unshift(item);
    } else {
        item = normalizeItem({
            reservationCode,
            status: 'queued',
            overrideReason: overrideReason ?? null,
            attempts: 0,
        });
        items.unshift(item);
    }

    const { items: sized, removed } = enforceMaxSize(items);
    saveScanQueue(sized);
    return { item, deduped, removed };
}

export function updateScanInQueue(id: string, updates: Partial<ScanQueueItem>) {
    const next = loadScanQueue().map((item) => (item.id === id ? { ...item, ...updates } : item));
    saveScanQueue(next);
    return next;
}

export function removeScanFromQueue(id: string) {
    const next = loadScanQueue().filter((item) => item.id !== id);
    saveScanQueue(next);
    return next;
}
