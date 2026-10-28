import { cn } from '@renderer/lib/utils'

/** Hiển thị unified diff: dòng thêm xanh, dòng xóa đỏ, đầu hunk xám. Bỏ phần header ---/+++/===. */
export function DiffView({ patch, className }: { patch: string; className?: string }) {
  const lines = patch.split('\n').filter((l) => !/^(Index:|={5,}|---|\+\+\+|\\ No newline)/.test(l))
  return (
    <pre className={cn('max-h-[50vh] overflow-auto rounded-md border bg-muted/30 py-2 font-mono text-xs leading-5', className)} data-testid="diff-view">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'px-3 whitespace-pre-wrap',
            line.startsWith('+') && 'bg-green-500/15 text-green-800 dark:text-green-300',
            line.startsWith('-') && 'bg-red-500/15 text-red-800 dark:text-red-300',
            line.startsWith('@@') && 'text-muted-foreground'
          )}
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}
