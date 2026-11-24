# Contrato API v1

## 1. Alcance y estado

Propuesta para PGSI-2, a revisar por Máximo, Priscila y Valentina en el PR a `dev`. Es el acuerdo para implementar frontend, mocks y API; **no indica que los endpoints ya existan**. El [DER](DER.md) es la referencia de persistencia y sus restricciones. Si una revisión cambia una decisión compartida, actualizar ambos documentos y los consumidores afectados.

La única ruta implementada al crear este documento es `GET /api/v1/health`. Autenticación, modelos, operaciones de negocio y persistencia corresponden a sus tickets. En el perfil de evaluación PGSI-29 los datos son ficticios y las escrituras se simulan en memoria, sin escribir en PostgreSQL; el perfil final usa persistencia real. Ambos perfiles respetan los mismos métodos, permisos, estados y formas de respuesta.

### Responsabilidades

| Responsable | Alcance previsto |
|---|---|
| Máximo | Identidad, pacientes, infraestructura compartida, persistencia y notificaciones. |
| Priscila | Profesionales, zonas, especialidades, administración y métricas. |
| Valentina | Horarios, disponibilidad, bloqueos, turnos, fichas, notas y consolidación de Postman. |

## 2. Convenciones HTTP y datos

- Base: `/api/v1`. JSON en UTF-8; solicitudes con cuerpo usan `Content-Type: application/json`. `Accept: application/json`.
- Respuesta exitosa individual: `{"data": ...}`. Una lista usa `{"data": [...], "meta": {"page": 1, "limit": 10, "total": 0, "totalPages": 0}}`. `data` siempre es un arreglo en listados, también cuando no hay resultados.
- Una creación devuelve `201` con el recurso en `data` y `Location` con su ruta de detalle; una consulta o modificación, `200` con `data`. Una baja sin representación devuelve `204` sin cuerpo. Las excepciones se detallan por operación.
- Los campos JSON usan los nombres en español y `snake_case` del DER. Las excepciones de consulta/metadatos son `page`, `limit`, `sortBy`, `order` y `totalPages`, para ajustarse a los tickets y al prototipo.
- Los IDs públicos son cadenas UUID. `roles.id` es `smallint` interno; los roles se intercambian por código. Las dos tablas de unión usan claves compuestas y no tienen ID artificial.
- Un campo nullable se devuelve siempre, con `null` si no tiene valor. Las fechas `date` son `YYYY-MM-DD`; horas recurrentes, `HH:mm:ss` locales; instantes, ISO 8601 con offset obligatorio. Las respuestas normalizan instantes a UTC con `Z`. La zona horaria es un identificador IANA válido, no un offset fijo.
- El servidor genera IDs, timestamps, versiones y estados iniciales. Ignorar silenciosamente campos desconocidos no está permitido: devolver `400` ante campos desconocidos, campos no editables o tipos incorrectos. En `PATCH` se envían solo los campos a cambiar; omitir conserva el valor y `null` solo borra un campo nullable.
- En las tablas siguientes, `?` indica nullable, no un campo ausente de la respuesta. `creado_en` y `actualizado_en` son instantes; los campos que no sean modificables en las operaciones no se aceptan en sus cuerpos.
- Las bajas conservan el historial según el DER. No se exponen hashes, tokens guardados, datos internos del correo ni notas clínicas fuera de sus recursos autorizados.

### Listas y filtros

Todas las rutas identificadas como listas aceptan `page` entero desde 1 (por defecto 1), `limit` entero de 1 a 100 (por defecto 10), `sortBy` y `order` (`asc` o `desc`, por defecto `asc`). Valores inválidos o parámetros desconocidos: `400`. El orden predeterminado y los campos permitidos se especifican por recurso; los empates se resuelven por `id` en el mismo sentido, para paginación estable. Los valores `null` se ubican al final en ambos sentidos. La disponibilidad, que no tiene ID, es la excepción descrita en la sección 8.

`total` cuenta los registros visibles para la identidad y coincidentes con **todos** los filtros, antes de paginar. `totalPages = ceil(total / limit)`; con cero resultados es 0. Una página fuera de rango devuelve `200`, `data: []` y los metadatos reales. Los filtros de texto `q` buscan coincidencias parciales sin distinguir mayúsculas/minúsculas; se recortan espacios y un `q` vacío se rechaza con `400`.

Los filtros `desde` y `hasta` sobre instantes forman un intervalo `[desde, hasta)`: inicio incluido y fin excluido. Si se envían ambos, `desde < hasta`. Cada recurso indica qué fecha se filtra. Los filtros por ID, estado o fecha nunca amplían los permisos del solicitante.

### Errores

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos enviados no son válidos",
    "details": [
      { "field": "fecha_nacimiento", "message": "No puede ser futura" }
    ]
  }
}
```

`code` y `message` son obligatorios; `details` es opcional y, cuando existe, es una lista de objetos con `field` y `message`. No incluir contraseñas, tokens, SQL, stack traces ni contenido clínico. Los códigos específicos son estables; los textos son descriptivos y no deben usarse como identificadores en el frontend.

| HTTP | Código | Uso |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Campo, filtro, tipo o combinación inválida; `details` identifica los campos cuando corresponda. |
| 400 | `INVALID_JSON` | JSON mal formado; comportamiento de la base actual. |
| 401 | `UNAUTHENTICATED` | Falta token o es inválido, expirado o de usuario inactivo. |
| 403 | `FORBIDDEN` | Identidad autenticada sin el rol exigido. |
| 404 | `NOT_FOUND` | Recurso inexistente o recurso privado que no pertenece a la identidad. |
| 409 | `CONFLICT` | Unicidad, transición inválida, solapamiento o versión obsoleta. |
| 413 | `PAYLOAD_TOO_LARGE` | El cuerpo JSON supera 100 KB; comportamiento de la base actual. |
| 415 | `UNSUPPORTED_ENCODING` | Codificación del cuerpo no compatible; comportamiento de la base actual. |
| 500 | `INTERNAL_ERROR` | Fallo no previsto, registrado en servidor sin exponer detalles al cliente. |
| 503 | `SERVICE_UNAVAILABLE` | Función o dependencia temporalmente no disponible; nunca simular éxito en el perfil final. |

Ejemplo de ruta inexistente, compatible con la base actual:

```json
{"error":{"code":"NOT_FOUND","message":"Recurso no encontrado"}}
```

## 3. Identidad, roles y autorización

Los códigos del DER y de la API son `paciente`, `profesional`, `administrador`. En los tickets `PATIENT`, `PROFESSIONAL`, `ADMIN` se refieren respectivamente a esos mismos códigos, no a valores adicionales. Un usuario puede tener varios roles y como máximo un perfil de cada tipo. Un perfil por sí solo no concede permisos: el rol debe estar vigente y el usuario activo.

Se envía `Authorization: Bearer <access_token>`. El servidor valida firma, vencimiento, estado del usuario y roles vigentes; no confía en un rol o ID declarados por el cliente. Ninguna operación pública permite asignarse `administrador` o `profesional`. CORS no reemplaza estas comprobaciones.

| Operación | Anónimo | Paciente | Profesional | Administrador |
|---|---|---|---|---|
| Registro/login/recuperación y consulta de directorio público | Sí | Sí | Sí | Sí |
| Datos propios y turnos propios | No | Solo propios | Solo agenda propia | Sin acceso automático a turnos ajenos |
| Pacientes | No | Solo su perfil | Solo pacientes vinculados, según sección 6 | Administración de perfiles |
| Administración del directorio y catálogos | No | No | No | Sí |
| Horarios y bloqueos | No | Solo disponibilidad pública, sin motivos | Solo agenda propia | Sin acceso automático |
| Fichas y notas | No | No definido para v1 | Solo fichas propias | Sin acceso clínico automático |
| Usuarios, roles y métricas | No | No | No | Sí |

Para un usuario multirrol se aplican los permisos de sus roles, sin convertir el rol administrador en acceso a fichas, notas o turnos de terceros. En recursos privados el servidor devuelve `404` para IDs ajenos, igual que para inexistentes; si falta el rol requerido devuelve `403`. La respuesta `401` no distingue entre credenciales inválidas, vencidas o cuenta inactiva.

Para no dejar turnos sin un titular habilitado, desactivar un usuario o retirar su rol de paciente/profesional se rechaza con `409` si el perfil afectado tiene turnos `reservado` cuyo `fin` aún no pasó. Primero deben cancelarse explícitamente; la baja no cancela ni modifica turnos por sí sola.

## 4. Entidades del DER y representación

Las 17 entidades están definidas en el [diccionario del DER](DER.md#4-diccionario-de-datos). La siguiente tabla fija sus claves, relaciones y exposición para la API; las validaciones y restricciones de integridad del DER siguen aplicando.

| Entidad | PK; FK principales | Exposición |
|---|---|---|
| `usuarios` | UUID `id` | Identidad propia y administración; nunca `password_hash`. |
| `roles` | `smallint id`; `codigo` único | Códigos en `usuario.roles`; sin CRUD público de roles. |
| `usuario_roles` | (`usuario_id`, `rol_id`); FK a usuario y rol | Se representa mediante `usuario.roles`, sin recurso independiente. |
| `pacientes` | UUID `id`; `usuario_id` único → usuario | Perfil de paciente; un usuario tiene como máximo uno. |
| `profesionales` | UUID `id`; `usuario_id` único → usuario, `zona_id` → zona | Perfil público o administrativo, con proyección distinta. |
| `zonas` | UUID `id` | Catálogo público activo y administración. |
| `especialidades` | UUID `id` | Catálogo público activo y administración. |
| `profesional_especialidades` | (`profesional_id`, `especialidad_id`); FK a ambas entidades | `especialidad_ids` del profesional, sin recurso independiente. |
| `trabajos_profesional` | UUID `id`; `profesional_id` → profesional | Trabajos visibles en perfil público; administración anidada. |
| `horarios_atencion` | UUID `id`; `profesional_id` → profesional | Reglas semanales privadas del profesional. |
| `bloqueos_agenda` | UUID `id`; `profesional_id` → profesional | Administración privada; el motivo nunca es público. |
| `turnos` | UUID `id`; `paciente_id` → paciente, `profesional_id` → profesional | Reserva, agenda y transiciones para sus titulares. |
| `fichas_clinicas` | UUID `id`; FK a paciente y profesional; par único | Solo el profesional dueño. |
| `notas_clinicas` | UUID `id`; `ficha_id` → ficha, `turno_id?` → turno | Solo el profesional dueño de la ficha. |
| `tokens_recuperacion` | UUID `id`; `usuario_id` → usuario | Interna; no se lista ni devuelve su hash. |
| `notificaciones` | UUID `id`; `turno_id` → turno | Interna; no se ofrece un CRUD público. |
| `eventos_visita` | UUID `id`; `usuario_id?` → usuario, `profesional_id?` → profesional | Interna; solo agregados administrativos, sujeto a privacidad. |

Los estados de usuario son `activo`, `inactivo`; los de turno `reservado`, `cancelado`, `atendido`, `ausente`. Las notificaciones usan tipos `confirmacion_paciente`, `recordatorio_paciente`, `resumen_profesional` y estados `pendiente`, `enviando`, `enviada`, `fallida`, `cancelada`. Eventos: `visita_inicio`, `visita_perfil`. Otros valores devuelven `400`.

### Representaciones comunes

Los siguientes campos constituyen la representación completa de cada recurso. Las relaciones por ID no incluyen automáticamente objetos de otras entidades.

| Recurso | Campos de `data` |
|---|---|
| Usuario | `id`, `nombre`, `apellido`, `email`, `telefono?`, `estado`, `roles` (arreglo de códigos), `creado_en`, `actualizado_en`. |
| Paciente | `id`, `usuario_id`, `nombre`, `apellido`, `fecha_nacimiento?`, `activo` (derivado: usuario activo y rol paciente vigente), `creado_en`, `actualizado_en`. No incluye email, teléfono ni notas clínicas. |
| Zona | `id`, `nombre`, `provincia`, `activa`, `creado_en`, `actualizado_en`. |
| Especialidad | `id`, `nombre`, `activa`, `creado_en`, `actualizado_en`. |
| Trabajo | `id`, `profesional_id`, `titulo`, `descripcion?`, `imagen_url?`, `visible`, `creado_en`, `actualizado_en`. |
| Profesional público | `id`, `nombre`, `apellido`, `zona_id`, `matricula`, `descripcion?`, `direccion_atencion`, `foto_url?`, `contacto_publico?`, `zona_horaria`, `duracion_consulta_min`, `especialidad_ids` y `trabajos` (arreglos). Solo especialidades activas y trabajos visibles. |
| Profesional administrativo | Los campos del profesional público más `usuario_id`, `visible`, `creado_en`, `actualizado_en`; incluye todas sus especialidades y trabajos. |
| Horario | `id`, `profesional_id`, `dia_semana`, `hora_inicio`, `hora_fin`, `vigente_desde`, `vigente_hasta?`, `activo`, `creado_en`, `actualizado_en`. |
| Bloqueo | `id`, `profesional_id`, `inicio`, `fin`, `motivo?`, `creado_en`, `actualizado_en`. |
| Turno | `id`, `paciente_id`, `profesional_id`, `inicio`, `fin`, `estado`, `version`, `cancelado_en?`, `creado_en`, `actualizado_en`. |
| Ficha | `id`, `paciente_id`, `profesional_id`, `creado_en`, `actualizado_en`. |
| Nota | `id`, `ficha_id`, `turno_id?`, `contenido`, `creado_en`, `actualizado_en`. |

Los campos públicos derivados `nombre` y `apellido` provienen de `usuarios`; se actualizan en el usuario, no duplicando columnas. `profesional_id` y `paciente_id` identifican perfiles, no usuarios. Los campos `creado_en`/`actualizado_en` de un perfil corresponden a ese perfil.

## 5. Acceso e identidad

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `POST /auth/registro` | Público | `nombre`, `apellido`, `email`, `password`; opcionales `telefono`, `fecha_nacimiento`. Crea usuario, rol y perfil paciente en una transacción. `201`: `data.usuario` y `data.paciente`; `Location: /api/v1/pacientes/{id}`. |
| `POST /auth/login` | Público | `email`, `password`. `200`: `data.access_token`, `token_type` (`Bearer`), `expires_in` en segundos y `usuario`. Credenciales inválidas: `401`. |
| `POST /auth/recuperacion` | Público | `email`. `202` con el mismo mensaje exista o no la cuenta; no devuelve token. |
| `POST /auth/restablecimiento` | Público | `token`, `password`. `200` con `data.message` de confirmación; token inválido, usado o expirado: `400 VALIDATION_ERROR`. |
| `GET /me` | Autenticado | `200` con el usuario propio. |
| `PATCH /me` | Autenticado | Modifica `nombre`, `apellido`, `telefono`; `200` con usuario propio. No cambia email, roles, estado ni contraseña. |

Se normaliza el email quitando espacios de extremos y usando minúsculas; máximo 254 caracteres y único sin distinguir mayúsculas. Nombre y apellido: cadenas no vacías, máximo 100; teléfono nullable de hasta 30 caracteres. Contraseña: cadena de 10 a 128 caracteres, sin recorte ni normalización silenciosa. La fecha de nacimiento no puede ser futura. Un email ya registrado en el alta devuelve `409 CONFLICT`; la recuperación siempre responde igual para evitar enumeración. El JWT de acceso dura 3600 segundos; `expires_in` indica su duración en segundos.

El token de recuperación es aleatorio, de un solo uso, expira a los 30 minutos y se guarda únicamente como hash; su consumo y cambio de contraseña son atómicos. Si la cuenta existe y está activa, se solicita el correo por un servicio real o mock. No incluir el token en logs ni respuestas. El cierre de sesión de v1 consiste en eliminar el token del cliente; **no revoca** un JWT ya emitido. El vencimiento y una futura revocación del lado del servidor deben definirse en PGSI-5; no afirmar que cerrar sesión invalida tokens robados.

Ejemplo de registro (`POST /api/v1/auth/registro`):

```json
{"nombre":"Ana","apellido":"Ejemplo","email":"ana@example.com","password":"ejemplo-ficticio","fecha_nacimiento":"1995-04-10"}
```

Respuesta `201`, con IDs y fecha ficticios:

```json
{
  "data": {
    "usuario": {
      "id": "11111111-1111-4111-8111-111111111111",
      "nombre": "Ana",
      "apellido": "Ejemplo",
      "email": "ana@example.com",
      "telefono": null,
      "estado": "activo",
      "roles": ["paciente"],
      "creado_en": "2026-11-23T12:00:00Z",
      "actualizado_en": "2026-11-23T12:00:00Z"
    },
    "paciente": {
      "id": "22222222-2222-4222-8222-222222222222",
      "usuario_id": "11111111-1111-4111-8111-111111111111",
      "nombre": "Ana",
      "apellido": "Ejemplo",
      "fecha_nacimiento": "1995-04-10",
      "activo": true,
      "creado_en": "2026-11-23T12:00:00Z",
      "actualizado_en": "2026-11-23T12:00:00Z"
    }
  }
}
```

Solicitud de recuperación:

```json
{"email":"ana@example.com"}
```

Respuesta `202` para una cuenta existente o inexistente:

```json
{"data":{"message":"Si la cuenta existe y está activa, recibirá instrucciones de recuperación."}}
```

Ejemplo de login (`POST /api/v1/auth/login`), usando únicamente credenciales ficticias:

```json
{"email":"ana@example.com","password":"ejemplo-ficticio"}
```

Respuesta `200`; el token mostrado es un marcador, no un JWT utilizable:

```json
{
  "data": {
    "access_token": "<token>",
    "token_type": "Bearer",
    "expires_in": 3600,
    "usuario": {
      "id": "11111111-1111-4111-8111-111111111111",
      "nombre": "Ana",
      "apellido": "Ejemplo",
      "email": "ana@example.com",
      "telefono": null,
      "estado": "activo",
      "roles": ["paciente"],
      "creado_en": "2026-11-23T12:00:00Z",
      "actualizado_en": "2026-11-23T12:00:00Z"
    }
  }
}
```

## 6. Pacientes y usuarios

### Pacientes

Un profesional está vinculado a un paciente para esta API si comparten al menos un turno `reservado`, `atendido` o `ausente`; un turno solamente `cancelado` no habilita el acceso. El profesional accede exclusivamente a la representación de paciente anterior, no a su email ni teléfono. Un paciente ve solo su propio perfil; el administrador ve todos, incluidos inactivos.

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `GET /pacientes` | Paciente, profesional o administrador | Lista según alcance anterior. Filtros `q` (nombre/apellido), `activo` (`true`/`false`); orden por `id`, `nombre`, `apellido`, `fecha_nacimiento`, `creado_en`; predeterminado `apellido`. |
| `GET /pacientes/{id}` | Paciente propio, profesional vinculado o administrador | Detalle del perfil. |
| `POST /pacientes` | Administrador | `usuario_id`, `fecha_nacimiento?`; crea perfil y asigna rol paciente en transacción. Si el perfil existe sin rol, reactiva ese rol y actualiza la fecha solo si se envía: `200`; si ya tiene rol paciente: `409`. Creación nueva: `201`. |
| `PATCH /pacientes/{id}` | Paciente propio o administrador | `fecha_nacimiento` nullable; `200` con perfil. Nombre y apellido se cambian en el usuario. |
| `DELETE /pacientes/{id}` | Administrador | Retira el rol paciente sin borrar perfil ni historial. Si no quedan roles, desactiva el usuario; no desactiva otros roles. `204`; repetir la baja de un perfil existente también devuelve `204`. |

Para reactivar un perfil cuya cuenta quedó inactiva por ser su único rol, el administrador debe activar el usuario mediante `PATCH /usuarios/{id}` y luego reactivar el perfil mediante `POST /pacientes`. La creación y reactivación rechazan usuarios inactivos. La fecha debe ser válida y no futura.

Ejemplo `GET /api/v1/pacientes?page=1&limit=10&sortBy=apellido&order=asc`:

```json
{
  "data": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "usuario_id": "11111111-1111-4111-8111-111111111111",
      "nombre": "Ana",
      "apellido": "Ejemplo",
      "fecha_nacimiento": "1995-04-10",
      "activo": true,
      "creado_en": "2026-11-23T12:00:00Z",
      "actualizado_en": "2026-11-23T12:00:00Z"
    }
  ],
  "meta": {"page":1,"limit":10,"total":1,"totalPages":1}
}
```

### Usuarios y roles administrativos

Todas las siguientes operaciones requieren `administrador`.

| Método y ruta | Cuerpo y resultado |
|---|---|
| `GET /usuarios` | Lista; filtros `q` (nombre/apellido/email), `estado`, `rol`; orden por `id`, `nombre`, `apellido`, `email`, `creado_en`; predeterminado `apellido`. |
| `GET /usuarios/{id}` | Usuario completo sin hash. |
| `POST /usuarios` | `nombre`, `apellido`, `email`, `password`, `roles`, `telefono?`, `fecha_nacimiento?`. `roles` no vacío, con `paciente` y/o `administrador`; asignar paciente crea su perfil en la misma transacción. `fecha_nacimiento` solo se admite con `paciente`. Para crear un profesional usar la operación de profesionales. `201` y usuario. |
| `PATCH /usuarios/{id}` | `nombre`, `apellido`, `telefono`, `estado`; `200` y usuario. Al inactivar, el acceso queda denegado aunque el token no haya vencido. |
| `PUT /usuarios/{id}/roles` | `roles` es el arreglo completo deseado. Al agregar paciente se crea el perfil si no existe; profesional solo puede agregarse si el perfil ya existe. Al retirar roles se conservan los perfiles y el historial. El arreglo vacío solo se admite si el usuario está inactivo. `200` y usuario. |
| `DELETE /usuarios/{id}` | Baja lógica: cambia `estado` a `inactivo`, conserva roles, perfiles e historial; `204`, también si ya estaba inactivo. |

Cambios de roles y perfiles son transaccionales. No se permite quitar el último administrador activo ni desactivarlo; devuelve `409 CONFLICT`. El alta pública nunca utiliza estas operaciones.

## 7. Directorio, catálogos y trabajos

El directorio público solo muestra profesionales visibles cuyo usuario esté activo, su zona esté activa y tenga al menos una especialidad activa. Las búsquedas públicas por especialidad solo usan especialidades activas. La proyección pública no devuelve email, teléfono privado, `usuario_id` ni trabajos ocultos. Todas las escrituras son de administrador.

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `GET /profesionales` | Público | Lista pública; filtros combinables `q` (nombre/apellido), `zona_id`, `especialidad_id`; orden `id`, `nombre`, `apellido`, `matricula`; predeterminado `apellido`. |
| `GET /profesionales/{id}` | Público | Detalle público; invisible o no elegible: `404`. |
| `GET /admin/profesionales` | Administrador | Lista administrativa, incluso invisibles; filtros `q`, `zona_id`, `especialidad_id`, `visible`; mismos campos de orden y predeterminado. |
| `GET /admin/profesionales/{id}` | Administrador | Detalle administrativo. |
| `POST /admin/profesionales` | Administrador | `usuario_id`, `zona_id`, `matricula`, `direccion_atencion`, `duracion_consulta_min`, `especialidad_ids`; opcionales `descripcion?`, `foto_url?`, `contacto_publico?`, `zona_horaria`, `visible`. Crea perfil y asigna rol en transacción; usuario activo y perfil inexistente requeridos. `201`; `Location: /api/v1/admin/profesionales/{id}`. |
| `PATCH /admin/profesionales/{id}` | Administrador | Campos anteriores salvo `usuario_id`; reemplazar `especialidad_ids` sustituye el arreglo completo. `200` con detalle administrativo. |
| `DELETE /admin/profesionales/{id}` | Administrador | Oculta el perfil (`visible=false`) sin borrar historial ni retirar el rol; `204`, también si ya estaba oculto. Desactivar la cuenta es una operación separada. |

Matrícula obligatoria, única, máximo 100; dirección obligatoria de hasta 255; duración entera positiva en minutos; zona horaria IANA predeterminada `America/Argentina/Buenos_Aires`; visibilidad predeterminada `false`. Para publicar (`visible=true`), el usuario, la zona y al menos una especialidad deben estar activos. `especialidad_ids` es un arreglo sin duplicados. Descripción, foto y contacto son nullable; contacto se muestra solo si fue autorizado por el profesional. Al desactivar un catálogo no se borran sus relaciones.

Ejemplo de detalle público (`GET /api/v1/profesionales/33333333-3333-4333-8333-333333333333`), respuesta `200`:

```json
{
  "data": {
    "id": "33333333-3333-4333-8333-333333333333",
    "nombre": "Laura",
    "apellido": "Ejemplo",
    "zona_id": "77777777-7777-4777-8777-777777777777",
    "matricula": "DEMO-123",
    "descripcion": "Perfil ficticio",
    "direccion_atencion": "Dirección ficticia",
    "foto_url": null,
    "contacto_publico": null,
    "zona_horaria": "America/Argentina/Buenos_Aires",
    "duracion_consulta_min": 30,
    "especialidad_ids": ["88888888-8888-4888-8888-888888888888"],
    "trabajos": []
  }
}
```

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `GET /zonas`, `GET /especialidades` | Público | Listas de catálogos activos. `q` sobre nombre; zonas además `provincia`. Orden zonas por `id`, `nombre`, `provincia`; especialidades por `id`, `nombre`; predeterminado `nombre`. |
| `GET /zonas/{id}`, `GET /especialidades/{id}` | Público | Detalle si está activo; si no, `404`. |
| `GET /admin/zonas`, `GET /admin/especialidades` | Administrador | Listas con activos e inactivos; mismos filtros y orden, más `activa` (`true`/`false`). |
| `GET /admin/zonas/{id}`, `GET /admin/especialidades/{id}` | Administrador | Detalle, incluso inactivo. |
| `POST /admin/zonas`, `POST /admin/especialidades` | Administrador | Zona: `nombre`, `provincia`; especialidad: `nombre`. `activa` opcional, predeterminada `true`. `201` y recurso administrativo. |
| `PATCH /admin/zonas/{id}`, `PATCH /admin/especialidades/{id}` | Administrador | Los mismos campos, todos opcionales; `200` y recurso. |
| `DELETE /admin/zonas/{id}`, `DELETE /admin/especialidades/{id}` | Administrador | Cambia `activa` a `false`, conserva referencias; `204`, también si ya estaba inactivo. |
| `POST /admin/profesionales/{id}/trabajos` | Administrador | `titulo`; opcionales `descripcion?`, `imagen_url?`, `visible` (predeterminado `false`). `201` y trabajo; `Location: /api/v1/admin/profesionales/{id}/trabajos/{trabajo_id}`. |
| `GET /admin/profesionales/{id}/trabajos/{trabajo_id}` | Administrador | Detalle de un trabajo perteneciente al profesional. |
| `PATCH /admin/profesionales/{id}/trabajos/{trabajo_id}` | Administrador | `titulo`, `descripcion`, `imagen_url`, `visible`; `200` y trabajo. |
| `DELETE /admin/profesionales/{id}/trabajos/{trabajo_id}` | Administrador | Oculta el trabajo (`visible=false`); `204`, también si ya estaba oculto. |

Las listas de trabajos son el arreglo `trabajos` incluido en el detalle administrativo; no hay listado independiente paginado en v1. Para las longitudes y unicidad de catálogos y trabajos se aplica el DER. Ningún archivo binario se sube mediante esta API.

## 8. Horarios, disponibilidad y bloqueos

Solo el profesional autenticado administra su propia agenda. Los IDs ajenos devuelven `404`. La consulta de disponibilidad es pública y solo admite profesionales visibles y elegibles.

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `GET /profesionales/{id}/horarios` | Profesional dueño | Lista; filtros `activo`, `dia_semana`; orden `id`, `dia_semana`, `hora_inicio`, `vigente_desde`; predeterminado `dia_semana`. |
| `POST /profesionales/{id}/horarios` | Profesional dueño | `dia_semana`, `hora_inicio`, `hora_fin`, `vigente_desde`; opcionales `vigente_hasta?`, `activo` (predeterminado `true`). `201` y horario; `Location: /api/v1/horarios/{horario_id}`. |
| `GET /horarios/{horario_id}` | Profesional dueño | Detalle de horario. |
| `PATCH /horarios/{horario_id}` | Profesional dueño | Mismos campos editables del alta; `200` y horario. |
| `DELETE /horarios/{horario_id}` | Profesional dueño | Desactiva (`activo=false`); `204`, también si ya estaba inactivo. |
| `GET /profesionales/{id}/bloqueos` | Profesional dueño | Lista; filtros `desde`, `hasta` por solapamiento con `[inicio, fin)`; orden `id`, `inicio`, `fin`; predeterminado `inicio`. |
| `POST /profesionales/{id}/bloqueos` | Profesional dueño | `inicio`, `fin`, `motivo?`; `201` y bloqueo; `Location: /api/v1/bloqueos/{bloqueo_id}`. |
| `GET /bloqueos/{bloqueo_id}` | Profesional dueño | Detalle de bloqueo, incluido su motivo privado. |
| `PATCH /bloqueos/{bloqueo_id}` | Profesional dueño | `inicio`, `fin`, `motivo`; `200` y bloqueo. |
| `DELETE /bloqueos/{bloqueo_id}` | Profesional dueño | Elimina el bloqueo; `204`. Un ID inexistente devuelve `404`. |
| `GET /profesionales/{id}/disponibilidad` | Público | Requiere `desde` y `hasta` como fechas locales inclusivas `YYYY-MM-DD`, máximo 31 días. Devuelve lista paginada de franjas `inicio`, `fin`, `zona_horaria`, ordenada solo por `inicio`; no acepta `sortBy` distinto de `inicio` ni otro `order` que `asc`. |

`dia_semana` es 1 lunes a 7 domingo. Los horarios son locales, no cruzan medianoche y no pueden solaparse con reglas activas del mismo día y vigencias superpuestas. Las vigencias son inclusivas. Los bloqueos son instantes `[inicio, fin)` con `inicio < fin`. Los cambios de horarios o bloqueos que afecten un turno reservado devuelven `409`; no lo cancelan automáticamente.

La disponibilidad se calcula con reglas vigentes y zona IANA del profesional, usando su duración de consulta y descontando bloqueos y turnos `reservado`. Las franjas son contiguas desde el inicio de la regla, de duración completa, y no se ofrecen franjas ya iniciadas. Instantes imposibles o ambiguos por cambios de zona horaria no se ofrecen. Consultar disponibilidad no reserva una franja; la reserva debe volver a validarla transaccionalmente.

Ejemplo de horario (`POST /api/v1/profesionales/33333333-3333-4333-8333-333333333333/horarios`):

```json
{"dia_semana":1,"hora_inicio":"09:00:00","hora_fin":"12:00:00","vigente_desde":"2026-11-23","vigente_hasta":null}
```

Respuesta `201`:

```json
{
  "data": {
    "id": "99999999-9999-4999-8999-999999999999",
    "profesional_id": "33333333-3333-4333-8333-333333333333",
    "dia_semana": 1,
    "hora_inicio": "09:00:00",
    "hora_fin": "12:00:00",
    "vigente_desde": "2026-11-23",
    "vigente_hasta": null,
    "activo": true,
    "creado_en": "2026-11-23T12:00:00Z",
    "actualizado_en": "2026-11-23T12:00:00Z"
  }
}
```

Ejemplo `GET /api/v1/profesionales/33333333-3333-4333-8333-333333333333/disponibilidad?desde=2026-11-30&hasta=2026-11-30`, suponiendo que las demás franjas están ocupadas o bloqueadas:

```json
{
  "data": [
    {"inicio":"2026-11-30T12:00:00Z","fin":"2026-11-30T12:30:00Z","zona_horaria":"America/Argentina/Buenos_Aires"}
  ],
  "meta": {"page":1,"limit":10,"total":1,"totalPages":1}
}
```

Las franjas se ordenan por `inicio` ascendente y, en caso de empate, por `fin` ascendente.

## 9. Turnos

Las listas y detalles están limitados a la unión de turnos propios como paciente y agenda propia como profesional. Un administrador sin esos roles no accede a turnos individuales. Solo un paciente activo reserva para sí mismo; no se admite `paciente_id` en la solicitud. El profesional debe ser visible y elegible. El servidor calcula `fin` según la duración configurada y devuelve instantes UTC.

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `GET /turnos` | Paciente o profesional | Lista; filtros `desde`, `hasta` sobre `inicio`, `estado`, `paciente_id`, `profesional_id`; orden `id`, `inicio`, `estado`, `creado_en`; predeterminado `inicio`. |
| `GET /turnos/{id}` | Paciente o profesional titular | Detalle. |
| `POST /turnos` | Paciente | `profesional_id`, `inicio`. `201` y turno `reservado` con `version=1`; `Location: /api/v1/turnos/{id}`. |
| `PATCH /turnos/{id}` | Paciente o profesional titular | `inicio`, `version` actual; reprograma un turno reservado. `200` con turno actualizado y versión incrementada. |
| `PATCH /turnos/{id}/estado` | Paciente o profesional titular | `estado`, `version` actual. Paciente o profesional pueden cancelar; solo profesional puede marcar `atendido` o `ausente`, una vez iniciado el turno. `200` y turno actualizado. |
| `DELETE /turnos/{id}?version={version}` | Paciente o profesional titular | Equivale a cancelar; `200` con turno cancelado. No elimina físicamente. |

La única transición de estado es desde `reservado` hacia `cancelado`, `atendido` o `ausente`. `cancelado_en` es un instante únicamente para turnos cancelados; en los demás es `null`. Toda reprogramación o cambio de estado incrementa `version`; una versión desactualizada devuelve `409 CONFLICT` sin modificar datos. Para reservar o reprogramar, `inicio` debe ser futuro, corresponder exactamente a una franja disponible y respetar vigencia, duración y bloqueos.

Las verificaciones y escrituras de horarios, bloqueos y turnos se serializan por profesional en una transacción; PostgreSQL además usa exclusión de turnos reservados por rango `[inicio, fin)` según el DER. Un turno que comienza exactamente cuando otro termina no se solapa. El conflicto de agenda o de versión devuelve `409`; una confirmación o notificación fallida no revierte la reserva.

Ejemplo de reserva (`POST /api/v1/turnos`):

```json
{"profesional_id":"33333333-3333-4333-8333-333333333333","inicio":"2026-11-30T09:00:00-03:00"}
```

Respuesta `201`:

```json
{
  "data": {
    "id": "44444444-4444-4444-8444-444444444444",
    "paciente_id": "22222222-2222-4222-8222-222222222222",
    "profesional_id": "33333333-3333-4333-8333-333333333333",
    "inicio": "2026-11-30T12:00:00Z",
    "fin": "2026-11-30T12:30:00Z",
    "estado": "reservado",
    "version": 1,
    "cancelado_en": null,
    "creado_en": "2026-11-23T12:00:00Z",
    "actualizado_en": "2026-11-23T12:00:00Z"
  }
}
```

Reprogramación (`PATCH /api/v1/turnos/44444444-4444-4444-8444-444444444444`):

```json
{"inicio":"2026-11-30T09:30:00-03:00","version":1}
```

Respuesta `200`: el mismo turno, con `inicio` `2026-11-30T12:30:00Z`, `fin` `2026-11-30T13:00:00Z`, `version` 2 y `actualizado_en` actualizado. Cancelación con `PATCH /turnos/{id}/estado`:

```json
{"estado":"cancelado","version":2}
```

Respuesta `200`: el mismo turno con `estado` `cancelado`, `version` 3 y `cancelado_en` informado. Si la versión 2 ya no es la actual:

```json
{"error":{"code":"CONFLICT","message":"El turno fue modificado; vuelva a consultarlo"}}
```

## 10. Fichas y notas clínicas

Solo el profesional dueño puede acceder; ni el paciente ni un administrador obtienen acceso clínico automático. Para crear una ficha debe existir al menos un turno `atendido` entre ese paciente y el profesional. Una ficha por pareja paciente-profesional. `turno_id` en una nota es opcional; si se envía debe ser un turno `atendido` de la misma pareja. Por privacidad, datos clínicos no se incluyen en logs, métricas ni correo.

| Método y ruta | Acceso | Cuerpo y resultado |
|---|---|---|
| `GET /fichas` | Profesional | Solo propias; filtro `paciente_id`; orden `id`, `creado_en`; predeterminado `creado_en`. |
| `POST /fichas` | Profesional | `paciente_id`; el profesional se toma del token. `201` y ficha; pareja existente: `409`. |
| `GET /fichas/{id}` | Profesional dueño | Detalle. |
| `GET /fichas/{id}/notas` | Profesional dueño | Lista; filtros `desde`, `hasta` sobre `creado_en`; orden `id`, `creado_en`; predeterminado `creado_en`. |
| `POST /fichas/{id}/notas` | Profesional dueño | `contenido`, `turno_id?`; contenido no vacío. `201` y nota; `Location: /api/v1/fichas/{id}/notas/{nota_id}`. |
| `GET /fichas/{id}/notas/{nota_id}` | Profesional dueño | Detalle de nota perteneciente a la ficha. |

En v1 no se ofrecen edición ni eliminación de notas. La corrección controlada requiere auditoría, retención y revisión antes de habilitarla en producción. En el prototipo solo se usan textos ficticios.

Ejemplo de nota (`POST /api/v1/fichas/55555555-5555-4555-8555-555555555555/notas`):

```json
{"contenido":"Nota de demostración sin datos reales.","turno_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}
```

Respuesta `201`, suponiendo que el turno pertenece a la ficha y está atendido:

```json
{
  "data": {
    "id": "66666666-6666-4666-8666-666666666666",
    "ficha_id": "55555555-5555-4555-8555-555555555555",
    "turno_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "contenido": "Nota de demostración sin datos reales.",
    "creado_en": "2026-11-30T13:00:00Z",
    "actualizado_en": "2026-11-30T13:00:00Z"
  }
}
```

## 11. Métricas y notificaciones

Las métricas requieren `administrador`, `desde` y `hasta` como instantes con offset y `desde < hasta`. Admiten `profesional_id` opcional y usan el intervalo `[desde, hasta)`. Son agregados, no listas de pacientes ni acceso a turnos o notas individuales.

| Método y ruta | Respuesta `data` |
|---|---|
| `GET /admin/metricas/ausentismo` | `desde`, `hasta`, `profesional_id?`, `atendidos`, `ausentes`, `tasa`. Cuenta turnos por `inicio` y estado actual; `tasa = ausentes / (atendidos + ausentes)`, o `null` si el denominador es cero. Excluye cancelados y reservados. |
| `GET /admin/metricas/ocupacion` | `desde`, `hasta`, `profesional_id?`, `segundos_disponibles`, `segundos_ocupados`, `tasa`, `metodologia` (`agenda_actual`). |
| `GET /admin/metricas/trafico` | `desde`, `hasta`, `profesional_id?`, `visita_inicio`, `visita_perfil`. Cuenta eventos por `ocurrido_en`; con `profesional_id` solo eventos asociados a ese profesional. No son visitantes únicos. |

Ocupación: por profesional, calcular la unión de franjas generadas con las reglas **actuales** vigentes en el período y su zona IANA, recortarlas al intervalo solicitado y restar la unión de bloqueos. Para esta métrica no se aplica el filtro de franjas ya iniciadas de la disponibilidad pública ni se descuentan turnos de la capacidad. `segundos_disponibles` es la duración resultante. `segundos_ocupados` es la duración de la intersección de esa capacidad con la unión de turnos `reservado`, `atendido` o `ausente`; se excluyen cancelados. Sumar ambos valores entre profesionales antes de dividir; `tasa` es ocupados/disponibles, o `null` si no hay capacidad. No se promete reconstrucción histórica: cambiar reglas, duración o bloqueos puede alterar métricas de períodos pasados. Para históricos confiables se necesitarán snapshots y otro acuerdo.

Ejemplo `GET /api/v1/admin/metricas/ausentismo?desde=2026-11-01T00:00:00Z&hasta=2026-12-01T00:00:00Z`:

```json
{"data":{"desde":"2026-11-01T00:00:00Z","hasta":"2026-12-01T00:00:00Z","profesional_id":null,"atendidos":8,"ausentes":2,"tasa":0.2}}
```

La captura real de visitas no se activa hasta definir consentimiento, retención y privacidad; mientras esté deshabilitada, tráfico devuelve `503 SERVICE_UNAVAILABLE`, no un cero que parezca real. El prototipo puede devolver datos ficticios. El canal de origen no forma parte de este contrato.

Las notificaciones son internas, sin endpoint público en v1. Al reservar o reprogramar se programa confirmación y un recordatorio 24 horas antes; la clave (`turno_id`, `turno_version`, `tipo`) evita trabajos duplicados. Al cancelar o reprogramar se invalidan trabajos pendientes de versiones anteriores y se revisa el estado/versión antes del envío. Reclamación atómica, reintentos controlados y errores sanitizados son obligatorios; la clave no garantiza entrega exactamente una vez. Para reservas con menos de 24 horas y para el horario del aviso al profesional falta acuerdo; no se debe programar un envío en el pasado. No enviar contenido clínico por correo hasta acordar consentimiento y canal seguro.

## 12. Health y evolución del contrato

`GET /api/v1/health` es público y devuelve `200`:

```json
{"data":{"status":"ok"}}
```

Solo verifica que el proceso responde, no la base de datos. No cambiar las formas descritas sin actualizar el contrato, las pruebas y los consumidores en el PR. La aprobación del equipo en el PR a `dev` es la revisión de PGSI-2; hasta entonces las decisiones son propuestas, no aprobaciones ya obtenidas.
