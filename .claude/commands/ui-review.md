---
description: Review changed UI files against the house UI rules — shadcn-only, fix-primitive-not-override, theme tokens, no AI-slop, state coverage, copy, a11y. Read-only.
argument-hint: "[files...]  (default: changed apps/web UI files vs main)"
allowed-tools: Read, Grep, Bash
---

Review UI against RULES.md sections 8 and 9. Default scope: changed files under `apps/web/src/interface` and `apps/web/src/components` (`git diff --name-only main...HEAD` plus unstaged changes) — or the files named in `$ARGUMENTS`. Read `apps/web/src/app/globals.css` (the tokens) first.

For each file, report violations as `file:line` with a concrete fix. Do not edit unless I ask.

**Primitives & variants**
- Composes `components/ui/*` shadcn primitives; NO raw `<button>/<input>/<select>/<textarea>` for interactive elements. Every modal is a `Dialog` / `AlertDialog`; destructive confirms use `ConfirmDialog`.
- Visual variation expressed as `cva` `variant`/`size` props on the primitive, NOT appearance `className` overrides at the call site (layout classes like margins/width/grid placement are fine). A look that appears twice becomes a variant on the primitive.

**Tokens**
- Colours from `globals.css` tokens only (`primary`, `user`, `success`, `destructive`, `muted`, ...). No raw hex, no new hard-coded `zinc-*` (AUDIT MIG-07). `style={{}}` only for computed values.
- Text floor is 11px; no off-scale arbitrary sizes.

**Anti-slop (these read as AI-generated — flag them)**
- Accent border-stripes, gimmick coloured bars, ALL-CAPS micro-labels (`uppercase tracking-widest`), hero metrics, charts of a single data point, decorative icons, the same fact shown twice on one surface.

**State & behaviour**
- Zustand via selectors (`useShallow` for objects), never whole-store subscriptions; per-frame data never through a store.
- Loading = skeletons; empty = helpful text + primary action; async results = toasts (sonner); errors say what happened and what to do next. Dismissing a dialog never destroys data.
- Timers and listeners are cleaned up on unmount.

**Copy & a11y**
- No em-dashes, bullet glyphs, emoji, exclamation marks or audit ids in user-facing strings OR JSX text. (The copy hook catches string literals; you catch the JSX-text cases it can't.) Buttons verb-first, sentence case.
- Every interactive element is keyboard-reachable with a visible focus ring; icon-only buttons have a label; `aria-label`s don't interpolate sensitive values (the API key).
- LLM output renders through `components/markdown.tsx` only.

End with a short verdict: clean, or a prioritised fix list. Read-only unless I ask you to apply fixes.
