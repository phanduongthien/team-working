import { Bug, Check, Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  ACCENTS,
  LANGUAGES,
  PERSONAS,
  THEMES,
  assistantProfileSchema,
  type AssistantProfile
} from '@shared/schemas'
import { AssistantAvatar } from '@renderer/components/AssistantAvatar'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { usePreferences } from '@renderer/stores/preferences'
import { PRESET_AVATARS, imageFileToAvatar } from '../avatar'
import { AiSection } from './AiSection'

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function AssistantSection() {
  const { t } = useTranslation('settings')
  const saved = usePreferences((s) => s.assistant)
  const saveAssistant = usePreferences((s) => s.saveAssistant)
  const [draft, setDraft] = useState<AssistantProfile>(saved)
  const [status, setStatus] = useState<'idle' | 'saved' | 'uploadError'>('idle')

  const update = (patch: Partial<AssistantProfile>): void => {
    setDraft((d) => ({ ...d, ...patch }))
    setStatus('idle')
  }
  const valid = assistantProfileSchema.safeParse(draft).success
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const onUpload = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      update({ avatar: await imageFileToAvatar(file) })
    } catch {
      setStatus('uploadError')
    }
  }

  return (
    <Section title={t('assistant.heading')} description={t('assistant.description')}>
      <div className="space-y-1.5">
        <Label htmlFor="assistant-name">{t('assistant.name')}</Label>
        <Input id="assistant-name" value={draft.name} maxLength={40} onChange={(e) => update({ name: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <Label>{t('assistant.avatar')}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantAvatar avatar={draft.avatar} className="size-11 text-2xl ring-2 ring-primary" />
          {PRESET_AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              aria-label={a}
              className={cn('rounded-full p-0.5 hover:bg-muted', draft.avatar === a && 'ring-2 ring-primary')}
              onClick={() => update({ avatar: a })}
            >
              <AssistantAvatar avatar={a} />
            </button>
          ))}
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload />
              {t('assistant.upload')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => void onUpload(e.target.files?.[0])}
              />
            </label>
          </Button>
        </div>
        {status === 'uploadError' && <p className="text-sm text-destructive">{t('assistant.uploadError')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="assistant-persona">{t('assistant.persona')}</Label>
          <Select
            id="assistant-persona"
            value={draft.persona}
            onChange={(e) => update({ persona: e.target.value as AssistantProfile['persona'] })}
          >
            {PERSONAS.map((p) => (
              <option key={p} value={p}>
                {t(`assistant.personas.${p}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assistant-language">{t('assistant.language')}</Label>
          <Select
            id="assistant-language"
            value={draft.language}
            onChange={(e) => update({ language: e.target.value as AssistantProfile['language'] })}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`assistant.languages.${l}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {draft.persona === 'custom' && (
        <div className="space-y-1.5">
          <Label htmlFor="assistant-custom">{t('assistant.customPersona')}</Label>
          <Textarea
            id="assistant-custom"
            rows={3}
            maxLength={500}
            placeholder={t('assistant.customPlaceholder')}
            value={draft.customPersona}
            onChange={(e) => update({ customPersona: e.target.value })}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {status === 'saved' && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" />
            {t('common:actions.saved')}
          </span>
        )}
        <Button
          disabled={!valid || !dirty}
          onClick={async () => {
            await saveAssistant(draft)
            setStatus('saved')
          }}
        >
          {t('common:actions.save')}
        </Button>
      </div>
    </Section>
  )
}

function AppearanceSection() {
  const { t } = useTranslation('settings')
  const appearance = usePreferences((s) => s.appearance)
  const saveAppearance = usePreferences((s) => s.saveAppearance)

  return (
    <Section title={t('appearance.heading')}>
      <div className="space-y-1.5">
        <Label>{t('appearance.theme')}</Label>
        <div className="flex gap-2">
          {THEMES.map((theme) => (
            <Button
              key={theme}
              size="sm"
              variant={appearance.theme === theme ? 'default' : 'outline'}
              onClick={() => void saveAppearance({ ...appearance, theme })}
            >
              {t(`appearance.themes.${theme}`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('appearance.accent')}</Label>
        <div className="flex gap-3">
          {ACCENTS.map((accent) => (
            <button
              key={accent}
              type="button"
              data-accent={accent}
              title={t(`appearance.accents.${accent}`)}
              aria-label={t(`appearance.accents.${accent}`)}
              aria-pressed={appearance.accent === accent}
              className={cn(
                'size-8 rounded-full bg-primary ring-offset-2 ring-offset-background',
                appearance.accent === accent && 'ring-2 ring-primary'
              )}
              onClick={() => void saveAppearance({ ...appearance, accent })}
            />
          ))}
        </div>
      </div>
    </Section>
  )
}

export function SettingsPage() {
  const { t } = useTranslation('settings')
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <AppearanceSection />
        <AssistantSection />
        <Section title={t('claude.heading')} description={t('claude.description')}>
          <AiSection />
        </Section>
        <Section title={t('support.heading')} description={t('support.description')}>
          <Button variant="outline" asChild>
            <Link to="/ideas?kind=bug" data-testid="report-bug">
              <Bug />
              {t('support.reportBug')}
            </Link>
          </Button>
        </Section>
      </div>
    </div>
  )
}
