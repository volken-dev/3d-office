import type React from "react"

type ExternalLinkProps = Omit<React.ComponentProps<"a">, "target" | "rel">

/** Link that always opens in a new tab without exposing the opener or the referrer. */
export function ExternalLink({ children, ...props }: ExternalLinkProps) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  )
}
