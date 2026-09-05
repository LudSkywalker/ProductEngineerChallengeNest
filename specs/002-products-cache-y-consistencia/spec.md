# Spec 002 — Cache y consistencia de productos

## Objetivo (qué y por qué)
La búsqueda de productos devuelve resultados de otra consulta durante 60s y operaciones de catálogo se reportan exitosas cuando no lo son. Debe:
1. `GET /products/search?q=...` servir caché **por query**: cada término busca sus propios resultados.
2. Crear/eliminar un producto invalida o refresca la caché de búsqueda asociada.
3. `GET /categories` responder en tiempo acotado incluso si el árbol tiene ciclos.
4. `POST /products/batch` reportar honestamente cuántos ítems fallaron y por qué.

## Restricciones
- Mantener TTL de 60s del cache manager; no agregar caché L2 ni nuevas libs.
- Sin cambios de contrato salvo el conteo real en batch (mismo shape, valores correctos).

## Criterios de aceptación
- [x] `?q=A` luego `?q=B` → claves `product-search:alpha` y `:beta` separadas en Redis db 1 (sin veneno).
- [x] `POST /products` invalida las claves cacheadas; la siguiente búsqueda lee de DB (verificado live en db 1).
- [x] Árbol de categorías con ciclo sembrado → `GET /categories/1/tree` HTTP 200 en < 1 s, payload acotado.
- [x] Batch mixto (`[1,2,999]`) → `{"success":false,"processed":2,"failed":1}` con error por ítem, nunca `success: true`.
