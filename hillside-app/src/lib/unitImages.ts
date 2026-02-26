import type { Unit } from '../types/database';

export function getUnitImageUrls(unit?: Pick<Unit, 'image_url' | 'image_urls'> | null): string[] {
    if (!unit) return [];

    const urls = (unit.image_urls ?? []).filter(Boolean);
    if (urls.length > 0) return urls;

    return unit.image_url ? [unit.image_url] : [];
}

export function getUnitCoverImage(unit?: Pick<Unit, 'image_url' | 'image_urls'> | null): string | null {
    const urls = getUnitImageUrls(unit);
    return urls.length > 0 ? urls[0] : null;
}
