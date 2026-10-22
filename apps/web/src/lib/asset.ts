/** Deployment base path (e.g. '/the-delegation'), injected by next.config.ts. Empty when served from the root. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** Resolves a file in public/ to an absolute URL that respects the base path, e.g. assetUrl('models/office.glb'). */
export function assetUrl(path: string): string {
  return `${BASE_PATH}/${path.replace(/^\/+/, '')}`;
}
