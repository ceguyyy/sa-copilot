import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidView } from './MermaidView'

/** GFM markdown with ```mermaid blocks rendered as diagrams. Raw HTML is not rendered. */
export function Markdown({ children, className, evidenceLinks = false }: { children: string; className?: string; evidenceLinks?: boolean }) {
  return (
    <div className={clsx('prose prose-sm prose-doc max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: cls, children: code, ...rest }) {
            if (cls?.includes('language-mermaid')) return <MermaidView source={String(code).trim()} className="not-prose my-4" />
            return (
              <code className={cls} {...rest}>
                {code}
              </code>
            )
          },
          table: ({ children: c }) => (
            <div className="overflow-x-auto">
              <table>{c}</table>
            </div>
          ),
        }}
      >
        {evidenceLinks ? children.replace(/\[(source|document):([a-f0-9-]{36})(?::v(\d+))?\]/g, (_, kind, id, version) => `[${kind === 'source' ? 'Source' : 'Document'} ${id.slice(0, 8)}${version ? ` v${version}` : ''}](#document-evidence)`) : children}
      </ReactMarkdown>
    </div>
  )
}
