/**
 * Resolves root-relative public asset paths (e.g. '/logos/hd/LG.png', '/logos/KBO.svg')
 * against Vite's configured `BASE_URL` so static assets work identically on
 * localhost ('/') and GitHub Pages ('/kbo-manager-2027/').
 */
export function resolvePublicAssetUrl(url: string): string {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const metaEnv = (import.meta as { env?: { BASE_URL?: string } }).env;
  const base = (metaEnv?.BASE_URL || '/').replace(/\/+$/, '');
  if (url.startsWith('/')) {
    if (base && url.startsWith(`${base}/`)) return url;
    return `${base}${url}`;
  }
  return `${base}/${url}`;
}
