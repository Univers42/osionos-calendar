// Decides whether the app may talk to a calendar bridge or BaaS at all. An empty
// bridge URL is the static-preview mode: no connector UI, no request off-origin.

export const LOCAL_ONLY_NOTICE = 'Events are saved in this browser only';

const DEV_FALLBACK_BRIDGE = 'http://localhost:4200';
const DEV_FALLBACK_BAAS = 'http://localhost:8000';

// The localhost fallbacks are dev-only: Vite folds `isDev` to false in a production
// build, so the literals are dropped from the bundle instead of becoming silent defaults.
function resolveUrl(configured: string | undefined, isDev: boolean, devFallback: string): string {
  const trimmed = (configured ?? '').trim();
  if (trimmed) return trimmed;
  return isDev ? devFallback : '';
}

export function resolveBridgeEndpoint(configured: string | undefined, isDev: boolean): string {
  return resolveUrl(configured, isDev, DEV_FALLBACK_BRIDGE);
}

export function resolveBaasUrl(configured: string | undefined, isDev: boolean): string {
  return resolveUrl(configured, isDev, DEV_FALLBACK_BAAS);
}

export function isBridgeEnabled(endpoint: string): boolean {
  return endpoint.trim() !== '';
}
