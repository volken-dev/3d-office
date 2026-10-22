import React from "react"
import ReactMarkdown, { type Components, defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import { ExternalLink } from "@/components/ExternalLink"
import { cn } from "@/lib/utils"

const REMARK_PLUGINS = [remarkGfm]
const SAFE_PROTOCOL = /^(https?:|mailto:)/i

/**
 * Model output is untrusted (prompt injection): never auto-load remote images, which would leak
 * context through the URL, and open links in a new tab so the unpersisted session survives a click.
 */
const COMPONENTS: Components = {
  a: ({ node: _node, href, children, ...props }) =>
    href ? (
      <ExternalLink {...props} href={href} className="underline underline-offset-2">
        {children}
      </ExternalLink>
    ) : (
      children
    ),
  img: ({ alt }) => <span className="text-muted-foreground">[image{alt ? `: ${alt}` : ""}]</span>,
}

function urlTransform(url: string): string {
  const safe = defaultUrlTransform(url)
  return SAFE_PROTOCOL.test(safe) || safe.startsWith("#") ? safe : ""
}

interface MarkdownProps {
  children: string
  className?: string
}

/** Renders LLM or user Markdown with GFM, no raw HTML, no remote images and only http(s)/mailto links. */
export const Markdown = React.memo(function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={COMPONENTS}
        urlTransform={urlTransform}
        skipHtml
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
