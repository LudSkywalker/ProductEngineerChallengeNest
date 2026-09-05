# Plan 003 — Causas raíz y enfoque técnico

## Evidencia (causa raíz → síntoma)
| # | Causa raíz | Evidencia | Síntoma / Estado |
|---|-----------|-----------|------------------|
| R9 | `redisStore` hardcodea `db: 0` ignorando `REDIS_DB=1` del env | `src/app.module.ts:36`; `.env` (`REDIS_DB=1`) | Datos de caché en la DB equivocada; lectura/escritura incoherente |
| R10 | Dos composables compitiendo (`compose.yaml` con bind-mounts vs `docker-compose.yml` con `npm install` runtime) + `package-lock.json` corrupto (dir vacía root) | `git status`: ambos untracked; `ls -la` (jul 2 / sep 3) | Arranques intermitentes/bloqueados |
| R11 | Volúmenes declarados sin montar (`pgdata`, `redisdata`) → sin persistencia real | `compose.yaml` sección `volumes` | Datos perdidos al `down` |
| R12 | Invalidación parcial de caché de usuarios (solo clave por id o solo `users:all`, según operación) | `src/users/users.service.ts` | Lista de usuarios obsoleta tras mutaciones |

## Decisiones
- **R9**: `db: parseInt(process.env.REDIS_DB ?? '0', 10)` en `app.module.ts`. Único cambio.
- **R10**: Consolidar en `compose.yaml` + `Dockerfile.dev` (pnpm, `--frozen-lockfile`, código en bind-mount). `docker-compose.yml` eliminado; artefacto `package-lock.json` (dir vacía root-owned) eliminado. README actualizado a `docker compose up -d --build`. **Estado: HECHO (infra), pende verificación live.**
- **R11**: Montar `pgdata:/var/lib/postgresql/data`; `redisdata` se monta igual o se elimina (decidir en T16 según si se quiere persistencia Redis — default: montar ambos, costo cero).
- **R12**: En cada mutación de usuario, invalidar ambas claves (`user:${id}` y `users:all`) con el mismo store.

## Riesgos
- Cambiar la DB de Redis vacía la caché existente al desplegar (acceptable: dev).
