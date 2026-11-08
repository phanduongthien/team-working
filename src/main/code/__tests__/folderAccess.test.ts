import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conversation, FolderAccessClosed, FolderAccessRequest } from '@shared/types'
import { describeChange } from '../change'
import { FOLDER_TOOL, FolderAccessRequests, type FolderAccessDeps } from '../folderAccess'
import { detectProject, projectNotes, protectedReason } from '../projectProfile'
import { AppToolRegistry } from '../../tools/registry'

describe('hồ sơ dự án (Unity / Blender / DaVinci)', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mmc-profile-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('Unity: nhận diện qua Assets + ProjectSettings; chặn Library/ và .meta, cho sửa script', () => {
    mkdirSync(join(root, 'Assets'))
    mkdirSync(join(root, 'ProjectSettings'))
    const info = detectProject(root)
    expect(info.profiles.map((p) => p.id)).toEqual(['unity'])
    expect(protectedReason(info, 'Library/PackageCache/a.cs')).toMatch(/Unity/)
    expect(protectedReason(info, 'library/foo.txt')).toMatch(/Unity/)
    expect(protectedReason(info, 'Assets/Scripts/EnemyMoving.cs.meta')).toMatch(/\.meta/)
    expect(protectedReason(info, 'Assets/Scripts/EnemyMoving.cs')).toBeNull()
    expect(projectNotes(info)).toContain('Unity')
  })

  it('Blender / DaVinci: file nhị phân luôn bị chặn, script .py vẫn sửa được', () => {
    writeFileSync(join(root, 'scene.blend'), '')
    writeFileSync(join(root, 'edit.drp'), '')
    const info = detectProject(root)
    expect(info.profiles.map((p) => p.id).sort()).toEqual(['blender', 'davinci'])
    expect(protectedReason(info, 'scene.blend')).toMatch(/nhị phân/)
    expect(protectedReason(info, 'edit.drp')).toMatch(/nhị phân/)
    expect(protectedReason(info, 'tools/rig.py')).toBeNull()
  })

  it('dự án chung: chặn .git, không có lưu ý; thư mục không đọc được → dự án chung', () => {
    const info = detectProject(root)
    expect(info.profiles).toEqual([])
    expect(projectNotes(info)).toBe('')
    expect(protectedReason(info, '.git/config')).toMatch(/git/)
    expect(detectProject(join(root, 'khong-ton-tai')).profiles).toEqual([])
  })

  it('describeChange từ chối file được bảo vệ trước khi tạo diff', async () => {
    mkdirSync(join(root, 'Assets'))
    mkdirSync(join(root, 'ProjectSettings'))
    const meta = await describeChange(root, 'Write', { file_path: join(root, 'Assets', 'a.cs.meta'), content: 'x' })
    expect(meta).toMatchObject({ error: 'protected_path' })
    const ok = await describeChange(root, 'Write', { file_path: join(root, 'Assets', 'a.cs'), content: 'x' })
    expect(ok).toMatchObject({ path: 'Assets/a.cs', isNewFile: true })
  })
})

describe('trợ lý xin quyền thư mục', () => {
  const conv = (patch: Partial<Conversation> = {}): Conversation =>
    ({ id: 'c1', mode: 'free', cwd: null, codeWrite: false, ...patch }) as Conversation

  function setup(over: Partial<FolderAccessDeps> = {}) {
    let current: Conversation | null = conv()
    const events: (FolderAccessRequest | FolderAccessClosed)[] = []
    const deps: FolderAccessDeps = {
      getConversation: () => current,
      pickFolder: vi.fn(async () => 'D:\\unity\\3DCo_Ban'),
      grant: vi.fn((_id, path, write) => (current = conv({ cwd: path, codeWrite: write }))),
      emit: (e) => events.push(e),
      log: { info: () => {} },
      ...over
    }
    const access = new FolderAccessRequests(deps)
    const registry = new AppToolRegistry()
    access.registerTools(registry)
    const setConv = (c: Conversation | null): void => {
      current = c
    }
    return { access, registry, deps, events, setConv }
  }
  const lastRequest = (events: (FolderAccessRequest | FolderAccessClosed)[]): FolderAccessRequest =>
    events.filter((e): e is FolderAccessRequest => !('closed' in e)).at(-1)!

  it('có tool khi chưa có thư mục hoặc chỉ đọc; đã được sửa thì không cần', () => {
    const { access, setConv } = setup()
    expect(access.toolsFor('c1')).toMatchObject({ names: [FOLDER_TOOL], context: expect.stringContaining('copy-dán') })
    setConv(conv({ cwd: 'D:\\p' }))
    expect(access.toolsFor('c1')?.context).toContain('write=true')
    setConv(conv({ cwd: 'D:\\p', codeWrite: true }))
    expect(access.toolsFor('c1')).toBeNull()
    setConv(null)
    expect(access.toolsFor('c1')).toBeNull()
  })

  it('luồng đầy đủ: cấp đúng thư mục NGƯỜI DÙNG chọn (không phải đường dẫn trợ lý đưa); huỷ hộp thoại thì thẻ vẫn chờ', async () => {
    const pick = vi.fn<FolderAccessDeps['pickFolder']>()
    pick.mockResolvedValueOnce(null).mockResolvedValueOnce('E:\\khac')
    const { access, registry, deps, events } = setup({ pickFolder: pick })
    const call = registry.call(FOLDER_TOOL, { path: 'C:\\Windows', reason: 'xem code', write: true }, { conversationId: 'c1' })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    const req = lastRequest(events)
    expect(req).toMatchObject({ suggestedPath: 'C:\\Windows', write: true })

    expect(await access.respond(req.id, true, true)).toEqual({ status: 'pending' })
    expect(pick).toHaveBeenLastCalledWith('C:\\Windows')
    const res = await access.respond(req.id, true, false)
    expect(res).toMatchObject({ status: 'granted', conversation: { cwd: 'E:\\khac', codeWrite: false } })
    expect(deps.grant).toHaveBeenCalledWith('c1', 'E:\\khac', false)
    const text = (await call).content[0]
    expect(text).toMatchObject({ type: 'text', text: expect.stringContaining('E:\\khac') })
    expect(text).toMatchObject({ text: expect.stringContaining('chỉ đọc') })
    expect(events.at(-1)).toEqual({ id: req.id, closed: true })
    expect(await access.respond(req.id, true, false)).toEqual({ status: 'expired' })
  })

  it('từ chối / dừng lượt / hết giờ → tool trả lời không có quyền, không gắn thư mục', async () => {
    const { access, registry, deps, events } = setup({ timeoutMs: 20 })
    const denied = registry.call(FOLDER_TOOL, { reason: 'a' }, { conversationId: 'c1' })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(await access.respond(lastRequest(events).id, false, false)).toEqual({ status: 'denied' })
    expect((await denied).content[0]).toMatchObject({ text: expect.stringContaining('từ chối') })

    const stopped = registry.call(FOLDER_TOOL, { reason: 'b' }, { conversationId: 'c1' })
    await vi.waitFor(() => expect(events.filter((e) => !('closed' in e))).toHaveLength(2))
    access.cancelConversation('c1')
    expect((await stopped).content[0]).toMatchObject({ text: 'Đã dừng.' })

    const timedOut = await registry.call(FOLDER_TOOL, { reason: 'c' }, { conversationId: 'c1' })
    expect(timedOut.content[0]).toMatchObject({ text: expect.stringContaining('Hết thời gian') })
    expect(deps.grant).not.toHaveBeenCalled()
    expect(deps.pickFolder).not.toHaveBeenCalled()
  })

  it('dừng lượt trong lúc hộp chọn thư mục đang mở → không cấp quyền', async () => {
    let release: (p: string) => void = () => {}
    const { access, registry, deps, events } = setup({ pickFolder: () => new Promise((r) => (release = r)) })
    const call = registry.call(FOLDER_TOOL, { reason: 'a' }, { conversationId: 'c1' })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    const pending = access.respond(lastRequest(events).id, true, true)
    access.cancelConversation('c1')
    release('D:\\p')
    expect(await pending).toEqual({ status: 'expired' })
    expect(deps.grant).not.toHaveBeenCalled()
    await call
  })
})
