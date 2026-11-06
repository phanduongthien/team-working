import { shell } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import { computerPreviewSchema, computerSetEnabledSchema } from '@shared/schemas'
import type { ComputerUseService } from '../computer/service'
import type { SidecarInstaller } from '../sidecar/installer'
import type { HandleFn } from './register'

export type ComputerIpcDeps = {
  handle: HandleFn
  computer: ComputerUseService
  logsDir: string
  sidecar: SidecarInstaller
  /** Dừng tiến trình Python đang chạy (trước khi gỡ). */
  stopSidecar(): void
}

const errorOf = (err: unknown): { error: string } => ({ error: (err as Error).message })

/** IPC điều khiển máy tính (giai đoạn chỉ xem) + Python sidecar. Lỗi nghiệp vụ trả về { error } để UI hiện thông báo. */
export function registerComputerIpc({ handle, computer, logsDir, sidecar, stopSidecar }: ComputerIpcDeps): void {
  const guard = <T>(fn: () => T): T | { error: string } => {
    try {
      return fn()
    } catch (err) {
      return errorOf(err)
    }
  }

  const C = { changes: 'computer' } as const
  const S = { changes: 'sidecar' } as const
  handle(IPC.computerStatus, z.undefined(), () => computer.status())
  handle(
    IPC.computerSetEnabled,
    computerSetEnabledSchema,
    ({ enabled, acceptWarning }) => guard(() => computer.setEnabled(enabled, acceptWarning)),
    C
  )
  handle(IPC.computerSetScreenAccess, z.boolean(), (on) => guard(() => computer.setScreenAccess(on)), C)
  handle(IPC.computerEmergencyStop, z.undefined(), () => computer.killSwitch.trigger(), C)
  handle(IPC.computerPreview, computerPreviewSchema, async ({ display }) => computer.preview(display).catch(errorOf))
  handle(IPC.computerOpenLogs, z.undefined(), async () => {
    await shell.openPath(logsDir)
  })

  handle(IPC.sidecarState, z.undefined(), () => sidecar.state)
  // Cài lâu (tải ~50 MB) → không chờ; tiến trình đi qua sự kiện sidecar:stateEvent.
  handle(
    IPC.sidecarInstall,
    z.undefined(),
    () =>
      guard(() => {
        if (sidecar.busy) throw new Error('busy')
        void sidecar.install()
        return sidecar.state
      }),
    S
  )
  handle(IPC.sidecarCancel, z.undefined(), () => sidecar.cancel(), S)
  handle(IPC.sidecarUninstall, z.undefined(), async () => sidecar.uninstall(stopSidecar).catch(errorOf), S)
  handle(IPC.sidecarCheck, z.undefined(), async () => computer.checkSidecar().catch(errorOf), S)
}
