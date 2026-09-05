# Evidencia — Spec 003 (Ambiente y configuración coherente)

Sesión live: 2026-09-04.

## T16 — Volúmenes de persistencia

`compose.yaml` define:

```yaml
volumes:
  pgdata:
  redisdata:
# db:    - pgdata:/var/lib/postgresql/data
# redis: - redisdata:/data
```

Verificado con ciclo completo:

```sh
curl -s http://localhost:3000/products | grep -c '"id"'     # 3
docker compose down && docker compose up -d                  # los 3 contenedores healthy
docker exec challenge-db psql ... "SELECT count(*) FROM products"   # 3
```

Datos de Postgres sobreviven al reinicio. Tablas: `categories(3)`, `orders(3)`, `order_items(3)`, `products(3)`, `users`.

## T17 — `REDIS_DB` respetado

- `challenge-api` arranca con `REDIS_HOST=redis REDIS_PORT=6379 REDIS_DB=1` (compose.yaml).
- El adapter de `src/app.module.ts` construye el store con `{ host, port, db: Number(process.env.REDIS_DB), ttl: 60000 }` — sin hardcode.
- Evidencia live: todas las claves de la app aparecen en **db 1** (abajo), no en db 0.

## T19 — Caché live (productos + usuarios)

Productos:

```sh
curl -s 'http://localhost:3000/products/search?q=alpha' >/dev/null
docker exec challenge-redis redis-cli -n 1 keys 'product-search:*'   # product-search:alpha
docker exec challenge-redis redis-cli -n 1 ttl product-search:alpha  # 60
```

Usuarios (caché caliente + invalidación):

```sh
curl -s http://localhost:3000/users >/dev/null
docker exec challenge-redis redis-cli -n 1 keys 'users:*'            # users:all
curl -s -X POST http://localhost:3000/users -d '{"name":"Evidence User","email":"evidence-1788504200@test.io"}' \
   -H 'Content-Type: application/json'                               # {"id":2,...}
docker exec challenge-redis redis-cli -n 1 keys 'users:*'            # vacío (invalidado)
curl -s http://localhost:3000/users | grep -c evidence-1788504200    # 1 → visible < 60 s con caché caliente
curl -s -X DELETE http://localhost:3000/users/2                      # HTTP 200
```

Además `GET /users/1` generó la clave `user:1` en db 1. Tras POST/DELETE de usuario no quedan ítems obsoletos (mismo patrón que spec 002).

## T20 — Gate limpio

```sh
pnpm run lint   # ✖ 1 problem (0 errors, 1 warning) — preexistente en src/main.ts:10 (floating promise)
pnpm test       # Test Suites: 1 passed, 1 total / Tests: 1 passed, 1 total
pnpm run build  # OK
docker logs challenge-api --tail 1   # Nest application successfully started (09/04/2026, 7:18:06 AM)
```

## Restricción — sin lockfile ni compose duplicado

```sh
ls package-lock.json docker-compose.yml
# ls: cannot access 'package-lock.json': No such file or directory
# ls: cannot access 'docker-compose.yml': No such file or directory
```

Un solo `compose.yaml` y un solo lockfile válido (`pnpm-lock.yaml`, construido con pnpm 9).

## Corrección aplicada (root cause)

- Adapter Keyv-compatible en `src/app.module.ts` sobre `redisStore` de `cache-manager-ioredis-yet` (el store no era Keyv-compatible directo: `get/set/delete` mal tipadas → fallback silencioso a memoria). Callbacks con tipado explícito (`key: string | string[]`, etc.) para 0 warnings de lint.
- Build corregido con `pnpm-workspace.yaml` vacío (Docker + pnpm 9).

## E2E — salida limpia sin `forceExit`

Root cause confirmada: al usar solo `.overrideProvider(CACHE_MANAGER)`, NestJS seguía instanciando el provider dinámico `CACHE_MODULE_OPTIONS` de `CacheModule.registerAsync` en `src/app.module.ts`. Esa factory crea el store de Redis y queda un cliente abierto aunque el token de cache manager se reemplace.

Corrección mínima aplicada en los specs e2e reales (`test/app.e2e-spec.ts` y `test/orders.e2e-spec.ts`): sobreescribir ambos tokens para que la factory de Redis no se ejecute:

```ts
.overrideProvider(CACHE_MANAGER)
.useValue(createInMemoryCache())
.overrideProvider(CACHE_MODULE_OPTIONS)
.useValue({ ttl: 60000 })
```

El helper en `test/in-memory-cache.ts` usa un mapa local con `get`, `set`, `del` y `clear`.

Validación limpia (sin Redis externo):

```sh
pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false timeout -k 10 60 pnpm exec jest --config ./test/jest-e2e.json --testPathPattern=app
# exit=0
# PASS test/app.e2e-spec.ts
# Tests: 1 passed, 1 total

pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false timeout -k 10 90 pnpm exec jest --config ./test/jest-e2e.json --testPathPattern="app|orders"
# exit=0
# Test Suites: 2 passed, 2 total
# Tests: 5 passed, 5 total

pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false timeout -k 10 90 pnpm exec tsc --noEmit --incremental false -p tsconfig.json
# exit=0

pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false timeout -k 10 90 pnpm exec eslint "{src,apps,libs,test}/**/*.ts"
# exit=0
```

Notas:

- `test/jest-e2e.json` no usa `forceExit`.
- El spec temporal `test/diag-open-handles.e2e-spec.ts` se eliminó tras confirmar que el socket de Redis ya no aparece.
