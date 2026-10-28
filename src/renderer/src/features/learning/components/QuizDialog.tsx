import { BrainCircuit, Check, ChevronLeft, ChevronRight, Layers, LoaderCircle, RotateCw, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { QuizGrade, QuizQuestion } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { usePreferences } from '@renderer/stores/preferences'
import { useSaveAttempt } from '../api'
import { gradeLocally, mergeResults, score, type QuestionResult } from '../logic'

type Props = { topic: string; context: string; pathId: string | null; stepId: string | null; onClose(): void }

/** Quiz do trợ lý soạn: làm bài (trắc nghiệm chấm trên máy, tự luận nhờ trợ lý) hoặc lật flashcard. */
export function QuizDialog({ topic, context, pathId, stepId, onClose }: Props) {
  const { t } = useTranslation('learning')
  const language = usePreferences((s) => s.assistant.language)
  const save = useSaveAttempt()
  const [count, setCount] = useState(6)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [results, setResults] = useState<QuestionResult[] | null>(null)
  const [weak, setWeak] = useState<string[]>([])
  const [busy, setBusy] = useState<'generate' | 'grade' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState(false)
  const [card, setCard] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [remembered, setRemembered] = useState(false)

  const errText = (code: string): string => t('quiz.failed', { message: t(`work:errors.${code}`, { defaultValue: code }) })

  const generate = async (): Promise<void> => {
    setBusy('generate')
    setError(null)
    setResults(null)
    try {
      const res = await api.learning.makeQuiz({ topic, context, count, language })
      if ('error' in res) setError(errText(res.error))
      else {
        setQuestions(res.questions)
        setAnswers(res.questions.map(() => ''))
        setCard(0)
      }
    } finally {
      setBusy(null)
    }
  }

  const submit = async (): Promise<void> => {
    if (!questions) return
    setBusy('grade')
    const local = gradeLocally(questions, answers)
    let ai: QuizGrade | null = null
    try {
      // Luôn nhờ trợ lý nêu chỗ yếu; chấm thêm câu tự luận nếu có.
      const res = await api.learning.grade({
        topic,
        language,
        items: questions.map((q, i) => ({ ...q, userAnswer: answers[i] ?? '', localCorrect: local[i] }))
      })
      if (!('error' in res)) ai = res
    } finally {
      const merged = mergeResults(local, ai)
      setResults(merged)
      setWeak(ai?.weakPoints ?? [])
      save.mutate({ pathId, stepId, topic, questions, answers, score: score(merged), weakPoints: ai?.weakPoints ?? [] })
      setBusy(null)
    }
  }

  const rememberWeak = async (): Promise<void> => {
    for (const point of weak) await api.learning.suggestMemory(t('quiz.memoryText', { point }).slice(0, 500), 'skill')
    setRemembered(true)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('quiz.heading', { topic })} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="space-y-4" data-testid="quiz">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="quiz-count">{t('quiz.count')}</Label>
              <Input id="quiz-count" type="number" min={3} max={15} className="w-20" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <Button onClick={() => void generate()} disabled={!!busy}>
              {busy === 'generate' ? <LoaderCircle className="animate-spin" /> : <BrainCircuit />}
              {busy === 'generate' ? t('quiz.generating') : t('quiz.generate')}
            </Button>
            {questions && (
              <Button variant="outline" onClick={() => (setCards(!cards), setFlipped(false))}>
                <Layers />
                {cards ? t('quiz.quizMode') : t('quiz.flashcards')}
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {questions && cards && (
            <div className="space-y-3">
              <button
                type="button"
                className="flex min-h-48 w-full items-center justify-center rounded-xl border bg-muted/40 p-6 text-center"
                onClick={() => setFlipped(!flipped)}
                data-testid="flashcard"
              >
                {flipped ? (
                  <span className="space-y-2">
                    <span className="block text-lg font-semibold">{questions[card].answer}</span>
                    {questions[card].explain && <span className="block text-sm text-muted-foreground">{questions[card].explain}</span>}
                  </span>
                ) : (
                  <span className="text-lg">{questions[card].q}</span>
                )}
              </button>
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" size="icon-sm" title={t('quiz.prevCard')} disabled={card === 0} onClick={() => (setCard(card - 1), setFlipped(false))}>
                  <ChevronLeft />
                </Button>
                <span className="text-sm">
                  {card + 1}/{questions.length}
                </span>
                <Button variant="ghost" size="icon-sm" title={t('quiz.nextCard')} disabled={card === questions.length - 1} onClick={() => (setCard(card + 1), setFlipped(false))}>
                  <ChevronRight />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setFlipped(!flipped)}>
                  <RotateCw />
                  {t('quiz.flip')}
                </Button>
              </div>
            </div>
          )}

          {questions && !cards && (
            <ol className="space-y-4">
              {questions.map((q, i) => {
                const r = results?.[i]
                return (
                  <li key={i} className={cn('space-y-2 rounded-md border p-3', r && (r.correct ? 'border-green-500/50' : 'border-destructive/50'))} data-testid="quiz-question">
                    <p className="text-sm font-medium">
                      {i + 1}. {q.q}
                    </p>
                    {q.choices.length ? (
                      <div className="space-y-1">
                        {q.choices.map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`q-${i}`}
                              disabled={!!results}
                              checked={answers[i] === c}
                              onChange={() => setAnswers((a) => a.map((x, j) => (j === i ? c : x)))}
                            />
                            {c}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Input
                        aria-label={t('quiz.answerPlaceholder')}
                        placeholder={t('quiz.answerPlaceholder')}
                        disabled={!!results}
                        value={answers[i] ?? ''}
                        onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                    )}
                    {r && (
                      <div className="space-y-1 text-xs">
                        <span className={cn('flex items-center gap-1 font-medium', r.correct ? 'text-green-600' : 'text-destructive')}>
                          {r.correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                          {r.correct ? t('quiz.correct') : t('quiz.wrong')}
                        </span>
                        {r.feedback && <p>{r.feedback}</p>}
                        {!r.correct && <p className="text-muted-foreground">{t('quiz.answer', { answer: q.answer })}</p>}
                        {q.explain && <p className="text-muted-foreground">{q.explain}</p>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}

          {questions && !cards && !results && (
            <Button onClick={() => void submit()} disabled={!!busy}>
              {busy === 'grade' && <LoaderCircle className="animate-spin" />}
              {busy === 'grade' ? t('quiz.grading') : t('quiz.submit')}
            </Button>
          )}

          {results && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="font-semibold" data-testid="quiz-score">
                {t('quiz.score', { score: score(results), total: results.length })}
              </p>
              {weak.length > 0 && (
                <>
                  <p className="text-sm font-medium">{t('quiz.weakPoints')}</p>
                  <ul className="list-disc pl-5 text-sm">
                    {weak.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  {remembered ? (
                    <p className="text-sm text-muted-foreground">{t('quiz.remembered')}</p>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void rememberWeak()}>
                      {t('quiz.remember')}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
