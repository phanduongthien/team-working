import { Notification, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC } from '@shared/ipc'

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Tự cập nhật từ GitHub Releases (cấu hình publish nằm trong app-update.yml do electron-builder tạo).
 * Chỉ chạy ở bản đã cài; tải nền, xong thì báo người dùng khởi động lại.
 */
export function startAutoUpdate(opts: {
  isPackaged: boolean
  getWindow(): BrowserWindow | null
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }
}): { install(): void } {
  const { autoUpdater } = electronUpdater
  if (!opts.isPackaged) return { install: () => {} }

  autoUpdater.logger = { info: opts.log.info, warn: opts.log.warn, error: opts.log.error, debug: () => {} }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    opts.log.info(`Đã tải bản ${info.version}`)
    opts.getWindow()?.webContents.send(IPC.updateReady, { version: info.version })
    if (Notification.isSupported()) {
      new Notification({ title: 'Team Working', body: `Có bản mới ${info.version} — khởi động lại để cập nhật.` }).show()
    }
  })
  autoUpdater.on('error', (err) => opts.log.warn(`Cập nhật lỗi: ${err.message}`))

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => opts.log.warn(`Không kiểm tra được bản mới: ${err.message}`))
  }
  check()
  setInterval(check, SIX_HOURS)

  return { install: () => autoUpdater.quitAndInstall() }
}
