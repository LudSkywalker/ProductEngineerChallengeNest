# Spec 001 — Confiableza e integridad del flujo de pedidos

## Objetivo (qué y por qué)
El endpoint de creación/pago de pedidos deja datos inconsistentes, falla con errores intermitentes y puede colgarse. Debe:
1. Crear el pedido + ítems de forma atómica: o todo persiste, o nada (sin pedidos PENDING huérfanos con `total=0`).
2. Descontar stock de forma segura ante concurrencia (sin condiciones de carrera ni stock negativo).
3. `GET /orders/:id/full` responder 200 siempre que el pedido existe (sin error de serialización circular).
4. El pago fallido debe fallar rápido con estado HTTP explícito, no colgar la request ~3+ minutos.

## Restricciones
- Sin nuevos endpoints ni cambios de esquema de DB.
- Mantener estados `PENDING/PAID` y el campo `total` como están.

## Criterios de aceptación
- [x] `POST /orders` con pago fallido → no queda pedido huérfano (postcondición DB: 0 huérfanos; evidencia en `evidence.md`).
- [x] 10 requests concurrentes comprando la última unidad → exactamente 1 éxito; stock nunca < 0 (verificado live + `neg_stock=0` en DB).
- [x] `GET /orders/:id/full` → 200 con JSON válido tras crear+pagar un pedido (live: HTTP 200, DTO plano).
- [x] Pago fallido responde en < 2s con 503 (path verificado: `maxRetries=3`, backoff 100 ms, `ServiceUnavailableException`; el mock falla al azar 10 %).
