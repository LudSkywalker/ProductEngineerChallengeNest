# Plan 001 — Causas raíz y enfoque técnico

## Evidencia (causa raíz → síntoma)
| # | Causa raíz | Evidencia | Síntoma |
|---|-----------|-----------|---------|
| R1 | `create()` guarda pedido PENDING e ítems sin transacción; si stock/validación falla queda huérfano con `total=0` | `src/orders/orders.service.ts:63-96` | Datos inconsistentes/faltantes |
| R2 | `updateStock` llamado **sin await** → promise flotante, race en concurrencia; condición `stock < qty` no atómica | `src/orders/orders.service.ts:89`, método ~líneas 100-130 | Stock inconsistente/negativo |
| R3 | `getOrderWithFullDetails` crea referencia circular (`order.user.latestOrder = order`) y luego `JSON.parse(JSON.stringify(...))` → throw "Converting circular structure to JSON" | `src/orders/orders.service.ts:152-156` | Errores intermitentes 500 en `/orders/:id/full` |
| R4 | `maxRetries = 1000` con sleep ~100ms entre reintentos de pago → colgón de ~3+ min si el proveedor cae | `src/orders/orders.service.ts:26` (usado en pago) | Lento / nunca completa |

## Decisiones
- **R1**: Envolver persistencia (pedido + ítems + stock) en transacción del DataSource; ante cualquier fallo (producto inexistente, stock insuficiente) rollback completo. El pago vive en `POST /orders/:id/pay` (ver T5): 3 reintentos y 503 al agotar. Alternativa descartada: borrar huérfanos a posteriori (parche, no causa raíz).
- **R2**: Decremento condicional atómico vía `UPDATE ... WHERE stock >= qty` (`queryRunner.query` o `createQueryBuilder().update()`), verificando `affected === 1`. Alternativa `increment()` con verificación previa: aún con race.
- **R3**: Eliminar la referencia circular y la serialización JSON round-trip; mapear a DTO plano (pedido + usuario sin re-adyacentes). Alternativa `circular-json` lib: agrega dependencia (prohibido por Constitución II salvo que el contrato exija — no exigiéndolo).
- **R4**: Bajar reintentos a 3 con backoff fijo corto; al agotarse lanzar `ServiceUnavailableException` (503). El pago simulado falla 10% (`paymentService`), con 3 reintentos P(fallo total) ≈ 0.001 — acceptable y documentado aquí.

## Riesgos
- La transacción cambia el momento en que se valida stock: validar stock DENTRO de la transacción para mantener atomicidad.
- El e2e actual (`test/app.e2e-spec.ts`) solo prueba `GET /` — no cubre estos flujos; no se agregan tests nuevos (scope), se verifica con curl (Constitución IV, criterio de aceptación del spec).
