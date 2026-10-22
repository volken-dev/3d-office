// Injects a Content-Security-Policy <meta> into every exported HTML page.
// GitHub Pages cannot send response headers and `output: 'export'` cannot use nonces, so each inline
// bootstrap script Next emits is allowed by its sha256 hash instead of 'unsafe-inline'.
// Meta-delivered CSP ignores frame-ancestors, report-uri and sandbox; those need real headers.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.argv[2] ?? 'out');

const basePolicy = {
  'default-src': ["'self'"],
  // 'wasm-unsafe-eval': the Draco mesh decoder compiles WebAssembly.
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  // Inline style attributes (React, React Flow) and injected <style> tags (sonner).
  'style-src': ["'self'", "'unsafe-inline'"],
  // GLTFLoader decodes embedded textures through blob: URLs, fetched with fetch() by ImageBitmapLoader.
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'data:', 'blob:', 'https://generativelanguage.googleapis.com'],
  // DRACOLoader spawns its decoder worker from a Blob URL.
  'worker-src': ["'self'", 'blob:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

let pages = 0;
for await (const file of htmlFiles(OUT_DIR)) {
  const html = await readFile(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;

  const hashes = new Set();
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\bsrc=/.test(attrs) && body.length > 0) hashes.add(sha256(body));
  }

  const policy = { ...basePolicy, 'script-src': [...basePolicy['script-src'], ...hashes] };
  const content = Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${content}"/>`;

  // The policy only governs elements parsed after it, so it must precede every <script>.
  const charset = html.match(/<meta charSet="utf-8"\/>/i);
  if (!charset) throw new Error(`csp: no <meta charSet> anchor in ${file}`);
  const at = charset.index + charset[0].length;
  await writeFile(file, html.slice(0, at) + meta + html.slice(at));
  pages++;
}

if (pages === 0) throw new Error(`csp: no HTML files found in ${OUT_DIR}`);
console.log(`csp: added Content-Security-Policy to ${pages} page(s)`);
