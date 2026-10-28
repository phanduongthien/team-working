import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export type TeamRole = 'owner' | 'manager' | 'member'

export type FeatureResources = { vi: Record<string, unknown>; en: Record<string, unknown> }

/** Mỗi tính năng tự mô tả và được đăng ký trong registry.ts — không sửa lõi app. */
export type FeatureDefinition = {
  /** Cũng là namespace i18n của tính năng. */
  id: string
  /** Khóa i18n cho tên trên menu, trong namespace của tính năng. */
  titleKey: string
  icon: LucideIcon
  route: string
  /** Vai trò được thấy tính năng; rỗng = mọi người (kể cả chưa vào team). */
  roles: TeamRole[]
  component: ComponentType
  i18n: FeatureResources
  /** Vị trí trên thanh điều hướng; `false` = không hiện (vẫn có route). */
  nav: 'top' | 'bottom' | false
  /** Chạy một lần khi app khởi động (đăng ký listener…); trả về hàm dọn dẹp. */
  setup?: () => () => void
  /** Hook trả về số hiển thị trên biểu tượng menu (0 = ẩn). */
  useBadge?: () => number
}
