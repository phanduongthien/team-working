import { describe, expect, it } from 'vitest'
import { htmlToText, isCritical, shouldPrompt, summarize } from '../policy'

describe('htmlToText', () => {
  it('giữ xuống dòng và gạch đầu dòng, bỏ thẻ', () => {
    const html = '<h3>Tính năng</h3><ul><li>Thông báo <strong>cập nhật</strong></li><li>Sửa lỗi</li></ul><p>Xem thêm</p>'
    expect(htmlToText(html)).toBe('Tính năng\n\n• Thông báo cập nhật\n\n• Sửa lỗi\n\nXem thêm')
  })

  it('giải mã entity và bỏ script', () => {
    expect(htmlToText('a &amp; b &lt;3 &#39;x&#x27; <script>alert(1)</script>c')).toBe("a & b <3 'x' c")
  })

  it('không giải mã entity lạ hoặc code point sai', () => {
    expect(htmlToText('&foo; &#0; &#x110000;')).toBe('&foo; &#0; &#x110000;')
  })
})

describe('isCritical', () => {
  it('nhận [critical] trong tiêu đề, không phân biệt hoa thường', () => {
    expect(isCritical({ version: '1.0.0', releaseName: 'MMC studio 1.0.0 [CRITICAL]' })).toBe(true)
    expect(isCritical({ version: '1.0.0', releaseName: 'MMC studio 1.0.0' })).toBe(false)
  })

  it('bản bắt buộc nằm giữa (ghi chú) vẫn tính, dù bản mới nhất là bản thường', () => {
    expect(
      isCritical({
        version: '0.5.0',
        releaseName: 'MMC studio 0.5.0',
        releaseNotes: [
          { version: '0.5.0', note: '<p>Thêm tính năng</p>' },
          { version: '0.4.0', note: '<blockquote><p>⚠️ [critical] Bản cập nhật bắt buộc</p></blockquote>' }
        ]
      })
    ).toBe(true)
  })

  it('không có ghi chú → chỉ xét tiêu đề', () => {
    expect(isCritical({ version: '1.0.0', releaseNotes: null })).toBe(false)
  })
})

describe('summarize', () => {
  it('bỏ nhãn [critical] khỏi tiêu đề và dòng đánh dấu trong ghi chú', () => {
    const s = summarize({
      version: '0.4.0',
      releaseName: 'MMC studio 0.4.0 [critical]',
      releaseDate: '2026-11-10T00:00:00.000Z',
      releaseNotes: '<blockquote><p>⚠️ [critical] Bản cập nhật bắt buộc</p></blockquote><ul><li>Vá lỗi bảo mật</li></ul>'
    })
    expect(s).toEqual({
      version: '0.4.0',
      releaseDate: '2026-11-10T00:00:00.000Z',
      title: 'MMC studio 0.4.0',
      notes: [{ version: '0.4.0', text: '• Vá lỗi bảo mật' }],
      critical: true
    })
  })

  it('thiếu tiêu đề → dùng số phiên bản; bỏ ghi chú rỗng', () => {
    const s = summarize({ version: '0.4.0', releaseNotes: [{ version: '0.4.0', note: null }] })
    expect(s.title).toBe('0.4.0')
    expect(s.notes).toEqual([])
  })
})

describe('shouldPrompt', () => {
  const base = { version: '0.4.0', critical: false, manual: false, skippedVersion: null, postponed: new Set<string>() }

  it('bản thường mới → hiện', () => {
    expect(shouldPrompt(base)).toBe(true)
  })

  it('đã bỏ qua đúng phiên bản → không hiện; bản mới hơn vẫn hiện', () => {
    expect(shouldPrompt({ ...base, skippedVersion: '0.4.0' })).toBe(false)
    expect(shouldPrompt({ ...base, version: '0.4.1', skippedVersion: '0.4.0' })).toBe(true)
  })

  it('đã để sau trong phiên này → không hiện', () => {
    expect(shouldPrompt({ ...base, postponed: new Set(['0.4.0']) })).toBe(false)
  })

  it('bản [critical] luôn hiện dù đã bỏ qua hay để sau', () => {
    expect(shouldPrompt({ ...base, critical: true, skippedVersion: '0.4.0', postponed: new Set(['0.4.0']) })).toBe(true)
  })

  it('người dùng tự bấm kiểm tra → luôn hiện', () => {
    expect(shouldPrompt({ ...base, manual: true, skippedVersion: '0.4.0' })).toBe(true)
  })
})
