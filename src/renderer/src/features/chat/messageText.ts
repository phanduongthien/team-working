import type { useTranslation } from 'react-i18next'
import { hideArtifactBlocks } from '@shared/artifacts'
import { stripExpressTags } from '@shared/expressive'
import type { Message } from '@shared/types'

type T = ReturnType<typeof useTranslation<'chat'>>['t']

/** Đoạn trích một dòng của tin (cho khối trả lời / thanh ghim). */
export function excerptOf(message: Message, t: T, max = 120): string {
  if (message.recalledAt) return t('messages.recalled')
  const text = stripExpressTags(hideArtifactBlocks(message.content).text, false).replace(/\s+/g, ' ').trim()
  if (text) return text.length > max ? `${text.slice(0, max)}…` : text
  if (message.attachments.length) return `📎 ${message.attachments.map((a) => a.name).join(', ')}`
  if (message.media) return message.media.kind === 'sticker' ? t('messages.sticker') : t('messages.gif')
  return '…'
}

/** Cuộn tới một tin và nháy nhẹ để dễ thấy. */
export function scrollToMessage(id: string): boolean {
  const el = document.getElementById(`msg-${id}`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.dataset.flash = 'true'
  setTimeout(() => delete el.dataset.flash, 1200)
  return true
}
