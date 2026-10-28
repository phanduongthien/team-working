import { z } from 'zod'
import { extractJsonBlock } from '../memory/extraction'

export const ISSUE_LABELS = ['enhancement', 'bug', 'ui', 'ai', 'team', 'learning', 'time', 'docs'] as const

export type IssueDraft = { title: string; body: string; labels: string[] }

export function buildIssuePrompt(input: { title: string; description: string; kind: 'idea' | 'bug'; language: 'vi' | 'en' }): string {
  return [
    `Chuẩn hóa ${input.kind === 'idea' ? 'ý tưởng tính năng' : 'báo lỗi'} sau thành một GitHub issue theo hướng dẫn.`,
    `Viết bằng ${input.language === 'vi' ? 'tiếng Việt' : 'English'}. Chỉ trả về MỘT khối JSON hợp lệ.`,
    '',
    input.title.trim() ? `Tiêu đề người dùng đặt: ${input.title.trim()}` : '',
    '## Nội dung người dùng viết',
    input.description.trim()
  ]
    .filter((l) => l !== '')
    .join('\n')
}

const output = z.object({
  type: z.literal('issue'),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  labels: z.array(z.string()).default([])
})

/** Parse + làm sạch: nhãn ngoài danh sách bị bỏ, luôn có nhãn mặc định theo loại. */
export function parseIssue(text: string, kind: 'idea' | 'bug'): IssueDraft | null {
  const parsed = output.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  const allowed = new Set<string>(ISSUE_LABELS)
  const labels = [...new Set([kind === 'idea' ? 'enhancement' : 'bug', ...parsed.data.labels.filter((l) => allowed.has(l))])]
  return { title: parsed.data.title.replace(/\.$/, ''), body: parsed.data.body, labels }
}
