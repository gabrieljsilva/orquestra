# Known issues — vistoria do motor

Itens encontrados na vistoria de 2026-04-27 e ainda não corrigidos.

Cada item tem: arquivo:linha, sintoma, fix proposto.

---

## MÉDIOS — pendentes

(nenhum)

---

## Resolvidos nesta vistoria

Todos os críticos (#1–#9) e altos A1–A8 foram resolvidos. Médios M1–M9
também. **A9 fechado como não-bug** — `Object.freeze` shallow é contrato
intencional (mesmo padrão de Vitest/Jest), documentado em código.

**M8 fechado**: `node:test` removido do worker. Cenários passam a rodar via
runner próprio (`scenario-runner.ts`) com `withTimeout` reusado de
`@orquestra/core`. Worker ganhou também memory checkpoint opcional
(`workerMemoryLimitMb`) com respawn graceful pelo `WorkerManager`. Hook
timeout dividido em `eachHookTimeoutMs` (10s) e `serverHookTimeoutMs` (60s).
