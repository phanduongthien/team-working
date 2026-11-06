import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { usePreferences } from '@renderer/stores/preferences'
import { useChat } from '../store'

/** Trợ lý gợi ý nhóm cho cuộc đang mở — chỉ chuyển khi người dùng bấm đồng ý. */
export function GroupSuggestion({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation('chat')
  const assistant = usePreferences((s) => s.assistant)
  const group = useChat((s) => s.groups.find((g) => g.id === conversation.suggestedGroupId))
  const answer = useChat((s) => s.answerSuggestion)
  if (!group || conversation.groupId) return null
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
      data-testid="group-suggestion"
    >
      <span className="flex min-w-0 items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <span className="truncate">{t('organize.suggestion', { name: assistant.name, group: group.name })}</span>
      </span>
      <span className="flex shrink-0 gap-1.5">
        <Button size="sm" onClick={() => void answer(conversation.id, true)} data-testid="suggestion-accept">
          {t('organize.accept')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void answer(conversation.id, false)}>
          {t('organize.dismiss')}
        </Button>
      </span>
    </div>
  )
}
