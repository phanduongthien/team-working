import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_PROFILE, type UserProfile } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useMemory } from '../store'

type Field = { key: keyof UserProfile; multiline?: boolean; placeholder?: string; max: number }

const FIELDS: Field[] = [
  { key: 'name', max: 80 },
  { key: 'role', max: 120, placeholder: 'rolePlaceholder' },
  { key: 'goals', max: 1000, multiline: true },
  { key: 'skills', max: 1000, multiline: true },
  { key: 'interests', max: 500 },
  { key: 'answerStyle', max: 500, placeholder: 'answerStylePlaceholder' }
]

export function ProfileForm() {
  const { t } = useTranslation('memory')
  const saveProfile = useMemory((s) => s.saveProfile)
  // Đổi tài khoản / đồng bộ xong → tải lại hồ sơ của người đang đăng nhập.
  const profileVersion = useMemory((s) => s.profileVersion)
  const [saved, setSaved] = useState<UserProfile>(DEFAULT_PROFILE)
  const [draft, setDraft] = useState<UserProfile>(DEFAULT_PROFILE)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    void api.memory.getProfile().then((p) => {
      setSaved(p)
      setDraft(p)
    })
  }, [profileVersion])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map((f) => {
          const id = `profile-${f.key}`
          const props = {
            id,
            maxLength: f.max,
            value: draft[f.key],
            placeholder: f.placeholder ? t(`profile.${f.placeholder}`) : undefined,
            onChange: (e: { target: { value: string } }) => {
              setDraft((d) => ({ ...d, [f.key]: e.target.value }))
              setJustSaved(false)
            }
          }
          return (
            <div key={f.key} className={f.multiline ? 'col-span-2 space-y-1.5' : 'space-y-1.5'}>
              <Label htmlFor={id}>{t(`profile.${f.key}`)}</Label>
              {f.multiline ? <Textarea rows={2} {...props} /> : <Input {...props} />}
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" />
            {t('common:actions.saved')}
          </span>
        )}
        <Button
          disabled={!dirty}
          onClick={async () => {
            const p = await saveProfile(draft)
            setSaved(p)
            setDraft(p)
            setJustSaved(true)
          }}
        >
          {t('common:actions.save')}
        </Button>
      </div>
    </div>
  )
}
