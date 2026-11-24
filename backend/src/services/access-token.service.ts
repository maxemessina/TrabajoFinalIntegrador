import { errors, SignJWT, jwtVerify } from 'jose';

export const accessTokenLifetimeSeconds = 3600;
const tokenIssuer = 'portal-salud';
const tokenAudience = 'portal-salud-api';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccessTokenClaims = {
  userId: string;
};

function getSigningKey(secret: string): Uint8Array {
  if (!secret || secret.trim() !== secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 bytes aleatorios, sin espacios al inicio o al final');
  }
  return new TextEncoder().encode(secret);
}

export function createAccessTokenService(secret: string) {
  const key = getSigningKey(secret);

  return {
    async issue(userId: string): Promise<string> {
      if (!uuidPattern.test(userId)) {
        throw new Error('El identificador del usuario debe ser un UUID');
      }
      return new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer(tokenIssuer)
        .setAudience(tokenAudience)
        .setIssuedAt()
        .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
        .sign(key);
    },

    async verify(token: string): Promise<AccessTokenClaims | null> {
      if (!token || token.length > 8192) {
        return null;
      }
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: tokenIssuer,
          audience: tokenAudience,
        });
        if (typeof payload.sub !== 'string' || !uuidPattern.test(payload.sub)) {
          return null;
        }
        return { userId: payload.sub };
      } catch (error: unknown) {
        if (error instanceof errors.JOSEError) {
          return null;
        }
        throw error;
      }
    },
  };
}
