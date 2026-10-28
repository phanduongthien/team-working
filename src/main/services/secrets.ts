import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Phần của Electron `safeStorage` mà ta cần — tách ra để test được. */
export type Encryptor = {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

/**
 * Lưu API key đã mã hóa bằng Windows DPAPI (Electron safeStorage) trong thư mục dữ liệu app.
 * Không bao giờ lưu dạng rõ, không gửi key về renderer.
 */
export class SecretStore {
  private readonly file: string

  constructor(
    dir: string,
    private readonly crypto: Encryptor
  ) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'anthropic-api-key.bin')
  }

  get available(): boolean {
    return this.crypto.isEncryptionAvailable()
  }

  has(): boolean {
    return existsSync(this.file)
  }

  set(key: string): void {
    if (!this.available) throw new Error('secure_storage_unavailable')
    writeFileSync(this.file, this.crypto.encryptString(key))
  }

  get(): string | null {
    if (!this.has() || !this.available) return null
    try {
      return this.crypto.decryptString(readFileSync(this.file))
    } catch {
      return null
    }
  }

  clear(): void {
    rmSync(this.file, { force: true })
  }
}
