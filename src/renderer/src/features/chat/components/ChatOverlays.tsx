import { CodeApprovalOverlay } from './CodeApprovalOverlay'
import { FolderAccessOverlay } from './FolderAccessOverlay'

/** Hộp duyệt luôn gắn trong app (không lỡ khi đang ở trang khác): sửa file (diff) và trợ lý xin quyền thư mục. */
export function ChatOverlays() {
  return (
    <>
      <CodeApprovalOverlay />
      <FolderAccessOverlay />
    </>
  )
}
