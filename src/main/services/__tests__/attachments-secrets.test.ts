import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttachmentStore, MAX_ATTACHMENT_BYTES, mimeFromName } from '../attachments'
import { SecretStore, type Encryptor } from '../secrets'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tw-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('mimeFromName', () => {
  it('nhận ảnh, PDF, file chữ; từ chối loại khác', () => {
    expect(mimeFromName('A.PNG')).toBe('image/png')
    expect(mimeFromName('bai.pdf')).toBe('application/pdf')
    expect(mimeFromName('main.tsx')).toBe('text/plain')
    expect(mimeFromName('virus.exe')).toBeNull()
    expect(mimeFromName('no-ext')).toBeNull()
  })
})

describe('AttachmentStore', () => {
  it('copy file hợp lệ vào workspace với tên UUID, từ chối file lạ/quá lớn', async () => {
    const ok = join(dir, 'ghi chú & (x).md')
    writeFileSync(ok, '# hi')
    const exe = join(dir, 'a.exe')
    writeFileSync(exe, 'x')
    const big = join(dir, 'big.txt')
    writeFileSync(big, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))

    const store = new AttachmentStore(join(dir, 'ws'))
    const res = await store.add([ok, exe, big, join(dir, 'missing.txt')])
    expect(res.attachments).toHaveLength(1)
    expect(res.attachments[0]).toMatchObject({ name: 'ghi chú & (x).md', mimeType: 'text/plain', size: 4 })
    expect(res.rejected.map((r) => r.reason)).toEqual(['unsupported_type', 'too_large', 'not_found'])

    const [stored] = store.take([res.attachments[0].id])
    expect(stored.path).toMatch(/[0-9a-f-]{36}\.md$/)
    expect(readFileSync(stored.path, 'utf8')).toBe('# hi')
    // Chỉ lấy được một lần; ID lạ bị từ chối.
    expect(() => store.take([res.attachments[0].id])).toThrow('attachment_not_found')
  })
})

describe('SecretStore', () => {
  const fakeCrypto: Encryptor = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
    decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString()
  }

  it('lưu dạng mã hóa, đọc lại được, xóa được', () => {
    const store = new SecretStore(dir, fakeCrypto)
    expect(store.has()).toBe(false)
    store.set('sk-ant-secret-value-123456789')
    const raw = readFileSync(join(dir, 'anthropic-api-key.bin'))
    expect(raw.toString()).not.toContain('sk-ant')
    expect(store.get()).toBe('sk-ant-secret-value-123456789')
    store.clear()
    expect(store.has()).toBe(false)
    expect(existsSync(join(dir, 'anthropic-api-key.bin'))).toBe(false)
  })

  it('từ chối lưu khi hệ điều hành không hỗ trợ mã hóa', () => {
    const store = new SecretStore(dir, { ...fakeCrypto, isEncryptionAvailable: () => false })
    expect(() => store.set('sk-ant-x')).toThrow('secure_storage_unavailable')
  })
})
