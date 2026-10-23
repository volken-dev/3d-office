import fs from "node:fs"

/**
 * PostToolUse hook: after an Edit/Write to a UI source file, flag em/en-dashes,
 * bullet glyphs, emoji, exclamation marks and internal audit ids (REL-07,
 * ARCH-03) that appear INSIDE string literals: the mechanical half of the
 * user-facing copy rules in .claude/RULES.md section 9. Scoped to
 * apps/web/src/interface and apps/web/src/components, where string literals
 * are predominantly user-facing; prompt text in src/core and src/data is not
 * UI copy. Import lines are skipped, as are masked-value placeholders and
 * Tailwind important modifiers (`h-auto!`) on className/cn/cva lines. JSX
 * text is not a string literal, so /ui-review still owns that half. Exits 2 with a note so the edit lands and
 * Claude can self-correct; exits 0 silently on a clean file or any unexpected
 * error. Adapted from Volken's hook of the same name.
 */

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

let payload
try {
  payload = JSON.parse(readStdin())
} catch {
  process.exit(0)
}

const filePath = payload?.tool_input?.file_path
if (!filePath) process.exit(0)

const normalisedPath = String(filePath).replace(/\\/g, "/")
if (/\.test\.tsx?$/.test(normalisedPath)) process.exit(0)

const isUserFacing = /\/apps\/web\/src\/(interface|components)\/.*\.(tsx|ts)$/.test(normalisedPath)
if (!isUserFacing) process.exit(0)

let content
try {
  content = fs.readFileSync(filePath, "utf8")
} catch {
  process.exit(0)
}

const DASH = /[—–]/
const BULLET = /[•●▪◦‣·]/
const MASK_ONLY = /^["'`][•●*]+["'`]$/
const CLASS_LIST_LINE = /\bclassName=|\bcn\(|\bcva\(/
const EMOJI = /\p{Extended_Pictographic}/u
const EXCLAMATION = /[A-Za-z0-9)]![\s"'`]|[A-Za-z0-9)]!$/
const AUDIT_ID = /\b(REL|SEC|ARCH|PERF|UX|CODE|MIG)-\d{2}\b/
const STRING = /"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g
const IMPORT_LINE = /^\s*(import\b|export\b.*\bfrom\s)|\brequire\(/

const checks = [
  {
    pattern: DASH,
    message: "em/en-dash in a user-facing string: use a comma, full stop or parentheses",
  },
  {
    pattern: BULLET,
    skipLiteral: (literal) => MASK_ONLY.test(literal),
    message: "bullet glyph in a string: use list markup, not a character",
  },
  { pattern: EMOJI, message: "emoji in a user-facing string" },
  {
    pattern: EXCLAMATION,
    skipLine: (line) => CLASS_LIST_LINE.test(line),
    message: "exclamation mark in a user-facing string: warmth comes from words",
  },
  {
    pattern: AUDIT_ID,
    message: "internal audit id in a string: keep those out of user-facing copy",
  },
]

const findings = []
const lines = content.split(/\r?\n/)
for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
  if (IMPORT_LINE.test(lines[lineIndex])) continue
  const strings = lines[lineIndex].match(STRING)
  if (!strings) continue
  for (const check of checks) {
    if (check.skipLine?.(lines[lineIndex])) continue
    const isFlagged = strings.some(
      (literal) => check.pattern.test(literal) && !check.skipLiteral?.(literal),
    )
    if (isFlagged) {
      findings.push(`${lineIndex + 1}: ${check.message}`)
    }
  }
}

if (findings.length === 0) process.exit(0)

const relativePath = normalisedPath.replace(/^.*?(apps\/.*)$/, "$1")
process.stderr.write(
  `Copy check: possible user-facing-rule issues in ${relativePath}:\n` +
    findings.map((finding) => `  ${finding}`).join("\n") +
    "\nRule (.claude/RULES.md section 9): no dashes, bullet glyphs, emoji, exclamation marks or audit ids in user-facing copy. Fix, or confirm it is not user-facing.\n",
)
process.exit(2)
