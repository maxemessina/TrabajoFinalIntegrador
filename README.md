# Portal de Gestión para Profesionales de la Salud

Trabajo Final Integrador — Grupo 28: Máximo Messina, Priscila Arrimada y Valentina Guerrieri.

Portal para buscar profesionales por zona y especialidad, gestionar turnos y acompañar la atención de pacientes.

## Estructura

- `backend/`: base de la API con Node.js, TypeScript y Express; ver [instrucciones de instalación y ejecución](backend/README.md).
- `frontend/`: futura aplicación con React y TypeScript.
- `docs/`: documentación compartida y [contrato API v1 propuesto](docs/contrato-api.md).
- `postman/`: futura colección de pruebas de la API.
- [DER.md](docs/DER.md): propuesta de modelo de datos para PostgreSQL.

El backend cuenta con un servidor inicial, una ruta de salud y la base de persistencia PostgreSQL con Sequelize: conexión, migraciones y modelos iniciales de usuarios, roles y pacientes. Aún no implementa endpoints de dominio ni datos demo. El frontend todavía no está implementado. Para el prototipo se usarán respuestas simuladas sin escrituras persistentes; la aplicación final utilizará PostgreSQL y Sequelize.

El repositorio es público: utilizar únicamente datos ficticios y no versionar datos de pacientes ni credenciales.

## Preparación local

1. Instalar Git. Para desarrollar los componentes se necesitarán Node.js con npm y PostgreSQL.
2. Clonar el repositorio y entrar en él:

   ```sh
   git clone https://github.com/maxemessina/TrabajoFinalIntegrador.git
   cd TrabajoFinalIntegrador
   ```

3. Copiar `sample.env` a `.env` y ajustar la configuración local si es necesario. En PowerShell:

   ```powershell
   Copy-Item sample.env .env
   ```

   No subir `.env` ni credenciales al repositorio. Seguir las [instrucciones del backend](backend/README.md) para instalarlo, iniciarlo y ejecutar sus comprobaciones. El frontend aún no tiene comandos de instalación ni ejecución.

## Ramas y contribuciones

- `main` corresponde a producción; `dev`, a integración de desarrollo. Ambas están protegidas y requieren una aprobación de PR.
- Crear una rama identificable desde `dev`, por ejemplo `feature/pgsi-1-messina`, y abrir un PR hacia `dev`. Mantener los cambios de cada integrante identificables.
- La integración de `dev` en `main` se realiza mediante PR para una liberación.
- El trabajo se organiza en el [tablero de Jira](https://messinamaximo.atlassian.net/jira/software/projects/PGSI/boards/2/backlog).

## Integración continua

GitHub Actions comprueba la estructura inicial, que los archivos `.env` estén ignorados y no versionados, y los errores de espacios del último commit en pushes y PR hacia `dev` o `main`. También instala las dependencias del backend y ejecuta lint, compilación, verificación de tipos, pruebas y migraciones contra PostgreSQL temporal.
