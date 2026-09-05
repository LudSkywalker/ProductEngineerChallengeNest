# Evidencia — Spec 002 (Cache y consistencia de productos)

Sesión live: 2026-09-04, **contra Redis real** (db 1). Antes de la corrección del adapter en `src/app.module.ts`, el cache manager caía en memoria; estas comprobaciones son post-corrección.

## T8 — Sin veneno entre queries (caché por query)

```sh
curl -s 'http://localhost:3000/products/search?q=alpha'   # genera product-search:alpha
curl -s 'http://localhost:3000/products/search?q=beta'    # genera product-search:beta
docker exec challenge-redis redis-cli -n 1 keys 'product-search:*'
docker exec challenge-redis redis-cli -n 1 ttl product-search:alpha
```

Resultado: las claves `product-search:alpha` y `product-search:beta` coexisten en db 1, cada una con TTL `60` (60000 ms). Una query no sirve el resultado de otra. Nota: la ruta caché es `GET /products/search?q=...`; `GET /products?search=` es la lista completa sin caché por diseño (controller existente).

## T8 — Árbol de categorías con ciclo sembrado

Datos existentes ya contenían enlaces cíclicos (`CycleA/CycleB/CycleC`); se reforzó el ciclo a mano:

```sh
docker exec challenge-db psql -U postgres -d challengedb \
 -c "UPDATE categories SET parent_id = 2 WHERE id = 1; UPDATE categories SET parent_id = 1 WHERE id = 2;"
curl -s http://localhost:3000/categories/1/tree -w "\nHTTP %{http_code}\n"
# limpieza
docker exec challenge-db psql ... "UPDATE categories SET parent_id = NULL WHERE id IN (1,2);"
```

Resultado: `HTTP 200` en < 1 s, payload acotado (124 bytes), sin stack overflow ni hang:

```json
{"id":1,"name":"CycleA","children":[{"id":3,"name":"CycleC","children":[]}],"parent":{"id":2,"name":"CycleB","children":[]}}
```

Guard de `visited` en el traversal: src/products/products.service.ts (~línea 150-165). Ruta real del árbol: `GET /categories/:id/tree`.

## T13 — Invalidation on create/delete (Redis db 1)

```sh
# semilla
docker exec challenge-redis redis-cli -n 1 set product-search:alpha "[]" pttl 60000
curl -s -X POST http://localhost:3000/products -H 'Content-Type: application/json' \
 -d '{"name":"Gamma Test","price":9.99,"stock":3}'      # → {"id":5,...}
docker exec challenge-redis redis-cli -n 1 scan 0 match 'product-search:*' count 100   # vacío (invalidado)
curl -s -X DELETE http://localhost:3000/products/5 -w "HTTP %{http_code}\n"            # HTTP 200
docker exec challenge-redis redis-cli -n 1 scan 0 match 'product-search:*' count 100   # vacío
```

Resultado: la creación borra todas las claves `product-search:*` (set de tracking estático) y la siguiente búsqueda re-llee desde DB; el DELETE deja db 1 sin claves de búsqueda. Detalle: `price` debe ser número (DTO con `@IsNumber`/`@Min(0)`); enviar string devuelve 400 de validación, no 500.

## T12 — Batch honesto

```sh
curl -s -X POST http://localhost:3000/products/batch -H 'Content-Type: application/json' \
 -d '{"productIds":[1,2,999]}'
```

Resultado (shape del endpoint existente `{productIds: number[]}`):

```json
{"success":false,"processed":2,"failed":1,"errors":[{"id":999,"error":"Product #999 not found"}]}
```

Conteo real de éxitos/fallos con error por ítem; nunca `success: true` global con fallos. Implementación: src/products/products.service.ts:168-196.

## Gate

`pnpm run lint` 0 errores; `pnpm test` 1/1; build y arranque limpios (2026-09-04, 7:18 AM).
