import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Đồng bộ trạng thái toàn app: mỗi thao tác chính → giao diện đổi trong vòng 1 GIÂY, không tải lại trang.
// Hai loại thay đổi:
//  - người dùng bấm trên trang (cập nhật lạc quan, lưu chạy sau);
//  - trạng thái đổi từ chỗ khác (gọi thẳng IPC trong trang — component không biết — hoặc agent ngoài gọi vào):
//    chỉ cơ chế sync:changed mới làm trang cập nhật được.
// Chạy được khi KHÔNG có Claude CLI: Gmail / Telegram / agent / chat đều giả lập.
// Cần đăng ký Ctrl+Alt+Q — đóng mọi bản MMC studio khác đang mở trước khi chạy.
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
const FAST = { timeout: 1_000 }
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-sync-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      TEAM_WORKING_USER_DATA: userData,
      MMC_FAKE_CHAT: '1',
      MMC_FAKE_GMAIL: '1',
      MMC_FAKE_TELEGRAM: '1',
      MMC_FAKE_VOICE: '1',
      MMC_FAKE_AGENT_ANSWER: '1'
    }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

type Api = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>
/** Gọi IPC thẳng từ trang (giả lập "thay đổi từ nơi khác": component đang hiện không hề biết). */
async function external(group: string, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ({ group, method, args }) => (window as unknown as { api: Api }).api[group][method](...args),
    { group, method, args }
  )
}

test('Cài đặt › Cập nhật: bấm → đổi ngay; đổi từ nơi khác → trang tự cập nhật', async () => {
  await goTo(page, '#/settings', page.getByTestId('update-auto-check'))
  const box = page.getByTestId('update-auto-check')
  await expect(box).toBeChecked()
  await box.uncheck()
  await expect(box).not.toBeChecked(FAST)
  await external('update', 'setSettings', { autoCheck: true, channel: 'stable' })
  await expect(box).toBeChecked(FAST)
})

test('Cài đặt › Chat biểu cảm: chọn mức → đổi ngay; đổi từ nơi khác → tự cập nhật', async () => {
  const mode = page.getByTestId('express-mode')
  await mode.selectOption('high')
  await expect(mode).toHaveValue('high', FAST)
  await external('expressive', 'setSettings', { mode: 'off', max: 'high' })
  await expect(mode).toHaveValue('off', FAST)
})

test('Cài đặt › Giọng nói: bật/tắt ngay; đổi từ nơi khác → tự cập nhật', async () => {
  const box = page.getByTestId('voice-enable')
  const before = await box.isChecked()
  await box.setChecked(!before)
  await expect(box).toBeChecked({ checked: !before, ...FAST })
  const status = (await external('voice', 'status')) as { settings: Record<string, unknown> }
  await external('voice', 'setSettings', { ...status.settings, enabled: before })
  await expect(box).toBeChecked({ checked: before, ...FAST })
})

test('Cài đặt › Skill: ghi chú my-style đổi từ nơi khác → tự hiện; xoá ghi chú → biến mất ngay', async () => {
  await external('skills', 'setStyleNotes', ['Trả lời ngắn gọn, có ví dụ'])
  const saved = page.getByTestId('style-saved')
  await expect(saved).toContainText('Trả lời ngắn gọn, có ví dụ', FAST)
  await saved.getByRole('button').first().click()
  await expect(saved).toHaveCount(0, FAST)
})

test('Cài đặt › Skill: chép skill vào thư mục rồi quay lại app → tự hiện; bật/tắt ngay; gỡ từ nơi khác → biến mất', async () => {
  const dir = join(userData, 'skills', 'demo-dong-bo')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: demo-dong-bo\ndescription: Skill thử đồng bộ\n---\n\n# Demo\n')
  // Không có IPC nào báo — chỉ có lần hỏi lại khi cửa sổ được focus.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const toggle = page.getByTestId('skill-enable-demo-dong-bo')
  await expect(toggle).toBeChecked(FAST)
  await toggle.uncheck()
  await expect(toggle).not.toBeChecked(FAST)
  await external('skills', 'setEnabled', 'demo-dong-bo', true)
  await expect(toggle).toBeChecked(FAST)
  await external('skills', 'remove', 'demo-dong-bo')
  await expect(toggle).toHaveCount(0, FAST)
})

test('Gmail & Telegram: bật/tắt ngay; đổi từ nơi khác → tự cập nhật', async () => {
  await goTo(page, '#/connectors', page.getByTestId('gmail-enable'))
  const gmail = page.getByTestId('gmail-enable')
  await gmail.check()
  await expect(gmail).toBeChecked(FAST)
  await external('gmail', 'setEnabled', false)
  await expect(gmail).not.toBeChecked(FAST)
  await external('gmail', 'setEnabled', true)
  await expect(gmail).toBeChecked(FAST)

  const tg = page.getByTestId('tg-enable')
  await tg.check()
  await expect(tg).toBeChecked(FAST)
  await external('telegram', 'setEnabled', false)
  await expect(tg).not.toBeChecked(FAST)
})

test('Gmail: đổi tên tài khoản hiện ngay; lưu lỗi (tên trùng) → hoàn tác + báo lỗi', async () => {
  await page.getByTestId('gmail-client-id').fill('123-abc.apps.googleusercontent.com')
  await page.getByTestId('gmail-client-secret').fill('GOCSPX-test')
  await page.getByTestId('gmail-save').click()
  await page.getByTestId('gmail-add').click()
  const first = page.locator('[data-testid="gmail-account"][data-email="ban@example.com"]')
  await expect(first.getByTestId('gmail-connection')).toHaveAttribute('data-state', 'connected')
  await page.getByTestId('gmail-add').click()
  const second = page.locator('[data-testid="gmail-account"][data-email="sv@truong.example.edu"]')
  await expect(second.getByTestId('gmail-connection')).toHaveAttribute('data-state', 'connected')

  await first.getByTestId('gmail-account-label').fill('Cá nhân')
  await first.getByTestId('gmail-account-label').press('Enter')
  await expect(first.getByTestId('gmail-account-label')).toHaveValue('Cá nhân', FAST)
  const oldLabel = await second.getByTestId('gmail-account-label').inputValue()
  await second.getByTestId('gmail-account-label').fill('ca nhan')
  await second.getByTestId('gmail-account-label').press('Enter')
  await expect(second.getByRole('alert')).toContainText('đã dùng', FAST)
  await expect(second.getByTestId('gmail-account-label')).toHaveValue(oldLabel, FAST)

  // Bật/tắt cho trợ lý theo tài khoản: đổi ngay, và đổi từ nơi khác cũng hiện ngay.
  const enabled = first.getByTestId('gmail-account-enabled')
  await enabled.uncheck()
  await expect(enabled).not.toBeChecked(FAST)
  const status = (await external('gmail', 'status')) as { accounts: { id: string; email: string }[] }
  const acc = status.accounts.find((a) => a.email === 'ban@example.com')!
  await external('gmail', 'updateAccount', {
    id: acc.id,
    label: 'Cá nhân',
    enabled: true,
    skipSensitive: true,
    blockedSenders: []
  })
  await expect(enabled).toBeChecked(FAST)
})

test('Điều khiển máy tính (cần Ctrl+Alt+Q): bật từ nơi khác → trang tự cập nhật; tắt → đổi ngay', async () => {
  await goTo(page, '#/computer', page.getByTestId('computer-enable'))
  const box = page.getByTestId('computer-enable')
  await expect(box).not.toBeChecked()
  await external('computer', 'setEnabled', true, true)
  await expect(box).toBeChecked(FAST)
  await expect(page.getByTestId('hotkey-status')).toContainText('Đã sẵn sàng', FAST)
  await box.click()
  await expect(box).not.toBeChecked(FAST)
})

test('Kết nối agent (cần Ctrl+Alt+Q): bật ngay; lịch sử trao đổi hiện ngay khi agent gọi vào (không đợi làm mới 5 giây)', async () => {
  await goTo(page, '#/agents', page.getByTestId('agents-enable'))
  await page.getByTestId('agents-enable').check()
  await expect(page.getByTestId('agents-enable')).toBeChecked(FAST)
  await expect(page.getByTestId('agents-server-status')).toContainText(/Đang chạy: http:\/\/127\.0\.0\.1:\d+\/mcp/)
  const url = /http:\/\/127\.0\.0\.1:\d+\/mcp/.exec(await page.getByTestId('agents-server-status').innerText())![0]

  // Token tạo từ nơi khác → danh sách agent tự hiện.
  const { token } = (await external('agents', 'createClient', 'Agent đồng bộ')) as { token: string }
  await expect(page.getByTestId('agent-client')).toContainText('Agent đồng bộ', FAST)

  const connect = async (): Promise<Client> => {
    const client = new Client({ name: 'agent-dong-bo', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
    return client
  }
  await expect(connect()).rejects.toThrow()
  await page.getByTestId('agent-pairing').getByRole('button', { name: 'Cho phép' }).click()
  await expect(page.getByTestId('agent-client')).toContainText('Đã cho phép', FAST)

  const mcp = await connect()
  await expect(page.getByTestId('agent-exchange')).toHaveCount(0)
  await mcp.callTool({ name: 'ask_mizuki', arguments: { message: 'đồng bộ ngay' } })
  await expect(page.getByTestId('agent-exchange').first()).toContainText('xong', FAST)
  await mcp.close()

  // Thu hồi: biến mất ngay.
  await page.getByTestId('agent-revoke').click()
  await expect(page.getByTestId('agent-client')).toHaveCount(0, FAST)
  await page.getByTestId('agents-enable').uncheck()
  await expect(page.getByTestId('agents-enable')).not.toBeChecked(FAST)
})

test('MCP server: thêm từ nơi khác → hiện ngay; bật/tắt, xoá ngay', async () => {
  await goTo(page, '#/agents', page.getByTestId('mcp-servers'))
  await external('mcp', 'save', {
    name: 'echo-dong-bo',
    type: 'http',
    url: 'http://127.0.0.1:9/mcp',
    headers: {},
    env: {},
    enabled: true
  })
  const row = page.getByTestId('mcp-server').filter({ hasText: 'echo-dong-bo' })
  await expect(row).toBeVisible(FAST)
  await row.getByTestId('mcp-server-enabled').uncheck()
  await expect(row.getByTestId('mcp-server-enabled')).not.toBeChecked(FAST)
  const [server] = (await external('mcp', 'list')) as { id: string; enabled: boolean }[]
  expect(server.enabled).toBe(false)
  await external('mcp', 'setEnabled', server.id, true)
  await expect(row.getByTestId('mcp-server-enabled')).toBeChecked(FAST)
  await external('mcp', 'remove', server.id)
  await expect(row).toHaveCount(0, FAST)
})

test('Panel Artifacts: khôi phục phiên bản từ nơi khác → danh sách phiên bản tự cập nhật', async () => {
  const box = page.getByRole('textbox', { name: /Nhắn cho/ })
  await goTo(page, '#/', box)
  await box.fill('tạo bảng FAKE_ARTIFACT:sheet')
  await box.press('Enter')
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('message-assistant').last().getByTestId('artifact-chip').click()
  const version = page.getByTestId('artifact-version')
  await expect(version).toHaveValue('1')

  const [conv] = (await external('conversations', 'list')) as { id: string }[]
  const [artifact] = (await external('artifacts', 'list', conv.id)) as { id: string }[]
  await external('artifacts', 'restore', artifact.id, 1)
  await expect(version).toHaveValue('2', FAST)
  await expect(version.locator('option')).toHaveCount(2, FAST)
})
