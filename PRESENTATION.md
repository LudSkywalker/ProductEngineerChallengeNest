# Product Engineer Challenge — Implementation Summary

## 1. Scope and Final Status

This work repaired reliability, consistency, and configuration issues in the existing NestJS microservice. No new product features were added.

- All SDD tasks are complete: **T1–T20**
- Live verification date: **2026-09-04**
- Final validation is green:
  - ESLint on `src/` and `test/`: **passed**
  - `pnpm run build`: **success**
  - Unit tests: **1 suite / 1 test passed**
  - E2E tests: **2 suites / 5 tests passed**
- Changes are currently present in the working tree and are **uncommitted**.

---

## 2. Workstream 001 — Orders Integrity and Reliability

### Problems addressed
- Order creation was not atomic, risking partial persistence.
- Product stock was decremented with a read-then-write pattern, causing race conditions under concurrency.
- `GET /orders/:id/full` could fail because eager relations produced circular object references.
- Failed payment retries used an unbounded/retry-heavy strategy, causing slow requests.

### Changes implemented
- `POST /orders` now creates the order, items, and stock updates inside a single TypeORM transaction.
- Stock is decremented atomically with:

```sql
UPDATE products
SET stock = stock - :qty
WHERE id = :id AND stock >= :qty
```

- If the affected row count is not `1`, the request fails with a clear insufficient-stock error and the transaction rolls back.
- `GET /orders/:id/full` now returns a flat, serializable response object instead of exposing circular entity references.
- Payment retries were bounded:
  - `maxRetries = 3`
  - 100 ms backoff between attempts
  - final failure returns an explicit HTTP **503** through `ServiceUnavailableException`

### Verified behavior
- Concurrent purchases of the last available unit leave stock consistent and never negative.
- Database postcondition checks reported:
  - `orphan_orders = 0`
  - `orphan_items = 0`
  - `neg_stock = 0`
- `GET /orders/:id/full` returns HTTP **200** with valid JSON.
- Payment failure no longer hangs for minutes; worst-case retry path is well under 2 seconds before returning **503**.

---

## 3. Workstream 002 — Products Cache and Consistency

### Problems addressed
- Product search used a single cache key, so one query could serve stale results for another query.
- Product create/delete operations did not invalidate search cache entries.
- Category tree traversal could loop indefinitely if category data contained cycles.
- Batch product processing reported success even when individual items failed.

### Changes implemented
- Search cache keys are now normalized per query:

```ts
product-search:${query.toLowerCase()}
```

- ProductsService tracks active search cache keys and invalidates them on product create and delete.
- Category tree building now uses:
  - a visited set to prevent cycles
  - a maximum depth guard of `100`
  - safe handling when a parent reference is missing
- Batch processing now returns an honest result:

```json
{
  "success": false,
  "processed": 2,
  "failed": 1,
  "errors": [
    {
      "id": 999,
      "error": "Product #999 not found"
    }
  ]
}
```

### Verified behavior
- `?q=alpha` and `?q=beta` create separate cache keys in Redis db **1**.
- Product creation invalidates cached search results.
- A seeded cyclic category tree still returns HTTP **200** quickly, with a bounded payload.
- Batch `[1, 2, 999]` correctly reports `processed: 2`, `failed: 1`, and `success: false`.

---

## 4. Workstream 003 — Environment and Configuration Consistency

### Problems addressed
- The Redis cache did not respect the configured `REDIS_DB` environment variable.
- Local stack behavior was inconsistent across compose files and persistence settings.
- User cache entries could become stale after create/delete operations.
- E2E tests could leave open Redis handles because the real cache module options factory still ran.

### Changes implemented
- The Redis cache now reads:

```ts
parseInt(process.env.REDIS_DB || '0', 10)
```

- A Keyv-compatible adapter wraps the Redis store so the cache manager uses the configured Redis database correctly.
- User caching follows the same create/delete invalidation pattern used for products:
  - `users:all`
  - `user:{id}`
- E2E tests now override both cache tokens:

```ts
.overrideProvider(CACHE_MANAGER)
.useValue(createInMemoryCache())
.overrideProvider(CACHE_MODULE_OPTIONS)
.useValue({ ttl: 60000 })
```

This prevents the real Redis-backed factory from running during isolated e2e execution.

### Verified behavior
- Application cache keys appear in Redis db **1**, not db **0**.
- Postgres and Redis data persist across `docker compose down && docker compose up -d`.
- User create/delete invalidates stale user cache entries.
- E2E tests exit cleanly without using `forceExit`.

---

## 5. Testing Infrastructure

The test setup was strengthened to make the e2e suite reliable and self-contained.

### New test support files
- `test/e2e.env.setup.ts`
  - Loads e2e environment defaults before Jest starts.
- `test/ensure-test-db.ts`
  - Ensures the dedicated test database exists before running e2e specs.
- `test/in-memory-cache.ts`
  - Provides an in-memory cache implementation for isolated e2e tests.

### E2E configuration changes
`test/jest-e2e.json` now includes:

```json
{
  "testTimeout": 30000,
  "setupFiles": ["<rootDir>/e2e.env.setup.ts"],
  "maxWorkers": 1
}
```

The e2e configuration does **not** use `forceExit`.

### Fresh validation results
The following were re-validated in the current working tree:

```sh
pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false pnpm exec eslint "{src,test}/**/*.ts"
```

Result: **passed**

```sh
pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false pnpm run build
```

Result: **success**

```sh
pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false pnpm test
```

Result:

```text
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

```sh
pnpm_config_strict_dep_builds=false npm_config_strict_dep_builds=false pnpm exec jest --config ./test/jest-e2e.json --runInBand
```

Result:

```text
Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

---

## 6. Docker Compose Note

`compose.yaml` was extended to provide a single local development stack for convenience: PostgreSQL, Redis, and the API service, with persistent volumes and health-based startup ordering. It is a local development aid and does not change product behavior.

---

## 7. Changed Files

### Modified tracked files
- `compose.yaml`
- `src/app.module.ts`
- `src/main.ts`
- `src/orders/order-item.entity.ts`
- `src/orders/order.entity.ts`
- `src/orders/orders.controller.ts`
- `src/orders/orders.service.ts`
- `src/products/category.entity.ts`
- `src/products/dto/create-product.dto.ts`
- `src/products/product.entity.ts`
- `src/products/products.controller.ts`
- `src/products/products.module.ts`
- `src/products/products.service.ts`
- `src/users/user.entity.ts`
- `src/users/users.controller.ts`
- `src/users/users.service.ts`
- `test/app.e2e-spec.ts`
- `test/jest-e2e.json`

Git reports:

```text
18 files changed, 391 insertions(+), 116 deletions(-)
```

### New untracked additions
- `Dockerfile.dev`
- `pnpm-workspace.yaml`
- `test/e2e.env.setup.ts`
- `test/ensure-test-db.ts`
- `test/in-memory-cache.ts`
- `test/orders.e2e-spec.ts`
- `specs/`
- `.specify/`

No new runtime dependencies were added to `package.json`.
