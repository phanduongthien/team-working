/** Chọn skill liên quan cho một câu hỏi — không nhồi hết skill vào system prompt. */

export type SkillCandidate = { name: string; description: string }

export const MAX_AUTO = 2
export const MAX_EXPLICIT = 3
/** Điểm tối thiểu để tự chọn theo description (1 từ ≥3 chữ = 1 điểm, 1 cụm 2 từ = 2 điểm). */
export const MIN_SCORE = 3

const STOPWORDS = new Set(
  (
    'cac cho cua khi nhung mot nay kia voi trong tren duoi hay hoac thi la va de ve tu den nhu ' +
    'duoc dung dang can phai minh ban toi co khong lam the nao gi sao rat nua cung neu vao ra ' +
    'the and for the with use when this that from into your you are can how what'
  ).split(' ')
)

/** Chữ thường, bỏ dấu tiếng Việt, đ → d. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
}

const words = (text: string): string[] => normalize(text).match(/[a-z0-9]+/g) ?? []

function grams(text: string): { uni: Set<string>; bi: Set<string> } {
  const w = words(text)
  const uni = new Set(w.filter((x) => x.length >= 3 && !STOPWORDS.has(x)))
  const bi = new Set<string>()
  for (let i = 0; i + 1 < w.length; i++) {
    if (STOPWORDS.has(w[i]) && STOPWORDS.has(w[i + 1])) continue
    bi.add(`${w[i]} ${w[i + 1]}`)
  }
  return { uni, bi }
}

/** Skill được gọi đích danh: "dùng skill slide-pixel", "skill “slide-pixel”", "/slide-pixel". */
export function explicitSkills(text: string, names: readonly string[]): string[] {
  const t = normalize(text)
  const known = new Set(names)
  const found: string[] = []
  const add = (n: string): void => {
    if (known.has(n) && !found.includes(n)) found.push(n)
  }
  for (const m of t.matchAll(/\bskill\s*[:"'“”‘’`]*\s*([a-z0-9][a-z0-9-]*)/g)) add(m[1])
  for (const m of t.matchAll(/(?:^|\s)\/([a-z0-9][a-z0-9-]*)/g)) add(m[1])
  // Tên có gạch nối gần như không trùng chữ thường → nhắc tên là gọi.
  for (const n of names) {
    if (n.includes('-') && new RegExp(`(^|[^a-z0-9-])${n}($|[^a-z0-9-])`).test(t)) add(n)
  }
  return found.slice(0, MAX_EXPLICIT)
}

export function relevance(text: string, skill: SkillCandidate): number {
  const q = grams(text)
  const d = grams(`${skill.name.replace(/-/g, ' ')} ${skill.description}`)
  let score = 0
  for (const u of d.uni) if (q.uni.has(u)) score += 1
  for (const b of d.bi) if (q.bi.has(b)) score += 2
  return score
}

/** Gọi đích danh trước, sau đó tối đa MAX_AUTO skill liên quan nhất (đủ điểm). */
export function selectSkills(text: string, skills: readonly SkillCandidate[]): string[] {
  const explicit = explicitSkills(
    text,
    skills.map((s) => s.name)
  )
  const auto = skills
    .filter((s) => !explicit.includes(s.name))
    .map((s) => ({ name: s.name, score: relevance(text, s) }))
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_AUTO)
    .map((s) => s.name)
  return [...explicit, ...auto]
}
