import { supabase } from '../lib/supabase';

const v2ApiBaseUrl = import.meta.env.VITE_V2_API_BASE_URL?.trim() ?? '';
const useV2ApiFacade = import.meta.env.VITE_USE_V2_API_FACADE === 'true';
type Parser<T> = { parse: (value: unknown) => T };

export function isV2ApiFacadeEnabled() {
    return useV2ApiFacade && Boolean(v2ApiBaseUrl);
}

function buildUrl(path: string) {
    const normalizedBase = v2ApiBaseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
}

export async function callV2Api<T>(path: string, init?: RequestInit, parser?: Parser<T>): Promise<T> {
    if (!isV2ApiFacadeEnabled()) {
        throw new Error('V2 API facade is disabled. Set VITE_USE_V2_API_FACADE=true and VITE_V2_API_BASE_URL.');
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = new Headers(init?.headers ?? {});
    headers.set('Content-Type', 'application/json');
    headers.set('x-correlation-id', crypto.randomUUID());
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(buildUrl(path), {
        ...init,
        headers,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`V2 API ${response.status}: ${errorBody || response.statusText}`);
    }

    const json = (await response.json()) as unknown;
    if (!parser) return json as T;
    return parser.parse(json);
}
