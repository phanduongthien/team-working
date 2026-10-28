import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { dayKey, hhmm, type TimeEntry } from '@shared/timesheet'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'

const toMs = (date: string, time: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min).getTime()
}

/** Thêm giờ thủ công hoặc sửa một dòng chấm công. */
export function EntryDialog({ entry, defaultDate, onClose }: { entry?: TimeEntry; defaultDate: string; onClose(saved: boolean): void }) {
  const { t } = useTranslation('time')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [date, setDate] = useState(entry ? dayKey(entry.startedAt) : defaultDate)
  const [start, setStart] = useState(entry ? hhmm(entry.startedAt) : '09:00')
  const [end, setEnd] = useState(entry?.endedAt ? hhmm(entry.endedAt) : '10:00')
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState(false)

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const startedAt = toMs(date, start)
    const endedAt = toMs(date, end)
    if (!(endedAt > startedAt) || !title.trim()) {
      setError(true)
      return
    }
    if (entry) await api.time.update({ id: entry.id, title: title.trim(), note, startedAt, endedAt })
    else await api.time.addManual({ title: title.trim(), note, startedAt, endedAt })
    onClose(true)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent title={entry ? t('sheet.edit') : t('sheet.add')}>
        <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-1.5">
            <Label htmlFor="te-title">{t('form.title')}</Label>
            <Input id="te-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="te-date">{t('form.date')}</Label>
              <Input id="te-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-start">{t('form.start')}</Label>
              <Input id="te-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-end">{t('form.end')}</Label>
              <Input id="te-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="te-note">{t('form.note')}</Label>
            <Input id="te-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{t('form.invalidRange')}</p>}
          <div className="flex justify-end">
            <Button type="submit">{t('common:actions.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
