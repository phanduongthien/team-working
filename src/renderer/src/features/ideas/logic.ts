export type IssueKind = 'idea' | 'bug'

export type BugInfo = { version: string; os: string; logTail: string }

export type IssueDraft = { title: string; body: string; labels: string[] }

/** Bản nháp khi không nhờ trợ lý: giữ nguyên lời người dùng, gắn nhãn mặc định theo loại. */
export function manualDraft(kind: IssueKind, title: string, description: string): IssueDraft {
  return { title: title.trim(), body: description.trim(), labels: [kind === 'idea' ? 'enhancement' : 'bug'] }
}

/** Ghép thông tin môi trường + đoạn log (đã che) vào cuối nội dung báo lỗi. */
export function composeIssueBody(body: string, info: BugInfo | null, headings: { env: string; log: string }): string {
  if (!info) return body.trim()
  const parts = [body.trim(), '', `### ${headings.env}`, `- Team Working ${info.version}`, `- ${info.os}`]
  if (info.logTail.trim()) parts.push('', `### ${headings.log}`, '```', info.logTail.trim(), '```')
  return parts.join('\n')
}

export function kindFromParam(value: string | null): IssueKind {
  return value === 'bug' ? 'bug' : 'idea'
}
