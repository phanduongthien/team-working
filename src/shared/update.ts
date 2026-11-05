/** Thông tin bản mới đã chuẩn hóa để hiện cho người dùng (không chứa HTML). */
export type UpdateSummary = {
  version: string
  /** ISO date từ latest.yml. */
  releaseDate?: string
  /** Tiêu đề Release, đã bỏ nhãn [critical]. */
  title: string
  /** Changelog từ bản đang dùng tới bản mới nhất, mới trước. */
  notes: { version: string; text: string }[]
  /** Bắt buộc cập nhật: không có nút "Bỏ qua phiên bản này". */
  critical: boolean
}

/** Trạng thái cập nhật mà renderer nhìn thấy. `prompt` = cần hiện hộp thoại. */
export type UpdateState =
  | { state: 'unsupported' }
  | { state: 'idle' }
  | { state: 'checking'; manual: boolean }
  | { state: 'none'; manual: boolean }
  | { state: 'available'; info: UpdateSummary; prompt: boolean }
  | { state: 'downloading'; info: UpdateSummary; percent: number; transferred: number; total: number }
  | { state: 'downloaded'; info: UpdateSummary; prompt: boolean }
  | { state: 'error'; message: string; info?: UpdateSummary; manual: boolean }
