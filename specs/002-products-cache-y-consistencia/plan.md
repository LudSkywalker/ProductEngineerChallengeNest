# Plan 002 — Causas raíz y enfoque técnico

## Evidencia (causa raíz → síntoma)
| # | Causa raíz | Evidencia | Síntoma |
|---|-----------|-----------|---------|
| R5 | Key de caché **constante** `'product-search'` para todas las queries + `setCache` tras cada búsqueda | `src/products/products.service.ts:53` | Resultado de query anterior durante 60s (veneno) |
| R6 | Sin invalidación en `create()`/`delete()` del producto | `src/products/products.service.ts` (create/delete sin store ops) | Catálogo viejo tras mutaciones |
| R7 | `buildCategoryTree` recursión sin límite ni detección de ciclo | `src/products/products.service.ts:94-110` | Stack overflow / colgón con datos cíclicos |
| R8 | Batch traga el error por ítem y siempre devuelve `success: true` | `src/products/products.service.ts:122-124` (línea 112-131) | "Operación exitosa" con datos faltantes |

## Decisiones
- **R5**: Key parametrizada por query normalizada (`product-search:${q.toLowerCase()}`). Mantiene la semánta del cache manager; costo O(queries distintas), acceptable para scope.
- **R6**: Invalidación quirúrgica: en `create()` y `delete()`, iterar keys del patrón `product-search:*` (o `delete` de todas las search keys) vía el mismo ioredis store (TTL 60s hace la invalidación best-effort acceptable; documentado). Alternativa descarta: TTL de 0 (rompe el comportamiento cacheado que el reto espera mantener).
- **R7**: Guard de profundidad (p.ej. 100) + set de `visited` IDs en la recursión; ciclo → se corta y se loguea warn. No se purgan datos: no es nuestra responsabilidad (scope).
- **R8**: Acumular `{id, ok, error}` por ítem; el campo global `success` pasa a ser `failed === 0`. Shape conservado, valores correctos.

## Riesgos
- Iterar keys `product-search:*` usa `KEYS` (bloqueante en Redis): para un dev-scope con pocas keys es acceptable; se loguea como trade-off. Alternativa `SCAN` si la verificación lo exige.
