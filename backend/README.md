# Backend

Base de la API con Node.js, TypeScript y Express. Todavía no incluye módulos de dominio, autenticación, Sequelize ni conexión a PostgreSQL.

## Arquitectura inicial

```text
backend/
  src/
    app.ts                 Aplicación y montaje de rutas y middlewares
    server.ts              Arranque HTTP
    config.ts              Variables de entorno
    models/                Futuros modelos y asociaciones Sequelize
    routes/                Endpoints HTTP
    schemas/               Futura validación de solicitudes
    services/              Futura lógica de negocio
    middleware/            Middlewares compartidos
    database/
      migrations/          Futuras migraciones de PostgreSQL
      seeders/             Futuros datos iniciales o de demostración
  tests/
    unit/                  Pruebas unitarias
    integration/           Pruebas HTTP y de integración
```

Las rutas reciben las solicitudes, utilizarán los esquemas para validarlas y delegarán la lógica a los servicios. Los archivos de rutas utilizan el sufijo `.routes.ts`; modelos y servicios, `.ts`; esquemas, `.schema.ts`. Si una ruta necesita un controlador separado, podrá agregarse sin obligar a usarlo en todas. Las carpetas vacías contienen `.gitkeep`, no código funcional.

Las migraciones serán la fuente de verdad del esquema; los modelos deberán reflejarlas, según el [DER](../DER.md). No se incluyen aún funcionalidades específicas para preservar la distribución de tareas del equipo.

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

CORS controla qué respuestas puede leer un navegador desde otro origen; no sustituye autenticación ni autorización.

## Comprobaciones

Desde `backend/`:

```sh
npm run lint
npm run build
npm run typecheck
npm test
```

La CI ejecuta estas comprobaciones con Node.js 22.18 y 24. `typecheck` también verifica los tipos de las pruebas; `build` genera la aplicación en `dist/`.

## Respuestas iniciales

Estas formas coinciden con la propuesta del [contrato API v1](../docs/contrato-api.md).

- `GET /api/v1/health`: `200` y `{"data":{"status":"ok"}}`. Verifica que el proceso responde, no la conexión a una base de datos.
- Rutas inexistentes y errores: `{"error":{"code":"NOT_FOUND","message":"Recurso no encontrado"}}`, con el estado HTTP correspondiente. Los errores internos no exponen detalles al cliente y se registran en el servidor.

El cuerpo JSON está limitado a 100 KB. La API aún no implementa persistencia ni operaciones de negocio; el prototipo deberá conservar el modo sin escrituras persistentes.
