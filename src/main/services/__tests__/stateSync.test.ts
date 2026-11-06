import { describe, expect, it } from 'vitest'
import { SETTINGS_TOPICS, SYNC_TOPICS } from '@shared/sync'
import { StateSync } from '../stateSync'

/** StateSync với hàng đợi chạy tay: kiểm tra việc gộp sự kiện trong cùng một lượt. */
function setup() {
  const sent: string[][] = []
  const queue: (() => void)[] = []
  const sync = new StateSync((topics) => sent.push(topics), (fn) => queue.push(fn))
  const tick = (): void => queue.splice(0).forEach((fn) => fn())
  return { sync, sent, tick }
}

describe('StateSync — báo "đã thay đổi" theo mục', () => {
  it('gộp nhiều lần báo trong cùng một lượt thành MỘT sự kiện, mỗi mục một lần', () => {
    const { sync, sent, tick } = setup()
    sync.changed('skills')
    sync.changed('gmail', 'skills')
    sync.settingsChanged('gmail')
    expect(sent).toEqual([])
    tick()
    expect(sent).toEqual([['skills', 'gmail']])
    sync.changed('voice')
    tick()
    expect(sent.at(-1)).toEqual(['voice'])
  })

  it('ghi settings theo khoá → đúng mục; khoá không thuộc mục nào thì không báo', () => {
    const { sync, sent, tick } = setup()
    sync.settingsChanged('computerUse')
    sync.settingsChanged('expressiveStats')
    sync.settingsChanged('khoa-la')
    tick()
    expect(sent).toEqual([['computer', 'expressive']])
    sync.settingsChanged('khoa-la')
    tick()
    expect(sent).toHaveLength(1)
  })

  it('track: thành công, trả { error } hay ném lỗi đều báo; giữ nguyên kết quả / lỗi', async () => {
    const { sync, sent, tick } = setup()
    await expect(sync.track('gmail', () => 1)).resolves.toBe(1)
    await expect(sync.track('gmail', () => ({ error: 'x' }))).resolves.toEqual({ error: 'x' })
    await expect(
      sync.track(['telegram', 'gmail'], async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    tick()
    expect(sent).toEqual([['gmail', 'telegram']])
  })

  it('mọi khoá settings trỏ tới mục có thật', () => {
    for (const topic of Object.values(SETTINGS_TOPICS)) expect(SYNC_TOPICS).toContain(topic)
  })
})
