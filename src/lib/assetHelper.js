// =========================================================================
// ASSET HELPER
// Robust asset URL resolution for local dev & GitHub Pages hosting.
// =========================================================================

export function getAssetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  // Nếu đã là relative path asset của Vite (ví dụ './assets/' hoặc 'assets/')
  if (path.startsWith('./assets/') || path.startsWith('assets/')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    
    // Check if import.meta.env.BASE_URL has an absolute subpath configured (e.g. '/thien-co-lau/')
    const viteBase = import.meta?.env?.BASE_URL;
    if (viteBase && viteBase.startsWith('/') && viteBase !== '/') {
      const baseWithSlash = viteBase.endsWith('/') ? viteBase : viteBase + '/';
      return `${origin}${baseWithSlash}${cleanPath}`;
    }
    
    // Auto-detect GitHub Pages repo subpath from pathname
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const knownRoutes = ['cultivation', 'sanctum', 'novel', 'add-novel', 'edit-novel', 'search', 'library', 'reader'];
    
    let repoBase = '/';
    if (pathSegments.length > 0 && !knownRoutes.includes(pathSegments[0]) && !pathSegments[0].includes('.')) {
      repoBase = `/${pathSegments[0]}/`;
    }
    
    return `${origin}${repoBase}${cleanPath}`;
  }

  const base = import.meta?.env?.BASE_URL || './';
  return base.endsWith('/') ? `${base}${cleanPath}` : `${base}/${cleanPath}`;
}
