import { chatFeature } from './chat'
import { claudeCheckFeature } from './claude-check'
import { memoryFeature } from './memory'
import { settingsFeature } from './settings'
import type { FeatureDefinition } from './types'

/**
 * Nơi DUY NHẤT đăng ký tính năng. Thêm tính năng mới: tạo thư mục trong features/
 * (xem skill add-feature-module) rồi thêm vào danh sách này.
 */
export const features: FeatureDefinition[] = [chatFeature, memoryFeature, claudeCheckFeature, settingsFeature]
