import { z } from 'zod'
import { DEFAULT_PROFILE, userProfileSchema, type UserProfile } from '@shared/schemas'
import { LOCAL_OWNER, type MemoryRepository, type SettingsRepository } from '../db/repositories'

const CLAIMED_KEY = 'account.localClaimedBy'

/** Khóa settings của hồ sơ cá nhân theo tài khoản ('profile' cũ = chưa đăng nhập). */
export const profileKey = (owner: string): string => (owner === LOCAL_OWNER ? 'profile' : `profile:${owner}`)

const isEmptyProfile = (p: UserProfile): boolean => Object.values(p).every((v) => !v.trim())

/**
 * Người đang dùng app (theo tài khoản GitHub/Supabase). Hồ sơ + trí nhớ + đề xuất trên máy
 * đều gắn với tài khoản này; đổi tài khoản thì thấy dữ liệu khác.
 *
 * Dữ liệu tạo trước khi có tài khoản ('local') được giao cho tài khoản ĐẦU TIÊN đăng nhập
 * trên máy (một lần duy nhất) để người dùng cũ không mất trí nhớ.
 */
export class AccountScope {
  private owner = LOCAL_OWNER

  constructor(
    private readonly deps: { memories: MemoryRepository; settings: SettingsRepository }
  ) {}

  get current(): string {
    return this.owner
  }

  getProfile(owner = this.owner): UserProfile {
    return this.deps.settings.get(profileKey(owner), userProfileSchema, DEFAULT_PROFILE)
  }

  setProfile(profile: UserProfile, owner = this.owner): UserProfile {
    return this.deps.settings.set(profileKey(owner), profile)
  }

  /** Đổi người dùng hiện tại. Trả về true nếu vừa nhận dữ liệu 'local'. */
  set(uid: string | null): { owner: string; claimed: boolean } {
    this.owner = uid ?? LOCAL_OWNER
    if (!uid) return { owner: this.owner, claimed: false }

    const { memories, settings } = this.deps
    const claimedBy = settings.get(CLAIMED_KEY, z.string().nullable(), null)
    if (claimedBy) return { owner: this.owner, claimed: false }
    // Tài khoản đầu tiên đăng nhập trên máy: đánh dấu dù có dữ liệu để nhận hay không.
    settings.set(CLAIMED_KEY, uid)

    const accountEmpty = memories.countFor(uid) === 0 && isEmptyProfile(this.getProfile(uid))
    const localProfile = this.getProfile(LOCAL_OWNER)
    const localHasData = memories.countFor(LOCAL_OWNER) > 0 || !isEmptyProfile(localProfile)
    if (!accountEmpty || !localHasData) return { owner: this.owner, claimed: false }

    memories.reassign(LOCAL_OWNER, uid)
    this.setProfile(localProfile, uid)
    this.setProfile(DEFAULT_PROFILE, LOCAL_OWNER)
    return { owner: this.owner, claimed: true }
  }
}
