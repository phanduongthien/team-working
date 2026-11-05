import { shell } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import { computerPreviewSchema, computerSetEnabledSchema } from '@shared/schemas'
import type { ComputerUseService } from '../computer/service'
import type { HandleFn } from './register'

export type ComputerIpcDeps = {
  handle: HandleFn
  computer: ComputerUseService
  logsDir: string
}

/** IPC điều khiển máy tính (giai đoạn chỉ xem). Lỗi nghiệp vụ trả về dạng { error } để UI hiện thông báo. */
export function registerComputerIpc({ handle, computer, logsDir }: ComputerIpcDeps): void {
  const guard = <T>(fn: () => T): T | { error: string } => {
    try {
      return fn()
    } catch (err) {
      return { error: (err as Error).message }
    }
  }

  handle(IPC.computerStatus, z.undefined(), () => computer.status())
  handle(IPC.computerSetEnabled, computerSetEnabledSchema, ({ enabled, acceptWarning }) =>
    guard(() => computer.setEnabled(enabled, acceptWarning))
  )
  handle(IPC.computerSetScreenAccess, z.boolean(), (on) => guard(() => computer.setScreenAccess(on)))
  handle(IPC.computerEmergencyStop, z.undefined(), () => computer.killSwitch.trigger())
  handle(IPC.computerPreview, computerPreviewSchema, async ({ display }) => {
    try {
      return await computer.preview(display)
    } catch (err) {
      return { error: (err as Error).message }
    }
  })
  handle(IPC.computerOpenLogs, z.undefined(), async () => {
    await shell.openPath(logsDir)
  })
}
