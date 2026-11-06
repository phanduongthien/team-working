import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import {
  EditError,
  applyEdits,
  parseArtifactBlocks,
  type Artifact,
  type ArtifactType,
  type ArtifactVersion,
  type MessageArtifact
} from '@shared/artifacts'
import type { AppDatabase } from '../db/client'
import { artifacts, artifactVersions } from '../db/schema'

const CONTEXT_MAX = 12_000

export type ArtifactServiceDeps = {
  db: AppDatabase
  /** Hội thoại thuộc tài khoản hiện tại? (chặn đọc artifact của tài khoản khác) */
  ownsConversation(id: string): boolean
  now?: () => number
}

/** Artifact theo hội thoại: tạo / sửa từ câu trả lời của trợ lý, người dùng sửa / khôi phục → phiên bản mới. */
export class ArtifactService {
  /** Artifact người dùng vừa sửa (chưa báo cho trợ lý) và lỗi sửa của lượt trước, theo hội thoại. */
  private userEdited = new Map<string, Set<string>>()
  private editErrors = new Map<string, string[]>()

  constructor(private readonly deps: ArtifactServiceDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  list(conversationId: string): Artifact[] {
    if (!this.deps.ownsConversation(conversationId)) return []
    return this.deps.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.conversationId, conversationId))
      .orderBy(desc(artifacts.updatedAt))
      .all()
  }

  get(id: string): Artifact | null {
    const a = this.deps.db.select().from(artifacts).where(eq(artifacts.id, id)).get()
    return a && this.deps.ownsConversation(a.conversationId) ? a : null
  }

  versions(id: string): Omit<ArtifactVersion, 'content'>[] {
    if (!this.get(id)) return []
    return this.deps.db
      .select({
        id: artifactVersions.id,
        artifactId: artifactVersions.artifactId,
        version: artifactVersions.version,
        by: artifactVersions.by,
        createdAt: artifactVersions.createdAt
      })
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, id))
      .orderBy(desc(artifactVersions.version))
      .all()
  }

  content(id: string, version?: number): { artifact: Artifact; version: ArtifactVersion } | null {
    const artifact = this.get(id)
    if (!artifact) return null
    const v = this.deps.db
      .select()
      .from(artifactVersions)
      .where(
        and(
          eq(artifactVersions.artifactId, id),
          eq(artifactVersions.version, version ?? artifact.version)
        )
      )
      .get()
    return v ? { artifact, version: v } : null
  }

  private byTitle(conversationId: string, title: string): Artifact | undefined {
    return this.list(conversationId).find((a) => a.title.toLowerCase() === title.toLowerCase())
  }

  private addVersion(
    artifact: Artifact,
    content: string,
    by: 'assistant' | 'user',
    type?: ArtifactType
  ): Artifact {
    const version = artifact.version + 1
    const updatedAt = this.now()
    this.deps.db
      .insert(artifactVersions)
      .values({
        id: randomUUID(),
        artifactId: artifact.id,
        version,
        content,
        by,
        createdAt: updatedAt
      })
      .run()
    this.deps.db
      .update(artifacts)
      .set({ version, updatedAt, ...(type ? { type } : {}) })
      .where(eq(artifacts.id, artifact.id))
      .run()
    return { ...artifact, version, updatedAt, type: type ?? artifact.type }
  }

  create(conversationId: string, type: ArtifactType, title: string, content: string): Artifact {
    const id = randomUUID()
    const at = this.now()
    this.deps.db
      .insert(artifacts)
      .values({ id, conversationId, title: title.slice(0, 120), type, version: 1, updatedAt: at })
      .run()
    this.deps.db
      .insert(artifactVersions)
      .values({
        id: randomUUID(),
        artifactId: id,
        version: 1,
        content,
        by: 'assistant',
        createdAt: at
      })
      .run()
    return { id, conversationId, title: title.slice(0, 120), type, version: 1, updatedAt: at }
  }

  /**
   * Câu trả lời xong: tách khối artifact, tạo / thêm phiên bản. Khối sửa có đoạn find không khớp đúng một chỗ
   * → không sửa gì, ghi lỗi (hiện trong chat + báo trợ lý ở lượt sau).
   */
  applyReply(conversationId: string, raw: string): { text: string; artifacts: MessageArtifact[] } {
    const { text, ops, invalid } = parseArtifactBlocks(raw)
    const result: MessageArtifact[] = []
    const errors: string[] = invalid.map((e) => `Khối artifact không hợp lệ (${e}).`)
    for (const op of ops) {
      const existing = this.byTitle(conversationId, op.title)
      if (op.kind === 'create') {
        const a = existing
          ? this.addVersion(existing, op.content, 'assistant', op.type)
          : this.create(conversationId, op.type, op.title, op.content)
        result.push({ id: a.id, title: a.title, type: a.type, version: a.version })
        continue
      }
      if (!existing) {
        result.push({ title: op.title, error: 'no_artifact' })
        errors.push(
          `Sửa "${op.title}" lỗi: không có artifact tên này. Hãy tạo mới bằng khối <artifact>.`
        )
        continue
      }
      const current = this.content(existing.id)!
      try {
        const a = this.addVersion(
          existing,
          applyEdits(current.version.content, op.edits),
          'assistant'
        )
        result.push({ id: a.id, title: a.title, type: a.type, version: a.version })
      } catch (err) {
        if (!(err instanceof EditError)) throw err
        const snippet = err.find.slice(0, 80)
        result.push({
          id: existing.id,
          title: existing.title,
          type: existing.type,
          version: existing.version,
          error: err.code
        })
        errors.push(
          err.code === 'not_found'
            ? `Sửa "${existing.title}" lỗi: không tìm thấy đoạn <find>"${snippet}"</find> trong v${existing.version} — chưa sửa gì. Chép đúng nguyên văn đoạn cần sửa rồi thử lại.`
            : `Sửa "${existing.title}" lỗi: đoạn <find>"${snippet}"</find> khớp nhiều chỗ — chưa sửa gì. Lấy đoạn dài hơn để chỉ khớp một chỗ rồi thử lại.`
        )
      }
    }
    if (errors.length) this.editErrors.set(conversationId, errors)
    return { text, artifacts: result }
  }

  /** Người dùng sửa (vd ô trong bảng) → phiên bản mới; trợ lý thấy bản mới ở lần hỏi tiếp theo. */
  saveUserVersion(id: string, content: string): Artifact | null {
    const a = this.get(id)
    if (!a) return null
    const next = this.addVersion(a, content, 'user')
    const set = this.userEdited.get(a.conversationId) ?? new Set<string>()
    set.add(id)
    this.userEdited.set(a.conversationId, set)
    return next
  }

  restore(id: string, version: number): Artifact | null {
    const old = this.content(id, version)
    return old ? this.saveUserVersion(id, old.version.content) : null
  }

  /** Ngữ cảnh cho lượt chat: danh sách artifact, bản người dùng vừa sửa (đầy đủ), lỗi sửa lượt trước. */
  contextFor(conversationId: string): string {
    const list = this.list(conversationId)
    const parts: string[] = []
    if (list.length)
      parts.push(
        `Artifact trong hội thoại này: ${list.map((a) => `"${a.title}" (${a.type}, v${a.version})`).join(', ')}.`
      )
    const edited = this.userEdited.get(conversationId)
    this.userEdited.delete(conversationId)
    let budget = CONTEXT_MAX
    for (const id of edited ?? []) {
      const c = this.content(id)
      if (!c || budget <= 0) continue
      const body = c.version.content.slice(0, budget)
      budget -= body.length
      parts.push(
        `Người dùng vừa tự sửa "${c.artifact.title}" thành v${c.artifact.version}. Nội dung hiện tại:\n<artifact-current title="${c.artifact.title}">\n${body}\n</artifact-current>`
      )
    }
    const errors = this.editErrors.get(conversationId)
    this.editErrors.delete(conversationId)
    if (errors?.length) parts.push(errors.join('\n'))
    return parts.join('\n\n')
  }
}
