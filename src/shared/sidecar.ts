/** Trạng thái Python sidecar (đọc cửa sổ / cây UI) mà renderer nhìn thấy. */
export type SidecarStep = 'uv' | 'python' | 'packages'
export type SidecarErrorCode = 'network' | 'checksum' | 'failed' | 'busy'

export type SidecarState =
  | { state: 'not_installed'; downloadMb: number; diskMb: number }
  | {
      state: 'installing'
      step: SidecarStep
      stepIndex: number
      stepCount: number
      /** Byte đã tải / tổng (chỉ có ở bước tải uv; các bước sau uv tự tải, không báo số byte). */
      received?: number
      total?: number
    }
  | { state: 'uninstalling' }
  | { state: 'installed'; python: string; uv: string; sizeBytes: number }
  | { state: 'error'; code: SidecarErrorCode; message: string; downloadMb: number; diskMb: number }
