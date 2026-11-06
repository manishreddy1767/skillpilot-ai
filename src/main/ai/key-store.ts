import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Encryptor {
  isAvailable(): Promise<boolean>
  encrypt(text: string): Promise<Buffer>
  decrypt(data: Buffer): Promise<string>
}

/** Keeps the API key encrypted on disk. Only the main process ever sees it. */
export class KeyStore {
  constructor(
    private readonly path: string,
    private readonly encryptor: Encryptor
  ) {}

  hasKey(): boolean {
    return existsSync(this.path)
  }

  async save(key: string): Promise<void> {
    if (!(await this.encryptor.isAvailable())) {
      throw new Error('Windows could not provide encryption, so the key was not saved.')
    }
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, await this.encryptor.encrypt(key))
  }

  /** Null when there is no key, or it cannot be decrypted, such as after a Windows reinstall. */
  async read(): Promise<string | null> {
    if (!this.hasKey()) return null
    try {
      return await this.encryptor.decrypt(readFileSync(this.path))
    } catch {
      return null
    }
  }

  remove(): void {
    rmSync(this.path, { force: true })
  }
}
