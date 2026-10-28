import { FolderOpen, Lock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { useChat } from '../store'

/**
 * Chế độ Code: chọn thư mục dự án và bật/tắt quyền sửa file.
 * Mặc định chỉ đọc; bật sửa phải xác nhận, và mỗi lần sửa vẫn phải duyệt diff.
 */
export function CodeBar({ conversation, busy }: { conversation: Conversation | undefined; busy: boolean }) {
  const { t } = useTranslation('chat')
  const { chooseFolder, setCodeWrite } = useChat()
  const [confirm, setConfirm] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs" data-testid="code-bar">
      <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void chooseFolder()}>
        <FolderOpen />
        {conversation?.cwd ? t('code.changeFolder') : t('code.chooseFolder')}
      </Button>
      {conversation?.cwd ? (
        <code className="min-w-0 truncate" title={conversation.cwd}>
          {conversation.cwd}
        </code>
      ) : (
        <span className="text-muted-foreground">{t('code.noFolder')}</span>
      )}
      {conversation?.cwd && (
        <label className={cn('ml-auto flex items-center gap-1.5', conversation.codeWrite && 'text-orange-700 dark:text-orange-300')}>
          <input
            type="checkbox"
            checked={conversation.codeWrite}
            disabled={busy}
            onChange={(e) => (e.target.checked ? setConfirm(true) : void setCodeWrite(conversation.id, false))}
          />
          {conversation.codeWrite ? <ShieldAlert className="size-3.5" /> : <Lock className="size-3.5" />}
          {conversation.codeWrite ? t('code.writeOn') : t('code.readOnly')}
        </label>
      )}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={t('code.enableTitle')} description={t('code.enableBody', { folder: conversation?.cwd })}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>{t('code.rule1')}</li>
            <li>{t('code.rule2')}</li>
            <li>{t('code.rule3')}</li>
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (conversation) void setCodeWrite(conversation.id, true)
                setConfirm(false)
              }}
            >
              {t('code.enable')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
