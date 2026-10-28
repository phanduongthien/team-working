import type { FeatureDefinition, TeamRole } from './types'

/** Tính năng có hiện với vai trò hiện tại không (roles rỗng = mọi người, kể cả chưa vào team). */
export function canSeeFeature(feature: Pick<FeatureDefinition, 'roles'>, role: TeamRole | null): boolean {
  return feature.roles.length === 0 || (role !== null && feature.roles.includes(role))
}
