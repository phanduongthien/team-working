import { chatFeature } from './chat'
import { claudeCheckFeature } from './claude-check'
import { dashboardFeature } from './dashboard'
import { memoryFeature } from './memory'
import { notificationsFeature } from './notifications'
import { settingsFeature } from './settings'
import { teamFeature } from './team'
import type { FeatureDefinition } from './types'
import { workFeature } from './work'

/**
 * Nơi DUY NHẤT đăng ký tính năng. Thêm tính năng mới: tạo thư mục trong features/
 * (xem skill add-feature-module) rồi thêm vào danh sách này.
 */
export const features: FeatureDefinition[] = [
  chatFeature,
  memoryFeature,
  workFeature,
  dashboardFeature,
  teamFeature,
  notificationsFeature,
  claudeCheckFeature,
  settingsFeature
]
