# Tasks 001

- [x] T1: Reproducir síntomas en ambiente levantado (curl): pedido huérfano tras pago fallido, race de stock, 500 en `/orders/:id/full`, latencia de pago → registrado en `evidence.md` (postcondición DB: 0 huérfanos, 0 stock negativo; el fallo de pago es mock aleatorio 10 %, verificado por path de código)
- [x] T2: `create()`: transacción del DataSource alrededor de pedido + ítems + stock; rollback ante cualquier fallo (producto inexistente, stock insuficiente) (`orders.service.ts:63-96`). Nota: el pago es un endpoint aparte (`POST /orders/:id/pay`); su 503 al agotar reintentos queda cubierto en T5.
- [x] T3: Decremento de stock atómico `UPDATE ... WHERE stock >= qty` dentro de la misma transacción; reemplaza `updateStock` flotante (`orders.service.ts:89`)
- [x] T4: `getOrderWithFullDetails`: quitar referencia circular y round-trip JSON; devolver DTO plano sin adyacencias recursivas (`orders.service.ts:142-157`)
- [x] T5: Reintentos de pago → 3 con backoff corto + `ServiceUnavailableException` al agotar (`orders.service.ts:26`)
- [x] T6: Verificar criterios de aceptación del spec (curl concurrente, `/full` → HTTP 200 DTO plano live, latencia < 2 s por reintentos acotados) — `evidence.md`
- [x] T7: `pnpm test` y `pnpm run lint` en verde
