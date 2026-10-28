import { create } from 'zustand'
import type { CliStatus } from '@shared/ai'
import { api } from '@renderer/lib/api'

type CliState = {
  status: CliStatus | null
  checking: boolean
  check(): Promise<CliStatus>
}

export const useCliStatus = create<CliState>((set) => ({
  status: null,
  checking: false,
  async check() {
    set({ checking: true })
    try {
      const status = await api.cli.check()
      set({ status })
      return status
    } catch (err) {
      const status: CliStatus = { state: 'error', message: (err as Error).message }
      set({ status })
      return status
    } finally {
      set({ checking: false })
    }
  }
}))
