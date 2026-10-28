/**
 * Repo GitHub của app — một chỗ cấu hình duy nhất, đọc lúc build từ VITE_GITHUB_REPO="owner/repo"
 * (cùng giá trị dùng cho electron-builder publish qua GH_OWNER/GH_REPO trong CI).
 */
export type GithubRepo = { owner: string; repo: string }

const PART = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/

export function parseGithubRepo(value: string | undefined): GithubRepo | null {
  const [owner, repo, extra] = (value ?? '').trim().split('/')
  if (extra !== undefined || !owner || !repo || !PART.test(owner) || !PART.test(repo)) return null
  return { owner, repo }
}

/** GitHub cắt URL quá dài; giữ body đủ ngắn để trình duyệt mở được. */
const MAX_BODY = 6000

export function newIssueUrl(repo: GithubRepo, issue: { title: string; body: string; labels?: string[] }): string {
  const body = issue.body.length > MAX_BODY ? `${issue.body.slice(0, MAX_BODY)}\n\n…(đã cắt bớt)` : issue.body
  const params = new URLSearchParams({ title: issue.title.slice(0, 200), body })
  if (issue.labels?.length) params.set('labels', issue.labels.join(','))
  return `https://github.com/${repo.owner}/${repo.repo}/issues/new?${params.toString()}`
}

/** Che đường dẫn thư mục người dùng (C:\Users\<tên>\…) và email trước khi đưa log vào báo lỗi. */
export function sanitizeLog(text: string): string {
  return text
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+/gi, '%USERPROFILE%')
    .replace(/\/(?:home|Users)\/[^/\s"']+/g, '~')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
}
