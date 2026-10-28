import {
  TASK_PRIORITIES,
  taskPlanOutputSchema,
  type PlanRequest,
  type PlannedTask,
  type TaskPriority
} from '@shared/schemas'
import { extractJsonBlock } from '../memory/extraction'

/** Dữ liệu dự án + thành viên (kỹ năng, giờ việc đang mở) → prompt cho skill project-planner. */
export function buildPlanPrompt(req: PlanRequest): string {
  const members = req.members.length
    ? req.members
        .map((m) => `- id=${m.id} | ${m.name} | kỹ năng: ${m.skills.join(', ') || '(chưa khai báo)'} | đang có ${m.openHours} giờ việc mở`)
        .join('\n')
    : '(chưa có thành viên)'
  return [
    'Chia dự án sau thành các task và gợi ý phân công theo đúng hướng dẫn. Đây chỉ là BẢN NHÁP để manager duyệt.',
    'Chỉ trả về MỘT khối JSON {"type":"task_plan",...}. assigneeId phải là một id trong danh sách thành viên hoặc null.',
    '',
    `Hôm nay: ${req.today}`,
    `## Dự án: ${req.projectName}`,
    `Mô tả: ${req.description || '(không có)'}`,
    `Mục tiêu: ${req.goal || '(không có)'}`,
    `Hạn chót: ${req.dueDate ?? '(chưa đặt)'}`,
    req.instructions ? `Yêu cầu thêm của manager: ${req.instructions}` : '',
    '',
    '## Thành viên',
    members
  ]
    .filter((l) => l !== '')
    .join('\n')
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse + làm sạch bản nháp: assignee lạ → null, priority lạ → medium,
 * giờ ước lượng ngoài khoảng → null, ngày sai định dạng → null. Trả null nếu sai định dạng.
 */
export function parsePlan(text: string, memberIds: string[]): PlannedTask[] | null {
  const parsed = taskPlanOutputSchema.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  const members = new Set(memberIds)
  return parsed.data.tasks.map((t) => ({
    title: t.title,
    description: t.description,
    assigneeId: t.assigneeId && members.has(t.assigneeId) ? t.assigneeId : null,
    priority: (TASK_PRIORITIES as readonly string[]).includes(t.priority ?? '') ? (t.priority as TaskPriority) : 'medium',
    estimateHours:
      typeof t.estimateHours === 'number' && t.estimateHours > 0 && t.estimateHours <= 1000
        ? Math.round(t.estimateHours * 4) / 4
        : null,
    dueDate: t.dueDate && ISO.test(t.dueDate) ? t.dueDate : null,
    dependsOn: t.dependsOn.slice(0, 10),
    reason: t.reason
  }))
}
