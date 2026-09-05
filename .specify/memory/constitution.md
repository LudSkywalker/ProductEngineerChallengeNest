# Constitución del Proyecto (SDD)

Principios rectores derivados de `INSTRUCTIONS.md`. Rigen todos los specs/plan/tasks.

## I. Causas raíz, no parches
Cada cambio debe resolver una causa raíz documentada en el spec correspondiente. Prohibido enmascarar síntomas (excepciones silenciadas, timeouts inflados sin justificación).

## II. Sin features nuevas ni rediseño
El scope está acotado a corregir el comportamiento existente. No se agregan endpoints, dependencias o arquitecturas nuevas. Los cambios de contrato de API solo si un síntoma lo exige, documentado en el spec.

## III. Evidencia antes que suposición
Ningún bug entra a plan.md sin evidencia reproducible (curl, log, o traza de código con `archivo:linea`). Toda causa raíz debe citar la línea exacta del código.

## IV. Verificación obligatoria
Toda task se considera completa solo cuando: (1) el síntoma original deja de reproducirse, (2) `pnpm test` pasa, (3) `pnpm run lint` pasa.

## V. Mínimo impacto
Preferir cambios locales y reversibles. Toda decisión con trade-off se registra en plan.md sección "Decisiones".
