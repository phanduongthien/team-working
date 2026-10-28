import { chatFeature } from './chat'
import { claudeCheckFeature } from './claude-check'
import { dashboardFeature } from './dashboard'
import { feedbackFeature } from './feedback'
import { ideasFeature } from './ideas'
import { learningFeature } from './learning'
import { memoryFeature } from './memory'
import { notificationsFeature } from './notifications'
import { settingsFeature } from './settings'
import { teamFeature } from './team'
import { timeFeature } from './time'
import { todayFeature } from './today'
import type { FeatureDefinition } from './types'
import { workFeature } from './work'

/**
 * Nơi DUY NHẤT đăng ký tính năng. Thêm tính năng mới: tạo thư mục trong features/
 * (xem skill add-feature-module) rồi thêm vào danh sách này.
 */
export const features: FeatureDefinition[] = [
  chatFeature,
  todayFeature,
  memoryFeature,
  workFeature,
  dashboardFeature,
  feedbackFeature,
  learningFeature,
  timeFeature,
  teamFeature,
  notificationsFeature,
  ideasFeature,
  claudeCheckFeature,
  settingsFeature
]
