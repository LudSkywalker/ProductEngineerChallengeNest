# Spec 003 — Ambiente y configuración coherente

## Objetivo (qué y por qué)
La aplicación no respeta la configuración declarada (`REDIS_DB`) y el stack se arrancaba con composables conflictivos. Debe:
1. El store Redis use la DB del env (`REDIS_DB=1`), sin hardcode.
2. Un solo `compose.yaml` confiable (build reproducible, persistencia de Postgres) + un solo lockfile válido.
3. La caché de usuarios no dejar ítems obsoletos tras crear/eliminar un usuario (mismo patrón que spec 002).

## Restricciones
- `pnpm` es el único gestor; `package-lock.json` prohibido en el repo.
- No cambiar puertos ni imágenes sin necesidad.

## Criterios de aceptación
- [x] `redis-cli -n 1 keys '*'` muestra `product-search:*`, `users:all`, `user:1`; db 0 vacío.
- [x] `docker compose up -d --build` funciona (build reproducido con pnpm 9); `POST /users` visible en `GET /users` con caché caliente (invalidación live).
- [x] Ningún `package-lock.json` ni `docker-compose.yml` en el árbol del repo (`ls` confirmado).
