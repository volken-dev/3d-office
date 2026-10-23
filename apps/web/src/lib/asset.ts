/** Resolves a file in public/ to an absolute URL from the site root, e.g. assetUrl("images/the-delegation.svg"). */
export function assetUrl(path: string): string {
  return `/${path.replace(/^\/+/, "")}`
}
