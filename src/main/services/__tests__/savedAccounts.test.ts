import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_SAVED_ACCOUNTS, SavedAccountStore } from '../savedAccounts'
import type { Encryptor } from '../secrets'

const fakeCrypto: Encryptor = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString()
}

const uid = (n: number): string => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
const info = (n: number) => ({ id: uid(n), login: `user${n}`, name: `User ${n}`, email: `u${n}@x.dev`, avatarUrl: null })
const sess = (tag: string) => ({ accessToken: `at-${tag}`, refreshToken: `rt-${tag}` })

let dir: string
let store: SavedAccountStore
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tw-acc-'))
  store = new SavedAccountStore(dir, fakeCrypto)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SavedAccountStore', () => {
  it('ghi nhận tài khoản đã đăng nhập, mới dùng gần nhất lên đầu, mặc định KHÔNG lưu phiên', () => {
    store.record(info(1), sess('a'), 1000)
    store.record(info(2), sess('b'), 2000)
    expect(store.list().map((a) => [a.login, a.remembered])).toEqual([
      ['user2', false],
      ['user1', false]
    ])
    expect(store.session(uid(1))).toBeNull()
  })

  it('ghi nhớ → lưu phiên; làm mới phiên → thay refresh token mới; bỏ ghi nhớ → xóa phiên', () => {
    store.record(info(1), sess('a'))
    store.remember(uid(1), true, sess('a'))
    expect(store.session(uid(1))).toEqual(sess('a'))
    store.record(info(1), sess('a2'))
    expect(store.session(uid(1))).toEqual(sess('a2'))
    expect(store.list()[0].remembered).toBe(true)
    store.remember(uid(1), false)
    expect(store.session(uid(1))).toBeNull()
    expect(store.list()).toHaveLength(1)
  })

  it('file được mã hóa: không chứa token hay email dạng rõ', () => {
    store.record(info(1), sess('secret-token'))
    store.remember(uid(1), true, sess('secret-token'))
    const raw = readFileSync(join(dir, 'accounts.bin')).toString()
    expect(raw).not.toContain('secret-token')
    expect(raw).not.toContain('u1@x.dev')
  })

  it('dropSession giữ tài khoản trong danh sách; forget xóa hẳn', () => {
    store.record(info(1), sess('a'))
    store.remember(uid(1), true, sess('a'))
    store.dropSession(uid(1))
    expect(store.list()).toMatchObject([{ id: uid(1), remembered: false }])
    store.forget(uid(1))
    expect(store.list()).toEqual([])
  })

  it(`chỉ giữ ${MAX_SAVED_ACCOUNTS} tài khoản gần nhất`, () => {
    for (let i = 1; i <= MAX_SAVED_ACCOUNTS + 2; i++) store.record(info(i), sess(String(i)), i)
    const ids = store.list().map((a) => a.id)
    expect(ids).toHaveLength(MAX_SAVED_ACCOUNTS)
    expect(ids).not.toContain(uid(1))
    expect(ids[0]).toBe(uid(MAX_SAVED_ACCOUNTS + 2))
  })

  it('ghi nhớ cần phiên và tài khoản đã có trong danh sách', () => {
    expect(() => store.remember(uid(9), true, sess('x'))).toThrow('account_not_found')
    store.record(info(1), sess('a'))
    expect(() => store.remember(uid(1), true)).toThrow('session_required')
  })

  it('không có mã hóa của hệ điều hành → không lưu gì, không lỗi khi ghi nhận', () => {
    const plain = new SavedAccountStore(dir, { ...fakeCrypto, isEncryptionAvailable: () => false })
    plain.record(info(1), sess('a'))
    expect(plain.list()).toEqual([])
    expect(() => plain.remember(uid(1), true, sess('a'))).toThrow()
  })
})
