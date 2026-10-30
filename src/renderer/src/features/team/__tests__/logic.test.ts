import { describe, expect, it } from 'vitest'
import { defaultSuccessor, leaveKind, teamInitials } from '../logic'

const m = (id: string, role: 'owner' | 'manager' | 'member') => ({ id, role })

describe('leaveKind', () => {
  it('một mình trong team → solo (kể cả là Owner)', () => {
    expect(leaveKind([m('me', 'owner')], 'me')).toBe('solo')
  })

  it('Owner duy nhất, team còn người → cần người kế nhiệm', () => {
    expect(leaveKind([m('me', 'owner'), m('a', 'member')], 'me')).toBe('successor')
  })

  it('còn Owner khác hoặc mình không phải Owner → rời bình thường', () => {
    expect(leaveKind([m('me', 'owner'), m('a', 'owner')], 'me')).toBe('simple')
    expect(leaveKind([m('me', 'member'), m('a', 'owner')], 'me')).toBe('simple')
  })
})

describe('defaultSuccessor', () => {
  it('ưu tiên Manager, không bao giờ chọn chính mình', () => {
    expect(defaultSuccessor([m('me', 'owner'), m('a', 'member'), m('b', 'manager')], 'me')).toBe('b')
    expect(defaultSuccessor([m('me', 'owner'), m('a', 'member')], 'me')).toBe('a')
    expect(defaultSuccessor([m('me', 'owner')], 'me')).toBeNull()
  })
})

describe('teamInitials', () => {
  it('lấy chữ đầu của tối đa 2 từ', () => {
    expect(teamInitials('nhóm đồ án')).toBe('NĐ')
    expect(teamInitials('  Alpha  ')).toBe('A')
    expect(teamInitials('')).toBe('')
  })
})
