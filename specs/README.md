# Seguimiento SDD — product-engineer-challenge

Estructura por [spec-kit](https://github.com/github/spec-kit): cada carpeta de spec sigue el flujo specify → plan → tasks → implement.

| Spec | Scope | Estado |
|------|-------|--------|
| [001-orders-integridad-y-confiabilidad](001-orders-integridad-y-confiabilidad/) | Transacción en `create()`, stock atómico, JSON circular, reintentos de pago | ✅ completo (T1–T7, verificación live 2026-09-04) · [evidence](001-orders-integridad-y-confiabilidad/evidence.md) |
| [002-products-cache-y-consistencia](002-products-cache-y-consistencia/) | Key de caché por query, invalidación, árbol de categorías cíclico, batch honesto | ✅ completo (T8–T14, verificación live en Redis db 1, 2026-09-04) · [evidence](002-products-cache-y-consistencia/evidence.md) |
| [003-ambiente-y-configuracion](003-ambiente-y-configuracion/) | `REDIS_DB`, compose único + persistencia, caché de usuarios | ✅ completo (T15–T20, verificación live 2026-09-04) · [evidence](003-ambiente-y-configuracion/evidence.md) |

Reglas: ver `.specify/memory/constitution.md`. Evidencia de reproducción se registra en `evidence.md` dentro de cada spec.
