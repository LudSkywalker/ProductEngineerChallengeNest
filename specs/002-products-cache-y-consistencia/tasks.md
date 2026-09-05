# Tasks 002

- [x] T8: Reproducir en vivo contra Redis db 1: claves `product-search:alpha`/`:beta` separadas sin veneno; ciclo de categorías → HTTP 200 < 1 s — `evidence.md`
- [x] T9: Key de caché por query normalizada (`products.service.ts:53`)
- [x] T10: Invalidación de search keys en `create()`/`delete()` del producto
- [x] T11: `buildCategoryTree`: guard de profundidad + `visited` set (ciclo → warn log, sin throw) (`products.service.ts:94-110`)
- [x] T12: Batch: conteo real por ítem y `success = failed === 0` (`products.service.ts:112-131`)
- [x] T13: Verificar criterios de aceptación del spec: invalidación live en db 1 tras POST/DELETE producto; batch `{"success":false,"processed":2,"failed":1}` — `evidence.md`
- [x] T14: `pnpm test` y `pnpm run lint` en verde
