/**
 * Injects a Content-Security-Policy <meta> into every exported HTML page.
 * A static host cannot be relied on to send response headers and `output: 'export'` cannot use nonces, so each inline
 * bootstrap script Next emits is allowed by its sha256 hash instead of 'unsafe-inline'.
 * Meta-delivered CSP ignores frame-ancestors, report-uri and sandbox; those need real headers.
 * The policy only governs elements parsed after it, so the meta is inserted right after
 * <meta charSet>, before every <script>.
 */
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const OUT_DIR = path.resolve(process.argv[2] ?? "out")

/**
 * Why the non-'self' sources are needed:
 * - script-src 'wasm-unsafe-eval': the Meshopt mesh decoder compiles WebAssembly (on the main thread, no workers).
 * - style-src 'unsafe-inline': inline style attributes (React, React Flow) and injected <style> tags (sonner).
 * - img-src blob:: GLTFLoader decodes embedded textures through blob: URLs, fetched with fetch() by ImageBitmapLoader.
 */
const basePolicy = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'wasm-unsafe-eval'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "connect-src": ["'self'", "data:", "blob:", "https://generativelanguage.googleapis.com"],
  "worker-src": ["'self'"],
  "font-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'none'"],
}

async function* htmlFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(entryPath)
    else if (entry.name.endsWith(".html")) yield entryPath
  }
}

function sha256Source(text) {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`
}

let pages = 0
for await (const file of htmlFiles(OUT_DIR)) {
  const html = await readFile(file, "utf8")
  if (html.includes('http-equiv="Content-Security-Policy"')) continue

  const hashes = new Set()
  for (const [, attributes, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc=/.test(attributes) && body.length > 0) hashes.add(sha256Source(body))
  }

  const policy = { ...basePolicy, "script-src": [...basePolicy["script-src"], ...hashes] }
  const content = Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ")
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${content}"/>`

  const charset = html.match(/<meta charSet="utf-8"\/>/i)
  if (!charset) throw new Error(`csp: no <meta charSet> anchor in ${file}`)
  const insertAt = charset.index + charset[0].length
  await writeFile(file, html.slice(0, insertAt) + metaTag + html.slice(insertAt))
  pages++
}

if (pages === 0) throw new Error(`csp: no HTML files found in ${OUT_DIR}`)
console.log(`csp: added Content-Security-Policy to ${pages} page(s)`)
