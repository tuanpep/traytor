import os from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { getLogger } from './logger.js';
import { isMac, isLinux, isWindows, getServiceName, getEncryptedKeysDir } from './platform.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getMachineId(): string {
  return createHash('sha256')
    .update(os.hostname() + os.userInfo().username)
    .digest('hex')
    .slice(0, KEY_LENGTH);
}

function deriveKey(password: string): Buffer {
  return createHash('sha256').update(password).digest();
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
    // Restrict permissions to owner only
    if (!isWindows()) {
      await chmod(dir, 0o700);
    }
  }
}

export class SecureStorage {
  private serviceName: string;
  private keysDir: string;

  constructor() {
    this.serviceName = getServiceName();
    this.keysDir = getEncryptedKeysDir();
  }

  async storeApiKey(provider: string, apiKey: string): Promise<void> {
    const logger = getLogger();

    if (isMac()) {
      try {
        execSync(
          `security add-generic-password -s "${this.serviceName}" -a "${provider}" -w "${apiKey}"`,
          { stdio: 'pipe' }
        );
        logger.debug(`API key for ${provider} stored in macOS Keychain`);
        return;
      } catch (error) {
        logger.warn(`macOS Keychain unavailable, falling back to encrypted file: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (isLinux()) {
      try {
        // Try using secret-tool if available
        execSync(
          `echo "${apiKey}" | secret-tool store --label="SDD ${provider} API Key" "${this.serviceName}" "${provider}"`,
          { stdio: 'pipe' }
        );
        logger.debug(`API key for ${provider} stored in system keyring`);
        return;
      } catch {
        logger.warn('secret-tool unavailable, falling back to encrypted file');
      }
    } else if (isWindows()) {
      try {
        // Use PowerShell to store in Windows Credential Manager
        const cmd = `powershell.exe -NoLogo -Command "cmdkey /generic:${this.serviceName}/${provider} /user:${provider} /pass:${apiKey}"`;
        execSync(cmd, { stdio: 'pipe' });
        logger.debug(`API key for ${provider} stored in Windows Credential Manager`);
        return;
      } catch (error) {
        logger.warn(`Windows Credential Manager unavailable, falling back to encrypted file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Fallback: encrypted file
    await this.storeApiKeyEncrypted(provider, apiKey);
  }

  async getApiKey(provider: string): Promise<string | null> {
    const logger = getLogger();

    if (isMac()) {
      try {
        const result = execSync(
          `security find-generic-password -s "${this.serviceName}" -a "${provider}" -w`,
          { stdio: 'pipe', encoding: 'utf-8' }
        ).trim();
        if (result) {
          logger.debug(`API key for ${provider} retrieved from macOS Keychain`);
          return result;
        }
      } catch {
        logger.debug(`No keychain entry for ${provider}, trying encrypted file`);
      }
    } else if (isLinux()) {
      try {
        const result = execSync(
          `secret-tool lookup "${this.serviceName}" "${provider}"`,
          { stdio: 'pipe', encoding: 'utf-8' }
        ).trim();
        if (result) {
          logger.debug(`API key for ${provider} retrieved from system keyring`);
          return result;
        }
      } catch {
        logger.debug(`No keyring entry for ${provider}, trying encrypted file`);
      }
    } else if (isWindows()) {
      try {
        // Windows Credential Manager read is complex via cmdkey alone;
        // fall back to encrypted file on Windows for reading
        logger.debug('Windows Credential Manager read not supported, trying encrypted file');
      } catch {
        logger.debug(`No credential manager entry for ${provider}, trying encrypted file`);
      }
    }

    // Fallback: encrypted file
    return this.getApiKeyEncrypted(provider);
  }

  async deleteApiKey(provider: string): Promise<void> {
    const logger = getLogger();

    if (isMac()) {
      try {
        execSync(
          `security delete-generic-password -s "${this.serviceName}" -a "${provider}"`,
          { stdio: 'pipe' }
        );
        logger.debug(`API key for ${provider} deleted from macOS Keychain`);
      } catch {
        // May not exist in keychain, try file
      }
    }

    // Always also try to remove the encrypted file
    try {
      const filePath = join(this.keysDir, `${provider}.enc`);
      await unlink(filePath);
      logger.debug(`API key for ${provider} deleted from encrypted file`);
    } catch {
      // File may not exist
    }
  }

  private async storeApiKeyEncrypted(provider: string, apiKey: string): Promise<void> {
    const logger = getLogger();
    await ensureDir(this.keysDir);

    const machineKey = deriveKey(getMachineId());
    const encrypted = encrypt(apiKey, machineKey);
    const filePath = join(this.keysDir, `${provider}.enc`);

    await writeFile(filePath, encrypted, 'utf-8');

    // Restrict file permissions to owner only
    if (!isWindows()) {
      await chmod(filePath, 0o600);
    }

    logger.debug(`API key for ${provider} stored in encrypted file`);
  }

  private async getApiKeyEncrypted(provider: string): Promise<string | null> {
    const filePath = join(this.keysDir, `${provider}.enc`);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const encrypted = await readFile(filePath, 'utf-8');
      const machineKey = deriveKey(getMachineId());
      return decrypt(encrypted, machineKey);
    } catch (error) {
      const logger = getLogger();
      logger.warn(`Failed to decrypt API key for ${provider}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
