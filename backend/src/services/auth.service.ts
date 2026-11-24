import { createHash, randomBytes } from 'node:crypto';
import { UniqueConstraintError } from 'sequelize';
import type { Sequelize, Transaction } from 'sequelize';
import { HttpError } from '../http-error.ts';
import { defineModels } from '../models/index.ts';
import type { CodigoRol } from '../models/Rol.ts';
import { accessTokenLifetimeSeconds, createAccessTokenService } from './access-token.service.ts';
import type { EmailService } from './email.service.ts';
import { hashPassword, PasswordValidationError, verifyPassword } from './password.service.ts';

const resetTokenLifetimeMilliseconds = 30 * 60 * 1000;
const dummyPasswordHash = hashPassword(randomBytes(32).toString('base64url'));

export type PublicUser = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  estado: 'activo' | 'inactivo';
  roles: CodigoRol[];
  creado_en: Date;
  actualizado_en: Date;
};

export type RegisterInput = {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  telefono?: string | null;
  fecha_nacimiento?: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createAuthService(database: Sequelize, jwtSecret: string, emailService: EmailService) {
  const {
    Usuario, Rol, UsuarioRol, Paciente, TokenRecuperacion,
  } = defineModels(database);
  const accessTokens = createAccessTokenService(jwtSecret);

  async function getRoleCodes(userId: string, transaction?: Transaction): Promise<CodigoRol[]> {
    const roles = await Rol.findAll({
      include: [{
        model: Usuario,
        as: 'usuarios',
        where: { id: userId },
        through: { attributes: [] },
      }],
      order: [['codigo', 'ASC']],
      ...(transaction ? { transaction } : {}),
    });
    return roles.map((role) => role.codigo);
  }

  function toPublicUser(user: InstanceType<typeof Usuario>, roles: CodigoRol[]): PublicUser {
    return {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono,
      estado: user.estado,
      roles,
      creado_en: user.creado_en,
      actualizado_en: user.actualizado_en,
    };
  }

  return {
    async register(input: RegisterInput) {
      let passwordHash: string;
      try {
        passwordHash = await hashPassword(input.password);
      } catch (error: unknown) {
        if (error instanceof PasswordValidationError) {
          throw new HttpError(400, 'VALIDATION_ERROR', error.message, [
            { field: 'password', message: error.message },
          ]);
        }
        throw error;
      }

      try {
        return await database.transaction(async (transaction) => {
          const role = await Rol.findOne({ where: { codigo: 'paciente' }, transaction });
          if (!role) {
            throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'El registro no está disponible temporalmente');
          }
          const user = await Usuario.create({
            nombre: input.nombre,
            apellido: input.apellido,
            email: normalizeEmail(input.email),
            password_hash: passwordHash,
            telefono: input.telefono ?? null,
          }, { transaction });
          await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id }, { transaction });
          const patient = await Paciente.create({
            usuario_id: user.id,
            fecha_nacimiento: input.fecha_nacimiento ?? null,
          }, { transaction });
          return {
            user: toPublicUser(user, [role.codigo]),
            patient: {
              id: patient.id,
              usuario_id: patient.usuario_id,
              nombre: user.nombre,
              apellido: user.apellido,
              fecha_nacimiento: patient.fecha_nacimiento,
              activo: user.estado === 'activo',
              creado_en: patient.creado_en,
              actualizado_en: patient.actualizado_en,
            },
          };
        });
      } catch (error: unknown) {
        if (error instanceof UniqueConstraintError) {
          throw new HttpError(409, 'CONFLICT', 'Ya existe una cuenta con ese email');
        }
        throw error;
      }
    },

    async login(email: string, password: string) {
      const user = await Usuario.findOne({
        where: { email: normalizeEmail(email) },
      });
      if (!user) {
        await verifyPassword(password, await dummyPasswordHash);
        throw new HttpError(401, 'UNAUTHENTICATED', 'Credenciales inválidas');
      }
      const passwordMatches = await verifyPassword(password, user.password_hash);
      if (!passwordMatches || user.estado !== 'activo') {
        throw new HttpError(401, 'UNAUTHENTICATED', 'Credenciales inválidas');
      }
      const roles = await getRoleCodes(user.id);
      return {
        accessToken: await accessTokens.issue(user.id),
        tokenType: 'Bearer' as const,
        expiresIn: accessTokenLifetimeSeconds,
        user: toPublicUser(user, roles),
      };
    },

    async resolveIdentity(userId: string) {
      const user = await Usuario.findOne({ where: { id: userId, estado: 'activo' } });
      if (!user) {
        return null;
      }
      const roles = await getRoleCodes(user.id);
      return { user: toPublicUser(user, roles), roles };
    },

    async updateProfile(userId: string, changes: { nombre?: string; apellido?: string; telefono?: string | null }) {
      const user = await Usuario.findOne({ where: { id: userId, estado: 'activo' } });
      if (!user) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'La sesión ya no es válida');
      }
      await user.update(changes);
      return toPublicUser(user, await getRoleCodes(userId));
    },

    verifyAccessToken(token: string) {
      return accessTokens.verify(token);
    },

    async requestPasswordReset(email: string): Promise<void> {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + resetTokenLifetimeMilliseconds);
      const recipient = await database.transaction(async (transaction) => {
        const user = await Usuario.findOne({
          where: { email: normalizeEmail(email), estado: 'activo' },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!user) {
          return null;
        }
        await TokenRecuperacion.update({ usado_en: new Date() }, {
          where: { usuario_id: user.id, usado_en: null },
          transaction,
        });
        await TokenRecuperacion.create({
          usuario_id: user.id,
          token_hash: hashResetToken(token),
          expira_en: expiresAt,
          usado_en: null,
        }, { transaction });
        return user.email;
      });
      if (!recipient) {
        return;
      }
      await emailService.sendPasswordReset({ recipient, token, expiresAt });
    },

    async resetPassword(token: string, password: string): Promise<void> {
      let passwordHash: string;
      try {
        passwordHash = await hashPassword(password);
      } catch (error: unknown) {
        if (error instanceof PasswordValidationError) {
          throw new HttpError(400, 'VALIDATION_ERROR', error.message, [
            { field: 'password', message: error.message },
          ]);
        }
        throw error;
      }
      const tokenHash = hashResetToken(token);
      await database.transaction(async (transaction) => {
        const recovery = await TokenRecuperacion.findOne({
          where: { token_hash: tokenHash, usado_en: null },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!recovery || recovery.expira_en.getTime() <= Date.now()) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'El token no es válido o expiró', [
            { field: 'token', message: 'El token no es válido o expiró' },
          ]);
        }
        const user = await Usuario.findOne({
          where: { id: recovery.usuario_id, estado: 'activo' },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!user) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'El token no es válido o expiró', [
            { field: 'token', message: 'El token no es válido o expiró' },
          ]);
        }
        user.password_hash = passwordHash;
        await user.save({ transaction });
        await TokenRecuperacion.update({ usado_en: new Date() }, {
          where: { usuario_id: user.id, usado_en: null },
          transaction,
        });
      });
    },
  };
}
