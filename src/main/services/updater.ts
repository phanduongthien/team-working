import { existsSync } from 'node:fs'
import { join } from 'node:path'
import electronUpdater from 'electron-updater'
import type { UpdaterPort } from '../update/controller'

/**
 * Bọc electron-updater (GitHub Releases; cấu hình trong app-update.yml do electron-builder tạo).
 * - Bản đã cài: dùng cấu hình publish đóng gói sẵn.
 * - Bản chưa đóng gói: chỉ chạy khi có `devConfigPath` (test e2e / thử với server giả lập cục bộ),
 *   còn lại trả null → app báo "không hỗ trợ cập nhật".
 * Không tự tải: chỉ tải khi người dùng bấm "Cập nhật ngay".
 */
export function createElectronUpdater(opts: {
  isPackaged: boolean
  devConfigPath?: string
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }
}): UpdaterPort | null {
  const { autoUpdater } = electronUpdater
  if (!opts.isPackaged) {
    if (!opts.devConfigPath) return null
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.updateConfigPath = opts.devConfigPath
  } else if (!existsSync(join(process.resourcesPath, 'app-update.yml'))) {
    // Build cục bộ (npm run build:win) không có cấu hình publish → không tự cập nhật được.
    opts.log.info('Không có app-update.yml — bản build này không tự cập nhật')
    return null
  }

  autoUpdater.logger = { info: opts.log.info, warn: opts.log.warn, error: opts.log.error, debug: () => {} }
  autoUpdater.autoDownload = false
  // Chỉ có tác dụng khi đã tải xong (tức người dùng đã đồng ý cập nhật): chọn "Để sau" thì cài lúc thoát app.
  autoUpdater.autoInstallOnAppQuit = true
  // Ghi chú của mọi bản từ bản đang dùng tới bản mới nhất (để không bỏ sót bản [critical] ở giữa).
  autoUpdater.fullChangelog = true
  // Không có listener 'error' thì EventEmitter ném lỗi ra ngoài; lỗi đã được xử lý qua promise.
  autoUpdater.on('error', (err) => opts.log.warn(`electron-updater: ${err.message}`))

  return {
    setAllowPrerelease: (allow) => {
      autoUpdater.allowPrerelease = allow
    },
    check: async () => {
      const result = await autoUpdater.checkForUpdates()
      return result ? { available: result.isUpdateAvailable, info: result.updateInfo } : null
    },
    download: async () => {
      await autoUpdater.downloadUpdate()
    },
    // Cài im lặng (giữ thư mục cài cũ) rồi tự mở lại app. Dữ liệu ở %APPDATA% không bị installer đụng tới.
    install: () => autoUpdater.quitAndInstall(true, true),
    onProgress: (listener) => {
      autoUpdater.on('download-progress', (p) => listener({ percent: p.percent, transferred: p.transferred, total: p.total }))
    }
  }
}
