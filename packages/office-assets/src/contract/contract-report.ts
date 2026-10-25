/** A file's line in the checker's summary: its size and what it costs to draw. */
export type FileSummary = {
  name: string
  passed: boolean
  bytes: number
  triangles: number
  drawCalls: number
}

function listOrNone(values: Iterable<string | number>): string {
  return [...values].join(", ") || "(none)"
}

/**
 * Collects contract breaks for one run of the checker, each tagged with the file being checked, so
 * the checker can report every break at once instead of stopping at the first.
 */
export class ContractReport {
  readonly errors: string[] = []
  readonly summaries: FileSummary[] = []
  file = ""

  /** Records a break against the current file. */
  fail(message: string): void {
    this.errors.push(`${this.file}: ${message}`)
  }

  /** Records what is missing from, and what is not in, an exact set the contract expects. */
  sameSet(
    what: string,
    expected: Iterable<string | number>,
    found: Iterable<string | number>,
  ): void {
    const expectedSet = new Set(expected)
    const foundSet = new Set(found)
    const missing = [...expectedSet].filter((value) => !foundSet.has(value))
    const unexpected = [...foundSet].filter((value) => !expectedSet.has(value))
    if (missing.length) this.fail(`${what} missing: ${listOrNone(missing)}`)
    if (unexpected.length) this.fail(`${what} not in contract: ${listOrNone(unexpected)}`)
  }

  /** Formats a list for a message, `(none)` when empty. */
  list(values: Iterable<string | number>): string {
    return listOrNone(values)
  }
}
