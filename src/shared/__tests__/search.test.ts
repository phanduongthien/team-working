import { describe, expect, it } from 'vitest'
import { snippetParts } from '../search'

describe('snippetParts', () => {
  it('tách phần khớp để tô đậm, bỏ dấu đánh dấu lẻ', () => {
    expect(snippetParts('…Học \u0001Unity\u0002 và \u0001unity\u0002 nữa')).toEqual([
      { text: '…Học ', hit: false },
      { text: 'Unity', hit: true },
      { text: ' và ', hit: false },
      { text: 'unity', hit: true },
      { text: ' nữa', hit: false }
    ])
    expect(snippetParts('lẻ \u0001 dấu')).toEqual([{ text: 'lẻ  dấu', hit: false }])
  })
})
