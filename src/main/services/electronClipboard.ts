import { fileURLToPath } from 'node:url'
import { clipboard } from 'electron'
import type { ClipboardPort } from './attachments'

/** "text/uri-list" (RFC 2483): mỗi dòng một URI, dòng bắt đầu bằng # là chú thích. Chỉ lấy file:// cục bộ. */
export function filePathsFromUriList(text: string): string[] {
  const paths: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const uri = line.trim()
    if (!uri || uri.startsWith('#') || !uri.toLowerCase().startsWith('file:')) continue
    try {
      paths.push(fileURLToPath(uri))
    } catch {
      // URI file không hợp lệ (vd file://máy-khác/...) → bỏ qua
    }
  }
  return paths
}

async function itemOfType(type: string): Promise<Blob | null> {
  for (const item of await clipboard.read()) {
    if (item.types.includes(type)) return (await item.getType(type)) as Blob
  }
  return null
}

/**
 * Clipboard của Windows qua API Electron 44 (`clipboard.read()` / ClipboardItem, đã kiểm chứng 2026-11-05):
 * ảnh (Win+Shift+S, Print Screen, copy từ Photoshop / trình duyệt) có kiểu "image/png"; file copy từ
 * File Explorer có kiểu "text/uri-list" (đủ mọi file đã chọn).
 */
export const electronClipboard: ClipboardPort = {
  async readImagePng() {
    const blob = await itemOfType('image/png')
    return blob && blob.size > 0 ? Buffer.from(await blob.arrayBuffer()) : null
  },
  async readFilePaths() {
    const blob = await itemOfType('text/uri-list')
    return blob ? filePathsFromUriList(await blob.text()) : []
  }
}
