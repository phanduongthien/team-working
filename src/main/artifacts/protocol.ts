import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArtifactType, Theme } from '@shared/artifacts'
import type { ArtifactService } from './service'

export const ARTIFACT_SCHEME = 'mmc-artifact'

/** Không mạng (connect-src 'none'), ảnh chỉ data:/blob:, script chỉ inline + thư viện đóng gói sẵn. */
export const ARTIFACT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${ARTIFACT_SCHEME}:`,
  `style-src 'unsafe-inline' ${ARTIFACT_SCHEME}:`,
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'"
].join('; ')

const LIBS: Record<string, string> = {
  'runtime.js': 'text/javascript',
  'runtime.css': 'text/css',
  'chart.umd.js': 'text/javascript',
  'mermaid.min.js': 'text/javascript'
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Trang của một phiên bản artifact. Loại html: chính HTML trợ lý viết (vẫn chịu CSP + sandbox). */
export function artifactDocument(
  type: ArtifactType,
  title: string,
  content: string,
  themes: Theme[]
): string {
  const runtime = `<script src="${ARTIFACT_SCHEME}://lib/runtime.js"></script>`
  const meta = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">`
  if (type === 'html') {
    const head = `${meta}${runtime}`
    return /<head[^>]*>/i.test(content)
      ? content.replace(/<head[^>]*>/i, (m) => m + head)
      : `<!doctype html><html><head>${head}</head><body>${content}</body></html>`
  }
  // JSON trong <script> — chặn "</script>" thoát ra bằng cách mã hoá "<".
  const data = JSON.stringify({ type, title, content, themes }).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="vi"><head>${meta}<title>${escapeHtml(title)}</title><link rel="stylesheet" href="${ARTIFACT_SCHEME}://lib/runtime.css"></head><body><div id="root"></div><script type="application/json" id="mmc-data">${data}</script>${runtime}</body></html>`
}

export type ProtocolDeps = {
  service: Pick<ArtifactService, 'content'>
  libDir: string
  themes(): Theme[]
}

/**
 * mmc-artifact://view/<id>/<phiên bản> → trang artifact; mmc-artifact://lib/<file> → thư viện đóng gói.
 * Mọi phản hồi kèm CSP ở header (không chỉ thẻ meta).
 */
export async function handleArtifactRequest(url: string, deps: ProtocolDeps): Promise<Response> {
  const u = new URL(url)
  const headers = {
    'Content-Security-Policy': ARTIFACT_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  }
  if (u.hostname === 'lib') {
    const file = u.pathname.replace(/^\//, '')
    if (!LIBS[file]) return new Response('not found', { status: 404, headers })
    return new Response(await readFile(join(deps.libDir, file)), {
      headers: { ...headers, 'Content-Type': LIBS[file] }
    })
  }
  const m = /^\/([0-9a-f-]{36})\/(\d+)$/i.exec(u.pathname)
  if (u.hostname !== 'view' || !m) return new Response('not found', { status: 404, headers })
  const c = deps.service.content(m[1], Number(m[2]))
  if (!c) return new Response('not found', { status: 404, headers })
  return new Response(
    artifactDocument(c.artifact.type, c.artifact.title, c.version.content, deps.themes()),
    {
      headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' }
    }
  )
}
