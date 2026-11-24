# Backend

Base de la API con Node.js, TypeScript y Express. Incluye la conexión PostgreSQL con Sequelize, el ejecutor de migraciones y los modelos iniciales de usuarios, roles, pacientes y catálogos; todavía no hay datos demo ni endpoints de dominio.

## Arquitectura inicial

```text
backend/
  src/
    app.ts                 Aplicación y montaje de rutas y middlewares
    server.ts              Arranque HTTP
    config.ts              Variables de entorno
    models/                Modelos y asociaciones Sequelize
    routes/                Endpoints HTTP
    schemas/               Futura validación de solicitudes
    services/              Futura lógica de negocio
    middleware/            Middlewares compartidos
    database/
      connection.ts        Configuración de Sequelize para PostgreSQL
      check.ts             Comprobación explícita de conectividad
      migrate.ts           Comando para aplicar migraciones
      migrator.ts          Registro y ejecución de migraciones
      migrations/          Migraciones PostgreSQL
      seeders/             Futuros datos iniciales o de demostración
  tests/
    unit/                  Pruebas unitarias
    integration/           Pruebas HTTP y de integración
    database/              Pruebas con PostgreSQL aislado
```

Las rutas reciben las solicitudes, utilizarán los esquemas para validarlas y delegarán la lógica a los servicios. Los archivos de rutas utilizan el sufijo `.routes.ts`; modelos y servicios, `.ts`; esquemas, `.schema.ts`. Si una ruta necesita un controlador separado, podrá agregarse sin obligar a usarlo en todas. Las carpetas vacías contienen `.gitkeep`, no código funcional.

Las migraciones serán la fuente de verdad del esquema; los modelos deberán reflejarlas, según el [DER](../docs/DER.md). No se incluyen aún funcionalidades específicas para preservar la distribución de tareas del equipo.

## Instalación y ejecución

Requiere Node.js 22.18 o superior dentro de la versión 22, o Node.js 24 o superior, y npm. Desde la raíz del repositorio, copiar `sample.env` a `.env` y, si es necesario, ajustar los valores. Por ejemplo, en PowerShell:

```powershell
Copy-Item sample.env .env
cd backend
npm ci
npm run dev
```

`npm run dev` ejecuta TypeScript con recarga automática. Para ejecutar la versión compilada, usar `npm run build` y luego `npm start`. Consultar `http://localhost:3000/api/v1/health` para verificar que responde. Para detenerlo, usar Ctrl+C.

La configuración se lee del `.env` en la raíz, independientemente del directorio desde donde se inicie el proceso. Las variables del entorno tienen prioridad sobre el archivo. No compartir `.env` ni incluir datos reales.

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`; por defecto `development`. |
| `PORT` | Puerto TCP entre 1 y 65535; por defecto `3000`. |
| `CORS_ORIGIN` | Un único origen permitido, sin ruta ni barra final. En desarrollo por defecto es `http://localhost:5173`; en producción es obligatorio configurarlo explícitamente. |
| `DATABASE_URL` | URL de PostgreSQL para los comandos de base de datos. No es necesaria para arrancar la API actual; se exige al verificar la conexión. |

CORS controla qué respuestas puede leer un navegador desde otro origen; no sustituye autenticación ni autorización.

## Conexión a PostgreSQL

Instalar PostgreSQL 13 o superior con soporte ICU y crear una base local vacía con un usuario autorizado para crear tablas e índices. La migración de catálogos requiere la intercalación `und-x-icu`, disponible en instalaciones PostgreSQL con ICU. En el `.env` de la raíz, completar `DATABASE_URL` con una URL `postgres://` o `postgresql://` que incluya host y nombre de base. Ejemplo de formato, con marcadores que deben reemplazarse localmente:

```text
DATABASE_URL=postgres://USUARIO:CONTRASENA@localhost:5432/portal_salud
```

Codificar los caracteres especiales del usuario o contraseña como componentes de URL. No versionar credenciales reales. Desde `backend/`, ejecutar:

```sh
npm run db:check
```

El comando verifica la conexión con Sequelize y cierra el pool; devuelve un error y código de salida distinto de cero si falla. No crea tablas, migra ni carga datos. La API y `health` todavía no se conectan automáticamente a PostgreSQL; esto conserva el arranque existente y no implementa aún el perfil mock ni la persistencia final.

Para aplicar las migraciones a la base indicada por `DATABASE_URL`:

```sh
npm run db:migrate
```

La primera migración crea `usuarios`, con UUID, timestamps, estado validado y email único sin distinguir mayúsculas. No crea usuarios de demostración. Las migraciones registradas se aplican en orden en una transacción, con bloqueo para evitar ejecuciones simultáneas; su historial queda en `schema_migrations`. Repetir el comando no vuelve a ejecutarlas. Un fallo revierte la aplicación y se informa; si el historial no coincide con esta versión del proyecto, el comando se detiene.

La segunda migración crea `roles` y `usuario_roles` y carga los códigos fijos `paciente`, `profesional` y `administrador`. Un usuario puede tener varios roles, sin asignaciones duplicadas; las referencias restringen el borrado físico de usuarios y roles asignados. Estos códigos son datos del sistema, no usuarios de demostración.

La tercera migración crea `pacientes`: cada perfil pertenece a un usuario distinto y su fecha de nacimiento opcional no puede ser futura según la fecha de la base de datos. No permite borrar físicamente un usuario con perfil de paciente. Crear el perfil no asigna el rol ni habilita acceso; la futura lógica de registro deberá crear usuario, rol y perfil en una transacción.

La cuarta migración crea los catálogos `zonas` y `especialidades`, sin cargarlos todavía. Una zona es única por provincia y nombre y una especialidad por nombre, sin distinguir mayúsculas y minúsculas, incluso con acentos, mediante ICU. Ambas están activas por defecto y pueden desactivarse. Las consultas futuras que busquen estas claves sin distinguir mayúsculas deben usar la misma expresión `lower(campo COLLATE pg_catalog."und-x-icu")`.

Agregar futuras migraciones a `src/database/migrations/` y registrarlas al final de la lista en `src/database/migrator.ts`, con nombres crecientes y únicos. No modificar ni renombrar migraciones ya aplicadas: agregar otra. No usar `sequelize.sync()` para crear el esquema de la aplicación. `defineModels` inicializa los modelos y sus asociaciones para una conexión Sequelize. La API aún no usa estos modelos; las respuestas futuras nunca deben exponer `password_hash`.

Para producción, configurar una conexión cifrada y certificados verificados de acuerdo con el proveedor PostgreSQL antes de desplegar; no desactivar la verificación de certificados. La configuración de despliegue se completará en PGSI-20.

## Comprobaciones

Desde `backend/`:

```sh
npm run lint
npm run build
npm run typecheck
npm test
```

Para las pruebas de PostgreSQL, crear **otra base exclusiva para pruebas** y definir `TEST_DATABASE_URL` en el entorno con su URL. No usar una base de desarrollo o producción: el comando aplica las migraciones a esa base y conserva el esquema y el historial; los registros de prueba se revierten.

```sh
npm run test:db
```

El comando exige `TEST_DATABASE_URL` explícita y no usa `DATABASE_URL` como alternativa. La CI ejecuta estas comprobaciones con Node.js 22.18 y 24 contra un PostgreSQL temporal. `typecheck` también verifica los tipos de las pruebas; `build` genera la aplicación en `dist/`.

## Respuestas iniciales

Estas formas coinciden con la propuesta del [contrato API v1](../docs/contrato-api.md).

- `GET /api/v1/health`: `200` y `{"data":{"status":"ok"}}`. Verifica que el proceso responde, no la conexión a una base de datos.
- Rutas inexistentes y errores: `{"error":{"code":"NOT_FOUND","message":"Recurso no encontrado"}}`, con el estado HTTP correspondiente. Los errores internos no exponen detalles al cliente y se registran en el servidor.

El cuerpo JSON está limitado a 100 KB. La API aún no implementa persistencia ni operaciones de negocio; el prototipo deberá conservar el modo sin escrituras persistentes.
