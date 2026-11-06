import { describe, expect, it } from 'vitest'
import type { Conversation, ConversationGroup } from '@shared/types'
import { buildSidebar } from '../sidebarTree'

const conv = (id: string, extra: Partial<Conversation> = {}): Conversation => ({
  id,
  title: id,
  mode: 'free',
  pinned: false,
  cwd: null,
  codeWrite: false,
  groupId: null,
  parentId: null,
  suggestedGroupId: null,
  createdAt: 0,
  updatedAt: 0,
  ...extra
})
const group = (id: string, extra: Partial<ConversationGroup> = {}): ConversationGroup => ({
  id,
  name: id,
  collapsed: false,
  createdAt: 0,
  ...extra
})
const ids = (rows: { conversation: Conversation; depth: number }[]) => rows.map((r) => `${r.conversation.id}:${r.depth}`)

describe('buildSidebar', () => {
  it('ghim luôn ở đầu, rồi các nhóm, rồi chưa xếp nhóm', () => {
    const s = buildSidebar(
      [conv('p', { pinned: true, groupId: 'g' }), conv('a', { groupId: 'g' }), conv('b')],
      [group('g')],
      false
    )
    expect(s.map((x) => x.kind)).toEqual(['pinned', 'group', 'recent'])
    expect(ids(s[0].rows)).toEqual(['p:0'])
    expect(ids(s[1].rows)).toEqual(['a:0'])
  })

  it('nhánh thụt vào dưới cuộc gốc khi cùng mục; khác mục thì đứng riêng', () => {
    const s = buildSidebar(
      [conv('f2', { parentId: 'f1' }), conv('root'), conv('f1', { parentId: 'root' }), conv('pf', { parentId: 'root', pinned: true })],
      [],
      false
    )
    expect(ids(s[0].rows)).toEqual(['pf:0'])
    expect(ids(s[1].rows)).toEqual(['root:0', 'f1:1', 'f2:2'])
  })

  it('nhóm thu gọn ẩn dòng nhưng vẫn đếm; đang tìm thì mở hết, ẩn nhóm rỗng', () => {
    const groups = [group('g', { collapsed: true }), group('empty')]
    const list = [conv('a', { groupId: 'g' })]
    const normal = buildSidebar(list, groups, false)
    expect(normal).toMatchObject([
      { kind: 'group', count: 1, collapsed: true, rows: [] },
      { kind: 'group', count: 0 }
    ])
    const searching = buildSidebar(list, groups, true)
    expect(searching).toHaveLength(1)
    expect(searching[0]).toMatchObject({ kind: 'group', collapsed: false })
  })

  it('đang tìm: vẫn thu gọn được tạm thời (không đụng trạng thái đã lưu), count = số kết quả', () => {
    const groups = [group('g', { collapsed: true }), group('h')]
    const list = [conv('a', { groupId: 'g' }), conv('b', { groupId: 'g' }), conv('c', { groupId: 'h' })]
    expect(buildSidebar(list, groups, true, { h: true })).toMatchObject([
      { kind: 'group', collapsed: false, count: 2 },
      { kind: 'group', collapsed: true, count: 1, rows: [] }
    ])
    // Hết tìm → về trạng thái đã lưu.
    expect(buildSidebar(list, groups, false, { h: true })).toMatchObject([
      { kind: 'group', collapsed: true },
      { kind: 'group', collapsed: false }
    ])
  })

  it('nhóm đã bị xoá → cuộc về mục chưa xếp nhóm; dữ liệu vòng không treo', () => {
    const s = buildSidebar([conv('a', { groupId: 'gone', parentId: 'b' }), conv('b', { parentId: 'a' })], [], false)
    expect(s).toHaveLength(1)
    expect(s[0].kind).toBe('recent')
    expect(s[0].rows.map((r) => r.conversation.id).sort()).toEqual(['a', 'b'])
  })
})
