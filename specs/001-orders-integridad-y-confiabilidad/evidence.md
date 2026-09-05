# Evidencia — Spec 001 (Pedidos: integridad y confiabilidad)

Sesión live: 2026-09-04. Stack: `docker compose up -d` (challenge-api, challenge-db, challenge-redis), DB `challengedb`.

## T1/T2 — Atomicidad: sin pedidos huérfanos ni stock negativo (postcondición determinística)

El mock de pago falla aleatoriamente (`Math.random() < 0.1`, src/orders/orders.service.ts:26), así que el fallo no es disparable de forma determinística por HTTP. Se verificó la postcondición en DB:

```sh
docker exec challenge-db psql -U postgres -d challengedb -tAc \
 "SELECT 'orphan_orders', count(*) FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE u.id IS NULL
  UNION ALL SELECT 'orphan_items', count(*) FROM order_items oi LEFT JOIN orders o ON o.id=oi.order_id WHERE o.id IS NULL
  UNION ALL SELECT 'neg_stock', count(*) FROM products WHERE stock < 0
  UNION ALL SELECT 'orders_total', count(*) FROM orders;"
```

Resultado:

```
orphan_orders|0
orphan_items|0
neg_stock|0
orders_total|3
```

- Cero pedidos sin usuario, cero ítems sin pedido, cero stock negativo.
- La creación es transaccional (rollback de ítems si el pago falla; retry hasta `maxRetries=3` con backoff; luego `ServiceUnavailableException` → 503 explícito, no timeout): src/orders/orders.service.ts:26-70.
- Repro live previo (sesión anterior) de 10 requests concurrentes por la última unidad dejó el estado consistente verificado arriba.

## T4 — Pago fallido responde rápido con estado explícito

- `maxRetries = 3` y delay de 100 ms por intento del mock → peor caso < 2 s antes del 503 (`ServiceUnavailableException`), no hang de ~3 min: src/orders/orders.service.ts:38.
- Verificado en el código del path de reintento; el trigger es aleatorio (10 %) por diseño del mock existente (sin cambios permitidos al provider).

## T6 — `GET /orders/:id/full` sin serialización circular

```sh
curl -s http://localhost:3000/orders/1/full -w "\nHTTP %{http_code}\n"
```

Resultado (HTTP 200, JSON plano válido):

```json
{"id":1,"status":"confirmed","total":"10.00","createdAt":"2026-09-04T05:50:14.814Z","user":{"id":1,"name":"Live Tester","email":"live1788501014703@test.io"},"items":[{"id":1,"quantity":1,"price":"10.00","product":{"id":1,"name":"Atomic Widget"}}]}
```

- DTO plano sin referencias circulares (ver plan.md): src/orders/dto/order-full-response.dto.ts.

## Gate

`pnpm run lint` → 0 errores (1 warning preexistente en main.ts); `pnpm test` → 1/1 suites y tests pasando. Build OK; app started cleanly (docker logs).
