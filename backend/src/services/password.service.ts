import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const scryptCost = 32768;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const saltLength = 16;
const keyLength = 64;
const maxMemory = 64 * 1024 * 1024;
const passwordHashPattern = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

export class PasswordValidationError extends Error {
  constructor() {
    super('La contraseña debe tener entre 10 y 128 caracteres');
    this.name = 'PasswordValidationError';
  }
}

function isPasswordLengthValid(password: string): boolean {
  const characters = [...password].length;
  return characters >= 10 && characters <= 128 && Buffer.byteLength(password, 'utf8') <= 512;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, {
      N: scryptCost,
      r: scryptBlockSize,
      p: scryptParallelization,
      maxmem: maxMemory,
    }, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!isPasswordLengthValid(password)) {
    throw new PasswordValidationError();
  }
  const salt = randomBytes(saltLength);
  const key = await deriveKey(password, salt);
  return `scrypt$${scryptCost}$${scryptBlockSize}$${scryptParallelization}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (!isPasswordLengthValid(password)) {
    return false;
  }
  const match = passwordHashPattern.exec(encodedHash);
  if (!match ||
      Number(match[1]) !== scryptCost ||
      Number(match[2]) !== scryptBlockSize ||
      Number(match[3]) !== scryptParallelization) {
    return false;
  }

  const salt = Buffer.from(match[4] ?? '', 'base64url');
  const expectedKey = Buffer.from(match[5] ?? '', 'base64url');
  if (salt.length !== saltLength || expectedKey.length !== keyLength ||
      salt.toString('base64url') !== match[4] || expectedKey.toString('base64url') !== match[5]) {
    return false;
  }
  const actualKey = await deriveKey(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}
