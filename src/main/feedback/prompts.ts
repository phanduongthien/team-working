import type { FeedbackCoachRequest, FeedbackSummaryRequest } from '@shared/schemas'

const LANG = { vi: 'tiếng Việt', en: 'English' } as const

const KIND_TEXT = {
  project: 'góp ý về dự án/quy trình',
  person: 'feedback cho một thành viên',
  review: 'đánh giá định kỳ của quản lý cho thành viên'
} as const

const VISIBILITY_TEXT = {
  public: 'công khai — cả team đọc được, có tên người gửi',
  anonymous: 'ẨN DANH — phải loại bỏ mọi chi tiết có thể lộ danh tính người viết (tên, vai trò, việc chỉ người đó làm, cách xưng hô đặc trưng)',
  private: 'riêng tư — chỉ người nhận và quản lý đọc'
} as const

const CATEGORY_TEXT = { praise: 'khen ngợi', improve: 'cần cải thiện', suggestion: 'đề xuất' } as const

/** Prompt nhờ skill feedback-coach viết lại bản nháp (chỉ trả về văn bản đã viết lại). */
export function buildCoachPrompt(req: FeedbackCoachRequest): string {
  const lines = [
    req.mode === 'compose'
      ? `Viết lại bản nháp ${KIND_TEXT[req.kind]} dưới đây cho rõ ràng, cụ thể và mang tính xây dựng.`
      : 'Giúp người dùng viết câu TRẢ LỜI cho feedback dưới đây: bình tĩnh, hỏi làm rõ nếu cần, nêu kế hoạch.',
    `Loại: ${CATEGORY_TEXT[req.category]}. Chế độ hiển thị: ${VISIBILITY_TEXT[req.visibility]}.`,
    `Viết bằng ${LANG[req.language]}. Giữ đúng ý của người viết, không bịa thêm sự việc.`,
    'Chỉ trả về đoạn văn đã viết lại, không tiêu đề, không giải thích, không đặt trong khối code.'
  ]
  if (req.original.trim()) lines.push('', '## Feedback gốc', req.original.trim())
  lines.push('', '## Bản nháp', req.draft)
  return lines.join('\n')
}

/** Prompt tóm tắt feedback theo kỳ. Dữ liệu đầu vào đã bỏ tên người gửi. */
export function buildSummaryPrompt(req: FeedbackSummaryRequest): string {
  const items = req.items
    .map((it, i) => {
      const replies = it.replies.length ? `\n   Trả lời: ${it.replies.map((r) => r.replace(/\s+/g, ' ')).join(' | ')}` : ''
      return `${i + 1}. [${it.date}] (${KIND_TEXT[it.kind]}, ${CATEGORY_TEXT[it.category]}, trạng thái: ${it.status}) ${it.body.replace(/\s+/g, ' ')}${replies}`
    })
    .join('\n')
  return [
    `Tóm tắt feedback của "${req.scope}" trong kỳ ${req.period} theo hướng dẫn.`,
    `Viết bằng ${LANG[req.language]}, dùng Markdown ngắn gọn với các mục: Điểm mạnh được ghi nhận, Chủ đề lặp lại cần cải thiện, Đề xuất nổi bật, Việc cần làm tiếp.`,
    'Không suy đoán danh tính người viết. Không phán xét tính cách.',
    '',
    '## Feedback',
    items
  ].join('\n')
}

/** Bỏ khối ``` bao ngoài nếu mô hình lỡ thêm. */
export function cleanText(text: string): string {
  const t = text.trim()
  const fenced = t.match(/^```[\w-]*\n([\s\S]*?)\n```$/)
  return (fenced ? fenced[1] : t).trim()
}
