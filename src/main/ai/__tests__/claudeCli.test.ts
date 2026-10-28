import { describe, expect, it } from 'vitest'
import {
  buildCliArgs,
  buildCmdLine,
  parseAuthStatus,
  parseVersion,
  pickClaudeExecutable,
  promptWithAttachments
} from '../claudeCli'

describe('pickClaudeExecutable', () => {
  it('ưu tiên .exe hơn shim .cmd', () => {
    const out = 'C:\\npm\\claude\r\nC:\\npm\\claude.cmd\r\nC:\\Users\\a\\.local\\bin\\claude.exe\r\n'
    expect(pickClaudeExecutable(out)).toBe('C:\\Users\\a\\.local\\bin\\claude.exe')
  })
  it('dùng .cmd khi không có .exe', () => {
    expect(pickClaudeExecutable('C:\\npm\\claude\nC:\\npm\\claude.cmd')).toBe('C:\\npm\\claude.cmd')
  })
  it('trả null khi không tìm thấy', () => {
    expect(pickClaudeExecutable('')).toBeNull()
  })
})

describe('parseVersion / parseAuthStatus', () => {
  it('đọc version từ `claude --version`', () => {
    expect(parseVersion('2.1.312 (Claude Code)\n')).toBe('2.1.312')
    expect(parseVersion('oops')).toBeNull()
  })
  it('chỉ giữ loggedIn và subscriptionType, bỏ email', () => {
    const json = JSON.stringify({ loggedIn: true, email: 'a@b.c', orgId: 'x', subscriptionType: 'pro' })
    expect(parseAuthStatus(json)).toEqual({ loggedIn: true, subscriptionType: 'pro' })
  })
  it('trả null với output không hợp lệ', () => {
    expect(parseAuthStatus('not json')).toBeNull()
    expect(parseAuthStatus('{}')).toBeNull()
  })
})

describe('buildCliArgs', () => {
  const base = { systemPromptFile: 'C:\\tmp\\system-1.md', tools: [] as string[] }

  it('không đưa prompt vào args, bật restricted và không tool ở chế độ thường', () => {
    const args = buildCliArgs({ ...base, mode: 'free' })
    expect(args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--restricted',
      '--strict-mcp-config',
      '--tools',
      '',
      '--system-prompt-file',
      'C:\\tmp\\system-1.md'
    ])
  })

  it('chế độ Code giữ prompt mặc định (append) và cho phép tool chỉ đọc', () => {
    const args = buildCliArgs({ ...base, mode: 'code', tools: ['Read', 'Grep', 'Glob'] })
    expect(args).toContain('--append-system-prompt-file')
    expect(args.slice(-2)).toEqual(['--allowedTools', 'Read,Grep,Glob'])
  })

  it('thêm --resume khi có session', () => {
    const args = buildCliArgs({ ...base, mode: 'study', sessionId: '5be8004f-e797-452d-89fb-45a17e2d25a1' })
    expect(args.slice(-2)).toEqual(['--resume', '5be8004f-e797-452d-89fb-45a17e2d25a1'])
  })

  it('chế độ Code có sửa file: chỉ tự duyệt tool đọc, Edit/Write đi qua tool duyệt quyền', () => {
    const args = buildCliArgs({
      ...base,
      mode: 'code',
      tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
      allowedTools: ['Read', 'Grep', 'Glob'],
      mcpConfigFile: 'C:\\tmp\\mcp-1.json',
      permissionTool: 'mcp__twperm__approve'
    })
    const at = (flag: string): string => args[args.indexOf(flag) + 1]
    expect(at('--tools')).toBe('Read,Grep,Glob,Edit,Write')
    expect(at('--allowedTools')).toBe('Read,Grep,Glob')
    expect(at('--mcp-config')).toBe('C:\\tmp\\mcp-1.json')
    expect(at('--permission-prompt-tool')).toBe('mcp__twperm__approve')
    expect(args).toContain('--strict-mcp-config')
  })

  it('lượt gọi một lần không lưu session', () => {
    expect(buildCliArgs({ ...base, mode: 'free', ephemeral: true }).at(-1)).toBe('--no-session-persistence')
  })

  it('liệt kê file đính kèm trong prompt (đi qua stdin)', () => {
    expect(promptWithAttachments('Tóm tắt', [])).toBe('Tóm tắt')
    const p = promptWithAttachments('Tóm tắt', ['C:\\ws\\a.pdf', 'C:\\ws\\b.png'])
    expect(p).toContain('đính kèm 2 file')
    expect(p.endsWith('- C:\\ws\\a.pdf\n- C:\\ws\\b.png')).toBe(true)
  })

  it('không bao giờ dùng --dangerously-skip-permissions hay --bare', () => {
    const args = buildCliArgs({ ...base, mode: 'code', tools: ['Read'] })
    expect(args.join(' ')).not.toMatch(/dangerously|--bare/)
  })
})

describe('buildCmdLine', () => {
  it('bọc đường dẫn có dấu cách và tham số rỗng', () => {
    expect(buildCmdLine('C:\\Program Files\\npm\\claude.cmd', ['--tools', '', '-p'])).toBe(
      '""C:\\Program Files\\npm\\claude.cmd" --tools "" -p"'
    )
  })
  it('từ chối ký tự cmd.exe có thể diễn giải', () => {
    for (const bad of ['a&b', 'x|y', '%PATH%', 'a"b', '^x', 'a>b']) {
      expect(() => buildCmdLine('claude.cmd', [bad])).toThrow()
    }
  })
})
