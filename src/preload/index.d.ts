import type { TeamWorkingApi } from '../shared/types'

declare global {
  interface Window {
    api: TeamWorkingApi
  }
}

export {}
