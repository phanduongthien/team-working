import { describe, expect, it } from 'vitest'
import { toRestore } from '../backup'

describe('toRestore', () => {
  it('chỉ tạo lại memory chưa có trên máy, bỏ trùng, loại lạ → other', () => {
    expect(
      toRestore(
        [
          { content: 'Đang học  React', category: 'goal' },
          { content: 'Thích ví dụ Python', category: 'preference' },
          { content: 'thích ví dụ python', category: 'preference' },
          { content: 'Làm ở công ty X', category: 'job' }
        ],
        [{ content: 'đang học react' }]
      )
    ).toEqual([
      { content: 'Thích ví dụ Python', category: 'preference' },
      { content: 'Làm ở công ty X', category: 'other' }
    ])
  })
})
