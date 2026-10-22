/** Resolves a file in public/ to an absolute URL from the site root, e.g. assetUrl("models/office.glb"). */
export function assetUrl(path: string): string {
  return `/${path.replace(/^\/+/, "")}`
}
