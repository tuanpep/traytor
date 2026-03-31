import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

export type Platform = 'darwin' | 'linux' | 'win32';

export function getPlatform(): Platform {
  const p = os.platform();
  if (p === 'darwin' || p === 'linux' || p === 'win32') {
    return p;
  }
  // Treat other POSIX platforms as linux
  return 'linux';
}

export function isMac(): boolean {
  return getPlatform() === 'darwin';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

export function getShellCommand(): string {
  if (isWindows()) {
    return 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function getShellArgs(): string[] {
  if (isWindows()) {
    return ['-NoLogo', '-Command'];
  }
  return ['-c'];
}

export function normalizePath(p: string): string {
  // Convert all path separators to forward slashes for consistency
  return p.split(path.sep).join('/');
}

export function getHomeDir(): string {
  return os.homedir();
}

export function getConfigDir(): string {
  return path.join(getHomeDir(), '.sdd-tool');
}

export function getDataDir(): string {
  return path.join(getConfigDir(), 'data');
}

export function getEncryptedKeysDir(): string {
  return path.join(getConfigDir(), 'keys');
}

export function isKeychainAvailable(): boolean {
  try {
    if (isMac()) {
      execSync('security --version', { stdio: 'pipe' });
      return true;
    }
    if (isLinux()) {
      // Check for secret-service (via dbus)
      execSync('dbus-send --session --dest=org.freedesktop.DBus --type=method_call --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -q secret-service', { stdio: 'pipe' });
      return true;
    }
    if (isWindows()) {
      // Windows Credential Manager is always available
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function getServiceName(): string {
  return 'com.traytor.sdd';
}
