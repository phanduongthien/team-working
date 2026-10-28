import { createServer, type Server } from 'node:http'
import { OAUTH_CALLBACK_PORT } from '@shared/appConfig'

export type OAuthResult = { code: string } | { error: string }

const TIMEOUT_MS = 5 * 60 * 1000

/**
 * Chỉ mở link đăng nhập thuộc đúng project Supabase đã cấu hình, trỏ tới endpoint authorize.
 * Tránh renderer (nếu bị lợi dụng) mở link tùy ý bằng quyền của main.
 */
export function isAllowedAuthorizeUrl(url: string, supabaseUrl: string | undefined): boolean {
  if (!supabaseUrl) return false
  try {
    const target = new URL(url)
    const base = new URL(supabaseUrl)
    return target.origin === base.origin && target.pathname === '/auth/v1/authorize'
  } catch {
    return false
  }
}

/** Đọc ?code= / ?error= từ request callback. */
export function parseCallback(requestUrl: string): OAuthResult | null {
  const url = new URL(requestUrl, `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`)
  if (url.pathname !== '/auth/callback') return null
  const code = url.searchParams.get('code')
  if (code) return { code }
  const error = url.searchParams.get('error_description') ?? url.searchParams.get('error')
  return { error: error ?? 'missing_code' }
}

const page = (title: string, body: string): string => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f7f7f9;color:#222}
main{text-align:center;max-width:420px}h1{font-size:20px}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`

const SUCCESS = page('Đăng nhập thành công', 'Bạn có thể đóng tab này và quay lại Team Working.')
const FAILURE = page('Đăng nhập chưa thành công', 'Hãy quay lại Team Working và thử lại.')

/**
 * Mở cổng 127.0.0.1:47823 chờ đúng MỘT callback OAuth rồi đóng ngay.
 * Chỉ một lượt đăng nhập tại một thời điểm; lượt mới hủy lượt cũ.
 */
export class OAuthLoopback {
  private current: { server: Server; finish: (r: OAuthResult) => void } | null = null

  async waitForCode(openBrowser: () => Promise<void>): Promise<OAuthResult> {
    this.cancel()
    return new Promise<OAuthResult>((resolve) => {
      let done = false
      const server = createServer((req, res) => {
        const result = parseCallback(req.url ?? '/')
        if (!result) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('code' in result ? SUCCESS : FAILURE)
        finish(result)
      })
      const timer = setTimeout(() => finish({ error: 'timeout' }), TIMEOUT_MS)
      const finish = (result: OAuthResult): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        server.close()
        server.closeAllConnections?.()
        if (this.current?.server === server) this.current = null
        resolve(result)
      }
      this.current = { server, finish }

      server.once('error', (err: NodeJS.ErrnoException) =>
        finish({ error: err.code === 'EADDRINUSE' ? 'port_in_use' : err.message })
      )
      server.listen(OAUTH_CALLBACK_PORT, '127.0.0.1', () => {
        openBrowser().catch((err: Error) => finish({ error: err.message }))
      })
    })
  }

  cancel(): void {
    this.current?.finish({ error: 'cancelled' })
  }
}
