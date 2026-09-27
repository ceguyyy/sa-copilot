import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidView } from './MermaidView'

/** GFM markdown with ```mermaid blocks rendered as diagrams. Raw HTML is not rendered. */
export function Markdown({ children, className }: { children: string; className?: string }) {
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
        {children}
      </ReactMarkdown>
    </div>
  )
}
