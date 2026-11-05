/** Trạng thái điều khiển máy tính mà renderer nhìn thấy. */
export type ComputerStatus = {
  /** Tính năng đã bật trong Cài đặt (mặc định tắt). */
  enabled: boolean
  /** Người dùng đã đọc và chấp nhận cảnh báo lần đầu. */
  warningAccepted: boolean
  /** Phím dừng khẩn cấp, dạng Electron accelerator (vd Control+Alt+Q). */
  hotkey: string
  /** Phím dừng khẩn cấp đã đăng ký được với Windows — chưa đăng ký thì không có tool nào chạy. */
  armed: boolean
  /** Phiên hiện tại: người dùng cho phép trợ lý xem màn hình (tắt khi khởi động lại app / dừng khẩn cấp). */
  screenAccess: boolean
  /** Giai đoạn phát triển: chỉ xem (chụp màn hình), chưa có thao tác chuột/phím. */
  mode: 'view'
  lastStop: { at: number; source: 'hotkey' | 'button' } | null
}

export type ScreenPreview = { dataUrl: string; width: number; height: number; description: string }
