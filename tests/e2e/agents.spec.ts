import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Kết nối agent: test đóng vai Claude Code (SDK MCP client thật) kết nối vào app.
// Cần đăng ký Ctrl+Alt+Q — đóng mọi bản MMC studio khác đang mở trước khi chạy.
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
const ECHO = join(__dirname, 'fixtures', 'echo-mcp.cjs')
let app: ElectronApplication
let page: Page
let userData: string
let url = ''
let token = ''

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-agents-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    // Không đặt E2E_REAL_CLI → Mizuki trả lời giả lập, không tốn hạn mức Claude.
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData, ...(process.env.E2E_REAL_CLI === '1' ? {} : { MMC_FAKE_AGENT_ANSWER: '1' }) }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
  await goTo(page, '#/agents', page.getByRole('heading', { name: /Kết nối agent/ }))
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const hotkey = (): Promise<boolean> => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Alt+Q'))

async function connect(t = token): Promise<Client> {
  const client = new Client({ name: 'claude-code-giả', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${t}` } } }))
  return client
}
const textOf = (r: Awaited<ReturnType<Client['callTool']>>): string => (r.content as { text: string }[])[0]?.text ?? ''

test('mặc định tắt; bật → chỉ nghe 127.0.0.1, giữ phím dừng khẩn cấp', async () => {
  await expect(page.getByTestId('agents-server-status')).toContainText('Đang tắt')
  expect(await hotkey()).toBe(false)
  await page.getByTestId('agents-enable').check()
  await expect(page.getByTestId('agents-server-status')).toContainText(/Đang chạy: http:\/\/127\.0\.0\.1:\d+\/mcp/)
  url = /http:\/\/127\.0\.0\.1:\d+\/mcp/.exec(await page.getByTestId('agents-server-status').innerText())![0]
  expect(await hotkey()).toBe(true)
})

test('tạo token: chỉ hiện một lần, kèm lệnh cho Claude Code / Claude Desktop', async () => {
  await page.getByLabel('Tên agent').fill('Claude Code')
  await page.getByTestId('agents-add').click()
  const dialog = page.getByTestId('agent-token')
  await expect(dialog).toContainText('chỉ hiện MỘT lần')
  token = (await page.getByTestId('agent-token-value').innerText()).trim()
  expect(token).toMatch(/^mzk_/)
  await expect(dialog).toContainText('claude mcp add-json mizuki')
  await expect(dialog).toContainText('MIZUKI_TOKEN')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('agent-client')).toContainText('Chưa kết nối lần đầu')
})

test('sai token → bị từ chối, không hỏi người dùng', async () => {
  await expect(connect('mzk_sai')).rejects.toThrow()
  await expect(page.getByTestId('agent-pairing')).toHaveCount(0)
})

test('lần đầu kết nối → app hỏi Cho phép; sau đó dùng được tool', async () => {
  const connecting = connect()
  const pairing = page.getByTestId('agent-pairing')
  await expect(pairing).toContainText('"Claude Code" muốn dùng trợ lý của bạn')
  await pairing.getByRole('button', { name: 'Cho phép' }).click()
  const mcp = await connecting
  expect((await mcp.listTools()).tools.map((t) => t.name).sort()).toEqual(['ask_mizuki', 'get_task', 'list_tasks', 'submit_task'])
  await expect(page.getByTestId('agent-client')).toContainText('Đã cho phép')
  await mcp.close()
})

test('ask_mizuki → trả lời và ghi lịch sử (E2E_REAL_CLI=1: Claude thật; mặc định: trả lời giả lập)', async () => {
  const mcp = await connect()
  const r = await mcp.callTool({ name: 'ask_mizuki', arguments: { message: 'Trả lời đúng một từ: "pong".' } })
  expect(r.isError).toBeFalsy()
  if (process.env.E2E_REAL_CLI === '1') expect(textOf(r).toLowerCase()).toContain('pong')
  else expect(textOf(r)).toContain('Mizuki (giả lập) đã nhận')
  await expect(page.getByTestId('agent-exchange').first()).toContainText('xong')
  await page.getByTestId('agent-exchange').first().click()
  await expect(page.getByTestId('agents-history')).toContainText('Trả lời đúng một từ')
  await mcp.close()
})

test('chạm giới hạn/giờ → agent nhận lỗi kèm giờ gọi lại; app hiện thông báo nhỏ', async () => {
  await page.getByLabel('Yêu cầu / giờ / agent').fill('1')
  await page.getByTestId('agents-server').getByRole('button', { name: 'Lưu' }).click()
  const mcp = await connect()
  const r = await mcp.callTool({ name: 'list_tasks', arguments: {} }) // không tính hạn mức
  expect(r.isError).toBeFalsy()
  const limited = await mcp.callTool({ name: 'submit_task', arguments: { title: 'Việc thứ 2', instructions: 'quá giới hạn' } })
  expect(limited.isError).toBe(true)
  expect(textOf(limited)).toMatch(/giới hạn 1 yêu cầu\/giờ\. Thử lại sau \d+ phút \(lúc \d\d:\d\d\)/)
  await expect(page.getByTestId('agent-notice-rate_limited')).toContainText('"Claude Code" chạm giới hạn')
  await mcp.close()
  await page.getByLabel('Yêu cầu / giờ / agent').fill('20')
  await page.getByTestId('agents-server').getByRole('button', { name: 'Lưu' }).click()
})

test('nút dừng khẩn cấp của Điều khiển máy tính (cùng Ctrl+Alt+Q) cũng ngắt kết nối agent', async () => {
  // Bật điều khiển máy tính để có nút Dừng khẩn cấp dùng chung phím.
  await goTo(page, '#/computer', page.getByTestId('computer-enable'))
  await page.getByTestId('computer-enable').click()
  await page.getByLabel('Tôi đã đọc và hiểu các điểm trên.').check()
  await page.getByRole('button', { name: 'Bật tính năng' }).click()
  await page.getByTestId('emergency-stop').click()
  await expect(page.getByTestId('agent-notice-stopped')).toBeVisible()
  await expect(connect()).rejects.toThrow()
  await goTo(page, '#/agents', page.getByTestId('agents-enable'))
  await expect(page.getByTestId('agents-enable')).not.toBeChecked()
  await expect(page.getByTestId('agents-server-status')).toContainText('Đang tắt')
})

test('bật lại; thu hồi quyền → agent bị từ chối; Ngắt tất cả → tắt server', async () => {
  await page.getByTestId('agents-enable').check()
  await expect(page.getByTestId('agents-server-status')).toContainText('Đang chạy')
  await page.getByTestId('agent-client').getByRole('button', { name: 'Thu hồi quyền' }).click()
  await expect(page.getByTestId('agent-client')).toHaveCount(0)
  await expect(connect()).rejects.toThrow()
  await page.getByTestId('agents-stop-all').click()
  await expect(page.getByTestId('agents-server-status')).toContainText('Đang tắt')
})

test('MCP client: thêm server, giá trị bí mật không hiện lại, bật/tắt, xoá', async () => {
  await page.getByTestId('mcp-add').click()
  await page.getByLabel(/Tên \(chữ thường/).fill('echo')
  await page.getByLabel('Lệnh').fill(process.execPath)
  await page.getByLabel(/Tham số/).fill(ECHO)
  await page.getByLabel(/Biến môi trường bí mật/).fill('API_KEY=sieu-bi-mat')
  await page.getByTestId('mcp-save').click()
  const row = page.getByTestId('mcp-server')
  await expect(row).toContainText('echo')
  await expect(row).toContainText('bí mật: API_KEY')
  await expect(page.getByTestId('mcp-servers')).not.toContainText('sieu-bi-mat')

  // Tên dành riêng bị chặn.
  await page.getByTestId('mcp-add').click()
  await page.getByLabel(/Tên \(chữ thường/).fill('mmc')
  await page.getByLabel('Lệnh').fill('x')
  await page.getByTestId('mcp-save').click()
  await expect(page.getByTestId('mcp-form')).toContainText('app dùng riêng')
  await page.getByTestId('mcp-form').getByRole('button', { name: 'Hủy' }).click()
})

// Gọi Claude thật: trợ lý dùng tool echo → app hỏi duyệt → "Luôn cho phép" → lần sau không hỏi nữa.
test('chat thật: tool MCP phải duyệt; "luôn cho phép" ghi nhớ và thu hồi được', async () => {
  test.skip(process.env.E2E_REAL_CLI !== '1', 'Đặt E2E_REAL_CLI=1 để gọi Claude thật')
  await goTo(page, '#/', page.getByRole('textbox', { name: /Nhắn cho/ }))
  const box = page.getByRole('textbox', { name: /Nhắn cho/ })
  await box.fill('Gọi tool echo của MCP server "echo" với text "xin-chao-42", rồi trả lời đúng kết quả tool trả về.')
  await box.press('Enter')
  const approval = page.getByTestId('mcp-approval')
  await expect(approval).toContainText('"echo" của MCP server "echo"', { timeout: 120_000 })
  await expect(page.getByTestId('mcp-approval-input')).toContainText('xin-chao-42')
  await approval.getByRole('button', { name: 'Luôn cho phép công cụ này' }).click()
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 120_000 })
  expect(await page.locator('.markdown').last().innerText()).toContain('ECHO:xin-chao-42')

  await goTo(page, '#/agents', page.getByTestId('mcp-servers'))
  const allowed = page.getByTestId('mcp-always-allowed')
  await expect(allowed).toContainText('echo')
  await allowed.getByRole('button', { name: /Thu hồi echo/ }).click()
  await expect(allowed).toHaveCount(0)
})
