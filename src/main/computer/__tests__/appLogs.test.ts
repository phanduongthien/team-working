import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { displayPath, findLogs, readLogTail, type LogRoots } from '../appLogs'

let dir: string
let roots: LogRoots
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mmc-logs-'))
  roots = { localAppData: join(dir, 'Local'), temp: join(dir, 'Local', 'Temp') }
  mkdirSync(roots.temp, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const UNITY_LOG = [
  'Refreshing native plugins compatible for Editor',
  'Loaded scene Assets/Scenes/Main.unity',
  'NullReferenceException: Object reference not set to an instance of an object',
  '  at PlayerController.Update () [0x00012] in Assets/Scripts/PlayerController.cs:42',
  '  at UnityEngine.Debug:LogException',
  'Reloading assemblies',
  'Assets/Scripts/Enemy.cs(17,9): error CS0103: The name `speed` does not exist in the current context',
  'Done'
].join('\r\n')

describe('findLogs', () => {
  it('tìm log Unity, crash Unity mới nhất, crash Blender mới nhất; bỏ qua nguồn không có', async () => {
    const unity = join(roots.localAppData, 'Unity', 'Editor')
    mkdirSync(unity, { recursive: true })
    writeFileSync(join(unity, 'Editor.log'), UNITY_LOG)
    const crashes = join(roots.localAppData, 'Temp', 'Unity', 'Editor', 'Crashes')
    for (const [name, day] of [['Crash_old', 1], ['Crash_new', 2]] as const) {
      mkdirSync(join(crashes, name), { recursive: true })
      writeFileSync(join(crashes, name, 'error.log'), name)
      utimesSync(join(crashes, name), new Date(2026, 10, day), new Date(2026, 10, day))
    }
    writeFileSync(join(roots.temp, 'scene.crash.txt'), 'old')
    utimesSync(join(roots.temp, 'scene.crash.txt'), new Date(2026, 10, 1), new Date(2026, 10, 1))
    writeFileSync(join(roots.temp, 'blender.crash.txt'), 'new')

    const logs = await findLogs(roots)
    expect(logs.map((l) => l.id)).toEqual(['unity_editor', 'unity_crash', 'blender_crash'])
    expect(logs[1].path).toBe(join(crashes, 'Crash_new', 'error.log'))
    expect(logs[2].path).toBe(join(roots.temp, 'blender.crash.txt'))
  })

  it('không có gì → rỗng', async () => {
    expect(await findLogs(roots)).toEqual([])
  })
})

describe('readLogTail', () => {
  it('N dòng cuối', async () => {
    const f = join(dir, 'Editor.log')
    writeFileSync(f, UNITY_LOG)
    expect(await readLogTail(f, { lines: 2, errorsOnly: false })).toEqual({
      text: 'Assets/Scripts/Enemy.cs(17,9): error CS0103: The name `speed` does not exist in the current context\nDone',
      shown: 2,
      partial: false
    })
  })

  it('chỉ lỗi: giữ dòng lỗi + stack trace ngay sau', async () => {
    const f = join(dir, 'Editor.log')
    writeFileSync(f, UNITY_LOG)
    const { text } = await readLogTail(f, { lines: 100, errorsOnly: true })
    expect(text).toContain('NullReferenceException')
    expect(text).toContain('PlayerController.cs:42')
    expect(text).toContain('error CS0103')
    expect(text).not.toContain('Refreshing native plugins')
  })

  it('file lớn: chỉ đọc 1 MB cuối, bỏ dòng bị cắt đầu', async () => {
    const f = join(dir, 'big.log')
    writeFileSync(f, `${'x'.repeat(2 * 1024 * 1024)}\nline A\nline B\n`)
    const r = await readLogTail(f, { lines: 5, errorsOnly: false })
    expect(r.partial).toBe(true)
    expect(r.text.endsWith('line A\nline B')).toBe(true)
  })
})

it('displayPath che tên người dùng', () => {
  const r = { localAppData: 'C:\\Users\\An\\AppData\\Local', temp: 'C:\\Users\\An\\AppData\\Local\\Temp' }
  expect(displayPath('C:\\Users\\An\\AppData\\Local\\Unity\\Editor\\Editor.log', r)).toBe('%LOCALAPPDATA%\\Unity\\Editor\\Editor.log')
  expect(displayPath('c:\\users\\an\\appdata\\local\\temp\\blender.crash.txt', r)).toBe('%TEMP%\\blender.crash.txt')
})
