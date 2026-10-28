import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/ai'
import { StreamJsonParser } from '../streamJsonParser'

function runFixture(name: string): { events: ChatEvent[]; parser: StreamJsonParser } {
  const raw = readFileSync(join(__dirname, '..', '__fixtures__', `${name}.jsonl`), 'utf8')
  const parser = new StreamJsonParser()
  const events = raw.split('\n').flatMap((line) => parser.push(line))
  return { events, parser }
}

const textOf = (events: ChatEvent[]): string =>
  events.map((e) => (e.type === 'text' ? e.delta : '')).join('')

describe('StreamJsonParser với output CLI thật', () => {
  it('stream từng mảnh chữ và kết thúc bằng done (có --include-partial-messages)', () => {
    const { events, parser } = runFixture('partial')
    expect(events[0]).toEqual({ type: 'session', sessionId: '5be8004f-e797-452d-89fb-45a17e2d25a1' })
    expect(events.filter((e) => e.type === 'text').length).toBeGreaterThan(1)
    expect(textOf(events)).toBe('2 + 2 bằng 4.')
    const last = events.at(-1)
    expect(last?.type).toBe('done')
    expect(last?.type === 'done' && last.usage?.outputTokens).toBe(14)
    expect(parser.hasResult).toBe(true)
  })

  it('không lặp chữ khi vừa có delta vừa có message assistant đầy đủ', () => {
    const { events } = runFixture('tool')
    expect(textOf(events)).toBe('Mã bí mật là **CAM-42**.')
  })

  it('báo tool_use với tên và input', () => {
    const { events } = runFixture('tool')
    const tools = events.filter((e) => e.type === 'tool')
    expect(tools).toEqual([{ type: 'tool', name: 'Read', input: { file_path: 'C:\\workspace\\note.txt' } }])
  })

  it('lấy chữ từ message assistant khi không có partial (resume), bỏ qua thinking', () => {
    const { events } = runFixture('resume')
    expect(textOf(events)).toBe('Mã **CAM-42** có **2 chữ số** (4 và 2).')
    expect(events.at(-1)?.type).toBe('done')
  })

  it('chuyển result lỗi thành sự kiện error kèm thông báo', () => {
    const { events } = runFixture('error')
    expect(events).toEqual([
      {
        type: 'error',
        message: 'No conversation found with session ID: 00000000-0000-0000-0000-000000000000'
      }
    ])
  })
})

describe('StreamJsonParser với dòng bất thường', () => {
  it('bỏ qua dòng trống, dòng không phải JSON và báo qua callback', () => {
    const bad: string[] = []
    const parser = new StreamJsonParser((l) => bad.push(l))
    expect(parser.push('')).toEqual([])
    expect(parser.push('Waiting for background work')).toEqual([])
    expect(parser.push('null')).toEqual([])
    expect(bad).toEqual(['Waiting for background work'])
  })

  it('bỏ qua message của subagent (parent_tool_use_id khác null)', () => {
    const parser = new StreamJsonParser()
    const line = JSON.stringify({
      type: 'assistant',
      parent_tool_use_id: 'toolu_x',
      message: { id: 'm1', content: [{ type: 'text', text: 'bên trong subagent' }] }
    })
    expect(parser.push(line)).toEqual([])
  })

  it('chỉ phát session một lần cho cùng session_id', () => {
    const parser = new StreamJsonParser()
    const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' })
    expect(parser.push(init)).toHaveLength(1)
    expect(parser.push(init)).toHaveLength(0)
  })

  it('result lỗi không có errors thì dùng result hoặc subtype', () => {
    const parser = new StreamJsonParser()
    expect(
      parser.push(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true }))
    ).toEqual([{ type: 'error', message: 'error_max_turns' }])
  })
})
