---
description: Finish the current task — done-gate, branch, intentional commit, push, PR with Closes #N and a Verified section, tagged at creation.
argument-hint: "<issue-number>"
allowed-tools: Bash, Read, Edit
---

Finish the current unit of work (issue #$ARGUMENTS). One task per session → one PR to `main`.

1. Run `/health-check` (all gates). Do not proceed while anything is red. Then make sure the change has been exercised for real (RULES.md rule 60): the app in a browser via `bun run dev`, or the API over HTTP. If it hasn't, do that before shipping.
2. If on `main`, create a branch with the right prefix (`feat/`, `fix/`, `refactor/`, `perf/`, `chore/`, `docs/`) and a short slug.
3. Stage intentionally (show `git status` first; don't blanket-add). Commit with a Conventional Commits message (optional scope `web`/`api`/`shared`/`repo`), ending with the `Co-Authored-By:` trailer Claude Code supplies for the current model (don't copy a model name from an old commit).
4. If this closes an `AUDIT.md` item, flip its Status in the same commit.
5. Push and open the PR with `gh pr create` targeting `main`, filling `.github/pull_request_template.md`: `Closes #$ARGUMENTS` (or `Refs #N` when the work closes nothing), the AUDIT ids addressed, and a **Verified** section saying what was run and what was seen. Tag at creation, mirroring the issue: its `Type:` label and `--assignee isaac-dev0`.
6. Flag any tech debt you spotted as a new `Type: Tech Debt` issue.

Don't push to `main` directly.
