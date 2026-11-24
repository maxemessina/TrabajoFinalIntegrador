# Backend

Base de la API con Node.js, TypeScript, Express y Sequelize. Incluye persistencia PostgreSQL, endpoints de autenticación y perfil propio, y un seed demo opcional; los CRUD de dominio corresponden a sus tickets.

## Arquitectura inicial

```text
backend/
  src/
    app.ts                 Aplicación y montaje de rutas y middlewares
    server.ts              Arranque HTTP
    config.ts              Variables de entorno
    models/                Modelos y asociaciones Sequelize
    routes/                Endpoints HTTP
    schemas/               Validación estricta de solicitudes
    services/              Lógica de autenticación y servicios compartidos
    middleware/            Middlewares compartidos
    database/
      connection.ts        Configuración de Sequelize para PostgreSQL
      check.ts             Comprobación explícita de conectividad
      migrate.ts           Comando para aplicar migraciones
      migrator.ts          Registro y ejecución de migraciones
      migrations/          Migraciones PostgreSQL
      seeders/             Datos de demostración opcionales
  tests/
    unit/                  Pruebas unitarias
    integration/           Pruebas HTTP y de integración
    database/              Pruebas con PostgreSQL aislado
```

Las rutas validan las solicitudes mediante esquemas y delegan la lógica a los servicios. Los archivos de rutas utilizan el sufijo `.routes.ts`; modelos y servicios, `.ts`; esquemas, `.schema.ts`. Si una ruta necesita un controlador separado, podrá agregarse sin obligar a usarlo en todas. Las carpetas vacías contienen `.gitkeep`, no código funcional.

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

Sin `DATABASE_URL`, el servidor solo ofrece health; las rutas de autenticación responden `503 SERVICE_UNAVAILABLE`. Para habilitar autenticación, completar `DATABASE_URL` y `JWT_SECRET`, ejecutar `npm run db:migrate` desde `backend/` y luego iniciar la API. El servidor comprueba la conexión al arrancar.

La configuración se lee del `.env` en la raíz, independientemente del directorio desde donde se inicie el proceso. Las variables del entorno tienen prioridad sobre el archivo. No compartir `.env` ni incluir datos reales.

| Variable | Descripción |
| --- | --- |
| `NODE_ENV` | `development`, `test` o `production`; por defecto `development`. |
| `PORT` | Puerto TCP entre 1 y 65535; por defecto `3000`. |
| `CORS_ORIGIN` | Un único origen permitido, sin ruta ni barra final. En desarrollo por defecto es `http://localhost:5173`; en producción es obligatorio configurarlo explícitamente. |
| `DATABASE_URL` | URL PostgreSQL para migraciones, seeds y autenticación. Si falta, la API inicia en modo health-only. |
| `JWT_SECRET` | Secreto aleatorio de al menos 32 bytes para firmar JWT. Se exige al arrancar con `DATABASE_URL`; health-only no lo necesita. |

CORS controla qué respuestas puede leer un navegador desde otro origen; no sustituye autenticación ni autorización.

Generar un secreto local para autenticación desde PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Guardar el resultado solo en `.env` como `JWT_SECRET`; no usar el valor vacío de `sample.env`, una contraseña humana ni el mismo secreto en distintos entornos.

## Conexión a PostgreSQL

Instalar PostgreSQL 13 o superior con soporte ICU y la extensión `btree_gist` disponible, y crear una base local vacía con un usuario autorizado para crear tablas, índices y la extensión. La migración de catálogos requiere la intercalación `und-x-icu`, disponible en instalaciones PostgreSQL con ICU. En el `.env` de la raíz, completar `DATABASE_URL` con una URL `postgres://` o `postgresql://` que incluya host y nombre de base. Ejemplo de formato, con marcadores que deben reemplazarse localmente:

```text
DATABASE_URL=postgres://USUARIO:CONTRASENA@localhost:5432/portal_salud
```

Codificar los caracteres especiales del usuario o contraseña como componentes de URL. No versionar credenciales reales. Desde `backend/`, ejecutar:

```sh
npm run db:check
```

El comando verifica la conexión con Sequelize y cierra el pool; devuelve un error y código de salida distinto de cero si falla. No crea tablas, migra ni carga datos. Health continúa disponible sin PostgreSQL; con `DATABASE_URL`, la API verifica la conexión antes de ofrecer autenticación.

Para aplicar las migraciones a la base indicada por `DATABASE_URL`:

```sh
npm run db:migrate
```

La primera migración crea `usuarios`, con UUID, timestamps, estado validado y email único sin distinguir mayúsculas. No crea usuarios de demostración. Las migraciones registradas se aplican en orden en una transacción, con bloqueo para evitar ejecuciones simultáneas; su historial queda en `schema_migrations`. Repetir el comando no vuelve a ejecutarlas. Un fallo revierte la aplicación y se informa; si el historial no coincide con esta versión del proyecto, el comando se detiene.

La segunda migración crea `roles` y `usuario_roles` y carga los códigos fijos `paciente`, `profesional` y `administrador`. Un usuario puede tener varios roles, sin asignaciones duplicadas; las referencias restringen el borrado físico de usuarios y roles asignados. Estos códigos son datos del sistema, no usuarios de demostración.

La tercera migración crea `pacientes`: cada perfil pertenece a un usuario distinto y su fecha de nacimiento opcional no puede ser futura según la fecha de la base de datos. No permite borrar físicamente un usuario con perfil de paciente. Crear el perfil no asigna el rol ni habilita acceso; la futura lógica de registro deberá crear usuario, rol y perfil en una transacción.

La cuarta migración crea los catálogos `zonas` y `especialidades`, sin cargarlos todavía. Una zona es única por provincia y nombre y una especialidad por nombre, sin distinguir mayúsculas y minúsculas, incluso con acentos, mediante ICU. Ambas están activas por defecto y pueden desactivarse. Las consultas futuras que busquen estas claves sin distinguir mayúsculas deben usar la misma expresión `lower(campo COLLATE pg_catalog."und-x-icu")`.

La quinta migración crea perfiles de `profesionales`, sus asociaciones con especialidades y sus trabajos. Cada perfil requiere un usuario y una zona, matrícula única y duración positiva; los perfiles y trabajos son invisibles por defecto. El servicio futuro deberá validar la zona horaria IANA, los permisos, la vigencia del rol y las condiciones para publicar, incluida una especialidad activa. Crear un perfil no asigna el rol ni lo publica.

La sexta migración crea `horarios_atencion` y `bloqueos_agenda`, vinculados a profesionales. Valida día semanal, orden de horas y fechas de vigencia, e intervalos de bloqueo; los horarios están activos por defecto. La prevención de solapamientos, los permisos y la coordinación transaccional con turnos quedan para los servicios de PGSI-8 y PGSI-9; estas tablas por sí solas no calculan disponibilidad. El motivo del bloqueo es privado.

La séptima migración crea `tokens_recuperacion`, vinculada a usuarios, con hash único, vencimiento y fecha opcional de uso. La tabla no genera ni envía tokens y no valida por sí sola el vencimiento o el uso único. La futura recuperación deberá guardar solo hashes, consumir el token y cambiar la contraseña de forma atómica, y nunca exponer ni registrar tokens o hashes.

La octava migración crea `eventos_visita`: admite visitas anónimas y distingue visitas al inicio de visitas a un perfil profesional. Es solo el esquema; no activa la captura real ni implementa métricas. Antes de registrar visitas deben definirse consentimiento, retención y privacidad. No almacena IP, cookies ni información clínica.

La novena migración crea `turnos` y la extensión `btree_gist` si no existe. Una restricción impide solapar turnos reservados del mismo profesional y permite intervalos contiguos `[inicio, fin)`; los demás estados no ocupan la franja. Esto no sustituye los servicios: PGSI-8 y PGSI-9 deberán serializar las operaciones de horarios, bloqueos y turnos por profesional, controlar permisos, disponibilidad, transiciones y versiones. Coordinar con Valentina la integración y revisión de estas reglas.

La décima migración crea `notificaciones`, asociadas a un turno y su versión, con tipos y estados restringidos. La unicidad por turno, versión y tipo evita registros duplicados, pero no garantiza entrega exactamente una vez. No se programan ni envían notificaciones: el futuro servicio deberá coordinar versiones, reclamación atómica, reintentos y errores sanitizados, y definir las políticas de envío pendientes.

La undécima migración crea `fichas_clinicas`, con una ficha por paciente y profesional y referencias que restringen el borrado de ambos perfiles.

La duodécima migración crea `notas_clinicas`. Sus columnas técnicas `paciente_id` y `profesional_id` permiten que claves foráneas compuestas garanticen que la ficha y el turno opcional pertenecen a la misma pareja, y restringen borrar o cambiar sus titulares mientras estén referenciados. El servicio deberá obtener esos IDs de la ficha, no del cliente. Esto no implementa acceso clínico: PGSI-10 deberá validar la relación de atención, autorizar exclusivamente al profesional dueño, exigir contenido no vacío y comprobar que el turno asociado esté atendido. Coordinar con Valentina la integración; no habilitar edición ni eliminación clínica sin auditoría y política de retención.

Agregar futuras migraciones a `src/database/migrations/` y registrarlas al final de la lista en `src/database/migrator.ts`, con nombres crecientes y únicos. No modificar ni renombrar migraciones ya aplicadas: agregar otra. No usar `sequelize.sync()` para crear el esquema de la aplicación. `defineModels` inicializa los modelos y sus asociaciones para una conexión Sequelize. La API aún no usa estos modelos; las respuestas futuras nunca deben exponer `password_hash`.

## Autenticación

PGSI-5 implementa `POST /api/v1/auth/registro`, `POST /api/v1/auth/login`, `POST /api/v1/auth/recuperacion`, `POST /api/v1/auth/restablecimiento`, `GET /api/v1/me` y `PATCH /api/v1/me`, según el contrato. El registro público crea solo el rol paciente y el perfil correspondiente dentro de una transacción; no puede autoasignarse roles profesionales o administrador. Los cuerpos rechazan campos desconocidos.

Las contraseñas se guardan mediante `scrypt` con sal aleatoria; nunca se devuelven. Los JWT HS256 duran una hora, requieren `JWT_SECRET` y contienen solo el ID del usuario; cada solicitud autenticada vuelve a comprobar usuario activo y roles vigentes en PostgreSQL. Usar `Authorization: Bearer <access_token>`. Los endpoints futuros deben aplicar `requireAuth` y `requireRoles(...)`; el perfil de paciente o profesional por sí solo no concede permisos.

La recuperación guarda únicamente SHA-256 del token aleatorio, invalida tokens previos y consume el token y actualiza la contraseña en una transacción; vence en 30 minutos. En desarrollo se usa un correo mock que no entrega correo ni imprime email o token. En pruebas, el adaptador se inyecta para verificar el flujo. En producción no conectar un proveedor real hasta configurar PGSI-12. La recuperación no distingue cuentas existentes en su respuesta. El cierre de sesión de v1 es del lado del cliente: descartar el access token; no revoca uno ya emitido.

Si `DATABASE_URL` no está configurada, las rutas de auth devuelven `503` explícito, sin simular registro o login. Con DB configurada se requiere migrar el esquema y establecer `JWT_SECRET` antes de iniciar la API.

Para producción, configurar una conexión cifrada y certificados verificados de acuerdo con el proveedor PostgreSQL antes de desplegar; no desactivar la verificación de certificados. La configuración de despliegue se completará en PGSI-20.

## Datos de demostración

Solo en una base local o de pruebas sin datos reales, con `NODE_ENV=development` o `NODE_ENV=test`, ejecutar primero `npm run db:migrate` y luego:

```sh
npm run db:seed:demo
```

La carga es transaccional y registra `demo_v1` en `schema_seeds`. Repetirla, incluso simultáneamente, no duplica ni modifica datos; si después se modifican o borran registros demo, repetirla no los restaura. Un conflicto con datos existentes revierte toda la carga y se informa. Verificar siempre `DATABASE_URL`: `NODE_ENV` por sí solo no garantiza que la base sea local. No usar este comando en producción.

Incluye usuarios y roles, catálogos, perfiles, un trabajo, un horario, un bloqueo, un turno atendido, una ficha y una nota con texto ficticio. Las cuentas están inactivas y tienen un marcador que no es una contraseña ni un hash válido: **no permiten iniciar sesión**. El profesional y su trabajo no están publicados. No crea tokens, visitas ni notificaciones pendientes, y no envía mensajes. El seed no cambia el comportamiento de la API ni habilita escrituras persistentes en el prototipo.

## Comprobaciones

Desde `backend/`:

```sh
npm run lint
npm run build
npm run typecheck
npm test
```

Para las pruebas de PostgreSQL, crear **otra base exclusiva para pruebas** y definir `TEST_DATABASE_URL` en el entorno con su URL. No usar una base de desarrollo o producción: el comando aplica las migraciones a esa base y conserva el esquema y el historial; los registros de prueba se revierten. El usuario de la base debe poder crear esquemas: las pruebas del seed usan un esquema temporal propio y lo eliminan al terminar.

```sh
npm run test:db
```

El comando exige `TEST_DATABASE_URL` explícita y no usa `DATABASE_URL` como alternativa. La CI ejecuta estas comprobaciones con Node.js 22.18 y 24 contra un PostgreSQL temporal. `typecheck` también verifica los tipos de las pruebas; `build` genera la aplicación en `dist/`.

## Respuestas iniciales

Estas formas coinciden con la propuesta del [contrato API v1](../docs/contrato-api.md).

- `GET /api/v1/health`: `200` y `{"data":{"status":"ok"}}`. Verifica que el proceso responde, no la conexión a una base de datos.
- Rutas inexistentes y errores: `{"error":{"code":"NOT_FOUND","message":"Recurso no encontrado"}}`, con el estado HTTP correspondiente. Los errores internos no exponen detalles al cliente y se registran en el servidor.

El cuerpo JSON está limitado a 100 KB. La API aún no implementa persistencia ni operaciones de negocio; el prototipo deberá conservar el modo sin escrituras persistentes.
