import { fn, literal, Op } from 'sequelize';
import type { FindAttributeOptions, Order, WhereOptions } from 'sequelize';
import { HttpError } from '../http-error.ts';
import type { AuthIdentity } from '../middleware/auth.ts';
import type { PacienteListQuery } from '../schemas/paciente.schema.ts';
import type { ApplicationModels } from './auth.service.ts';

export type PacienteResource = {
  id: string;
  usuario_id: string;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string | null;
  activo: boolean;
  creado_en: Date;
  actualizado_en: Date;
};

function toResource(
  patient: InstanceType<ApplicationModels['Paciente']>,
  user = patient.usuario,
  roleActive: unknown = patient.get('rol_paciente_vigente'),
): PacienteResource {
  if (!user) {
    throw new Error('La consulta de pacientes no incluyó el usuario asociado');
  }
  if (typeof roleActive !== 'boolean') {
    throw new Error('La consulta de pacientes no incluyó el estado del rol paciente');
  }
  return {
    id: patient.id,
    usuario_id: patient.usuario_id,
    nombre: user.nombre,
    apellido: user.apellido,
    fecha_nacimiento: patient.fecha_nacimiento,
    activo: user.estado === 'activo' && roleActive,
    creado_en: patient.creado_en,
    actualizado_en: patient.actualizado_en,
  };
}

export function createPacienteService(models: ApplicationModels) {
  const { Paciente, Usuario, Rol, UsuarioRol, Turno } = models;
  const database = Paciente.sequelize;
  if (!database) {
    throw new Error('El modelo de pacientes no tiene una conexión Sequelize');
  }
  const escapeValue = database.escape.bind(database);
  const patientRoleExists = `EXISTS (
    SELECT 1 FROM usuario_roles AS paciente_rol
    INNER JOIN roles AS rol ON rol.id = paciente_rol.rol_id
    WHERE paciente_rol.usuario_id = "Paciente"."usuario_id" AND rol.codigo = 'paciente'
  )`;
  const activeExpression = `("usuario"."estado" = 'activo' AND ${patientRoleExists})`;
  const patientAttributes: FindAttributeOptions = { include: [[literal(patientRoleExists), 'rol_paciente_vigente']] };

  function accessWhere(identity: AuthIdentity): WhereOptions {
    if (identity.roles.includes('administrador')) {
      return {};
    }

    const scopes: WhereOptions[] = [];
    if (identity.roles.includes('paciente')) {
      scopes.push({ usuario_id: identity.userId });
    }
    if (identity.roles.includes('profesional')) {
      scopes.push(literal(`EXISTS (
        SELECT 1
        FROM turnos AS paciente_turno
        INNER JOIN profesionales AS paciente_profesional
          ON paciente_profesional.id = paciente_turno.profesional_id
        WHERE paciente_turno.paciente_id = "Paciente"."id"
          AND paciente_profesional.usuario_id = ${escapeValue(identity.userId)}
          AND paciente_turno.estado IN ('reservado', 'atendido', 'ausente')
      )`));
    }
    return scopes.length > 0 ? { [Op.or]: scopes } : { id: { [Op.in]: [] } };
  }

  function userWhere(query: PacienteListQuery): WhereOptions | undefined {
    const filters: WhereOptions[] = [];
    if (query.q) {
      const escaped = query.q.replace(/[\\%_]/g, '\\$&');
      filters.push({
        [Op.or]: [
          { nombre: { [Op.iLike]: `%${escaped}%` } },
          { apellido: { [Op.iLike]: `%${escaped}%` } },
        ],
      });
    }
    return filters.length > 0 ? { [Op.and]: filters } : undefined;
  }

  function orderBy(query: PacienteListQuery): Order {
    const direction = query.order.toUpperCase() as 'ASC' | 'DESC';
    const order: Order = [];
    if (query.sortBy === 'nombre' || query.sortBy === 'apellido') {
      order.push([{ model: Usuario, as: 'usuario' }, query.sortBy, direction]);
    } else {
      if (query.sortBy === 'fecha_nacimiento') {
        order.push([literal('CASE WHEN "Paciente"."fecha_nacimiento" IS NULL THEN 1 ELSE 0 END'), 'ASC']);
      }
      order.push([query.sortBy, direction]);
    }
    order.push(['id', direction]);
    return order;
  }

  const includeUsuario = (where?: WhereOptions) => ({
    model: Usuario,
    as: 'usuario',
    attributes: ['nombre', 'apellido', 'estado'],
    required: true,
    ...(where ? { where } : {}),
  });

  return {
    async list(query: PacienteListQuery, identity: AuthIdentity) {
      const result = await Paciente.findAndCountAll({
        where: {
          [Op.and]: [
            accessWhere(identity),
            ...(query.activo === undefined ? [] : [literal(query.activo ? activeExpression : `NOT ${activeExpression}`)]),
          ],
        },
        include: [includeUsuario(userWhere(query))],
        attributes: patientAttributes,
        distinct: true,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: orderBy(query),
      });
      return {
        data: result.rows.map((patient) => toResource(patient)),
        meta: {
          page: query.page,
          limit: query.limit,
          total: result.count,
          totalPages: result.count === 0 ? 0 : Math.ceil(result.count / query.limit),
        },
      };
    },

    async get(id: string, identity: AuthIdentity): Promise<PacienteResource | null> {
      const patient = await Paciente.findOne({
        where: { [Op.and]: [{ id }, accessWhere(identity)] },
        include: [includeUsuario()],
        attributes: patientAttributes,
      });
      return patient ? toResource(patient) : null;
    },

    async update(id: string, input: { fecha_nacimiento: string | null }, identity: AuthIdentity) {
      return database.transaction(async (transaction) => {
        const [count] = await Paciente.update(input, {
          where: {
            id,
            ...(identity.roles.includes('administrador') ? {} : { usuario_id: identity.userId }),
          },
          transaction,
        });
        if (count === 0) {
          return null;
        }
        const patient = await Paciente.findByPk(id, {
          include: [includeUsuario()],
          attributes: patientAttributes,
          transaction,
        });
        if (!patient) {
          throw new Error('No se pudo consultar el perfil de paciente actualizado');
        }
        return toResource(patient);
      });
    },

    async create(input: { usuario_id: string; fecha_nacimiento?: string | null }) {
      return database.transaction(async (transaction) => {
        const user = await Usuario.findByPk(input.usuario_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!user) {
          throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
        }
        if (user.estado !== 'activo') {
          throw new HttpError(409, 'CONFLICT', 'El usuario debe estar activo');
        }
        const role = await Rol.findOne({ where: { codigo: 'paciente' }, transaction });
        if (!role) {
          throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'El alta de pacientes no está disponible temporalmente');
        }
        const assignment = await UsuarioRol.findOne({
          where: { usuario_id: user.id, rol_id: role.id },
          transaction,
        });
        if (assignment) {
          throw new HttpError(409, 'CONFLICT', 'El usuario ya tiene el rol paciente');
        }
        let patient = await Paciente.findOne({ where: { usuario_id: user.id }, transaction });
        const created = !patient;
        if (!patient) {
          patient = await Paciente.create({
            usuario_id: user.id,
            fecha_nacimiento: input.fecha_nacimiento ?? null,
          }, { transaction });
        } else if (input.fecha_nacimiento !== undefined) {
          await patient.update({ fecha_nacimiento: input.fecha_nacimiento }, { transaction });
        }
        await UsuarioRol.create({ usuario_id: user.id, rol_id: role.id }, { transaction });
        return { patient: toResource(patient, user, true), created };
      });
    },

    async remove(id: string): Promise<boolean> {
      return database.transaction(async (transaction) => {
        const existing = await Paciente.findByPk(id, { transaction, attributes: ['id', 'usuario_id'] });
        if (!existing) {
          return false;
        }
        const user = await Usuario.findByPk(existing.usuario_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!user) {
          throw new Error('El perfil de paciente no tiene usuario asociado');
        }
        const patient = await Paciente.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!patient || patient.usuario_id !== user.id) {
          throw new Error('El perfil de paciente cambió durante la baja');
        }
        const role = await Rol.findOne({ where: { codigo: 'paciente' }, transaction });
        if (!role) {
          throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'La baja de pacientes no está disponible temporalmente');
        }
        const assignment = await UsuarioRol.findOne({
          where: { usuario_id: user.id, rol_id: role.id },
          transaction,
        });
        if (!assignment) {
          return true;
        }
        const pending = await Turno.findOne({
          where: { paciente_id: id, estado: 'reservado', fin: { [Op.gt]: fn('NOW') } },
          transaction,
          attributes: ['id'],
        });
        if (pending) {
          throw new HttpError(409, 'CONFLICT', 'El paciente tiene turnos reservados pendientes');
        }
        await assignment.destroy({ transaction });
        const remainingRoles = await UsuarioRol.count({ where: { usuario_id: user.id }, transaction });
        if (remainingRoles === 0 && user.estado !== 'inactivo') {
          await user.update({ estado: 'inactivo' }, { transaction });
        }
        return true;
      });
    },
  };
}
