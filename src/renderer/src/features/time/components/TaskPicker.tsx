import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Select } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/stores/auth'
import { useTeam } from '@renderer/stores/team'
import { useMyOpenTasks, useProjects } from '../../work/api'
import type { TaskRef } from '../store'

/** Chọn task được giao (nếu đã đăng nhập team) hoặc nhập tên việc tự do — dùng được offline. */
export function TaskPicker({ onChange }: { onChange(task: TaskRef | null): void }) {
  const { t } = useTranslation('time')
  const uid = useAuth((s) => s.session?.user.id)
  const teamId = useTeam((s) => s.currentTeamId)
  const tasks = useMyOpenTasks(teamId, uid).data
  const projects = useProjects(teamId).data
  const projectName = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])
  const [taskId, setTaskId] = useState('')
  const [free, setFree] = useState('')

  const emit = (id: string, text: string): void => {
    const task = tasks?.find((x) => x.id === id)
    if (task) onChange({ taskId: task.id, projectId: task.project_id, title: task.title, projectName: projectName.get(task.project_id) ?? null })
    else onChange(text.trim() ? { taskId: null, projectId: null, title: text.trim(), projectName: null } : null)
  }

  return (
    <div className="space-y-2">
      {!!tasks?.length && (
        <Select
          aria-label={t('task.mine')}
          value={taskId}
          onChange={(e) => {
            setTaskId(e.target.value)
            emit(e.target.value, free)
          }}
        >
          <option value="">{t('task.free')}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
              {projectName.get(task.project_id) ? ` — ${projectName.get(task.project_id)}` : ''}
            </option>
          ))}
        </Select>
      )}
      {!taskId && (
        <Input
          aria-label={t('task.label')}
          placeholder={t('task.placeholder')}
          value={free}
          maxLength={200}
          onChange={(e) => {
            setFree(e.target.value)
            emit('', e.target.value)
          }}
        />
      )}
    </div>
  )
}
