import { Check, Copy } from 'lucide-react'
import { isValidElement, memo, useRef, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Button } from '@renderer/components/ui/button'

function CodeBlock({ children }: ComponentProps<'pre'>) {
  const { t } = useTranslation()
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const codeClass = isValidElement<{ className?: string }>(children) ? children.props.className : ''
  const language = /language-([\w-]+)/.exec(codeClass ?? '')?.[1] ?? ''

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(ref.current?.textContent ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group overflow-hidden rounded-md border bg-[#0d1117] text-[#e6edf3]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1 text-xs text-white/60">
        <span>{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-white/70 hover:bg-white/10 hover:text-white"
          onClick={copy}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t('actions.copied') : t('actions.copy')}
        </Button>
      </div>
      <pre ref={ref} className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  )
}

/** Markdown của tin nhắn: GFM (bảng, checklist), highlight code, nút copy, link mở ngoài app. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
