# Tasks 003

- [x] T15: Consolidar compose único + `Dockerfile.dev` (pnpm) + eliminar `docker-compose.yml`, `package-lock.json`, actualizar README
- [x] T16: Montar `pgdata` (y `redisdata`) en los servicios de `compose.yaml` → persistencia real verificada tras `down && up` (products=3 intactos) — `evidence.md`
- [x] T17: `REDIS_DB` del env en lugar de `db: 0` hardcodeado — live: claves de la app en db 1, no db 0 — `evidence.md`
- [x] T18: ~~Invalidación de caché de usuarios~~ — VERIFICADO NO APLICABLE: `create()` borra `users:all` y `remove()` borra ambas claves (`users.service.ts:49,56-57`)
- [x] T19: Verificar live: `product-search:*`, `users:all`, `user:1` en db 1 (TTL 60); invalidación de usuarios tras POST/DELETE con caché caliente; persistencia tras `down && up` — `evidence.md`
- [x] T20: `pnpm test` (1/1) y `pnpm run lint` (0 errores; 1 warning preexistente en main.ts) en verde
