import { z } from 'zod'
import {
  DEFAULT_ASSISTANT,
  DEFAULT_PROFILE,
  assistantProfileSchema,
  userProfileSchema,
  type AssistantProfile,
  type UserProfile
} from '@shared/schemas'
import { LOCAL_OWNER, type ConversationRepository, type MemoryRepository, type SettingsRepository } from '../db/repositories'

const CLAIMED_KEY = 'account.localClaimedBy'

/** Khóa settings của hồ sơ cá nhân theo tài khoản ('profile' cũ = chưa đăng nhập). */
export const profileKey = (owner: string): string => (owner === LOCAL_OWNER ? 'profile' : `profile:${owner}`)

/** Khóa settings của tên/tính cách trợ lý theo tài khoản ('assistant' cũ = chưa đăng nhập). */
export const assistantKey = (owner: string): string => (owner === LOCAL_OWNER ? 'assistant' : `assistant:${owner}`)

const isEmptyProfile = (p: UserProfile): boolean => Object.values(p).every((v) => !v.trim())

/**
 * Người đang dùng app (theo tài khoản GitHub/Supabase). Hồ sơ, trí nhớ, đề xuất, lịch sử chat
 * và cài đặt trợ lý trên máy đều gắn với tài khoản này; đổi tài khoản thì thấy dữ liệu khác.
 *
 * Dữ liệu tạo trước khi có tài khoản ('local') được giao cho tài khoản ĐẦU TIÊN đăng nhập
 * trên máy (một lần duy nhất) để người dùng cũ không mất dữ liệu.
 */
export class AccountScope {
  private owner = LOCAL_OWNER

  constructor(
    private readonly deps: {
      memories: MemoryRepository
      conversations: ConversationRepository
      settings: SettingsRepository
    }
  ) {
    // Bản cũ: trợ lý dùng chung một khóa. Máy đã có tài khoản nhận dữ liệu → trợ lý cũng là của tài khoản đó.
    const claimedBy = this.claimedBy()
    if (claimedBy && !this.hasKey(assistantKey(claimedBy)) && this.hasKey(assistantKey(LOCAL_OWNER))) {
      this.setAssistant(this.getAssistant(LOCAL_OWNER), claimedBy)
    }
  }

  get current(): string {
    return this.owner
  }

  getProfile(owner = this.owner): UserProfile {
    return this.deps.settings.get(profileKey(owner), userProfileSchema, DEFAULT_PROFILE)
  }

  setProfile(profile: UserProfile, owner = this.owner): UserProfile {
    return this.deps.settings.set(profileKey(owner), profile)
  }

  getAssistant(owner = this.owner): AssistantProfile {
    return this.deps.settings.get(assistantKey(owner), assistantProfileSchema, DEFAULT_ASSISTANT)
  }

  setAssistant(profile: AssistantProfile, owner = this.owner): AssistantProfile {
    return this.deps.settings.set(assistantKey(owner), profile)
  }

  private claimedBy(): string | null {
    return this.deps.settings.get(CLAIMED_KEY, z.string().nullable(), null)
  }

  private hasKey(key: string): boolean {
    return this.deps.settings.get(key, z.unknown(), undefined) !== undefined
  }

  private hasData(owner: string): boolean {
    return (
      this.deps.memories.countFor(owner) > 0 ||
      this.deps.conversations.countFor(owner) > 0 ||
      !isEmptyProfile(this.getProfile(owner))
    )
  }

  /** Đổi người dùng hiện tại. Trả về true nếu vừa nhận dữ liệu 'local'. */
  set(uid: string | null): { owner: string; claimed: boolean } {
    this.owner = uid ?? LOCAL_OWNER
    if (!uid) return { owner: this.owner, claimed: false }

    const { memories, conversations, settings } = this.deps
    if (this.claimedBy()) return { owner: this.owner, claimed: false }
    // Tài khoản đầu tiên đăng nhập trên máy: đánh dấu dù có dữ liệu để nhận hay không.
    settings.set(CLAIMED_KEY, uid)

    const localHasData = this.hasData(LOCAL_OWNER) || this.hasKey(assistantKey(LOCAL_OWNER))
    if (this.hasData(uid) || !localHasData) return { owner: this.owner, claimed: false }

    memories.reassign(LOCAL_OWNER, uid)
    conversations.reassign(LOCAL_OWNER, uid)
    this.setProfile(this.getProfile(LOCAL_OWNER), uid)
    this.setProfile(DEFAULT_PROFILE, LOCAL_OWNER)
    if (!this.hasKey(assistantKey(uid))) this.setAssistant(this.getAssistant(LOCAL_OWNER), uid)
    return { owner: this.owner, claimed: true }
  }
}
