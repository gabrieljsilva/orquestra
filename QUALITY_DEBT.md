# Quality debt — vistoria 2026-04-28

Achados de qualidade arquitetural e DX que separam o orquestra do nível Vitest.
Nenhum é bloqueante; cada um é fricção crônica que cresce com a base de código.

Origem: 5 reviews paralelos (Arquitetura+Tipos, Runtime+Lifecycle, BDD+Reports,
Config+Loaders, DX+API).

Prioridades: **P1** = alto ROI / baixo escopo, **P2** = ROI alto / escopo médio,
**P3** = polimento de longo prazo.

---

## Top 5 — atacar primeiro

- [ ] **P1 — Limpar fronteira `types/` ↔ `internal/`**
  `types/ioc/ioc.types.ts:1-14`, `types/components/components.types.ts:1-2`
  `types/` importa de `internal/`. Força casts (`as IocContainer`) em todo
  callsite no Bootstrap.
  *Fix:* `Injectable`/`OrquestraContainer`/`OrquestraService` viram interfaces
  estruturais em `types/`; classes concretas vivem só em `internal/`.

- [ ] **P1 — Consolidar vocabulário de lifecycle**
  `internal/orquestra-container/orquestra-container.ts:4-33`
  3 pares para um conceito: `up/down`, `start/stop`, `onStart/onTeardown`.
  User implementa `up()`, motor chama `start()`, IoC inspeciona `onStart`.
  *Fix:* eleger um par canônico (sugiro `onStart/onTeardown` — já existe em
  `Injectable`); deletar os outros.

- [ ] **P1 — Reduzir superfície pública de `@orquestra/core`**
  `core/src/index.ts:1-80`
  50+ exports. Vitest expõe ~10. `WorkerOrquestra`, `BddContainer`, `Step`,
  `Feature`, `Scenario`, `init/get/resetOrquestraInstance` não deveriam ser
  públicos.
  *Fix:* mover internos para `@orquestra/core/internal`; top-level só o que o
  user escreve.

- [ ] **P1 — Extrair `addStep` privado e tipar `BddRunner`**
  `internal/orquestra-bdd-container/bdd.container.ts:48-130` +
  `bdd.runner.ts:15-82`
  ~25 linhas idênticas em `given/when/then`. `runScenario` opera 100% em
  `any` — perdemos a tipagem do `Scenario<C>` exatamente onde executa.
  *Fix:* `private addStep(kind, name, fn?)` privado; tipar Scenario/Feature/Step
  no BddRunner (cuidar de import cycles).

- [ ] **P1 — State machine única de shutdown**
  `worker.ts`, `worker-manager.ts`, `parallel-runner.ts`
  3 booleans paralelos (`shutdownRequested`, `shuttingDown`, `teardownInProgress`)
  com semânticas próximas mas não idênticas. As races dos críticos foram
  sintoma disso.
  *Fix:* state machine explícita por nível (`idle | running | draining | exiting`),
  sincronizada via IPC.

---

## Arquitetura & Tipos

- [ ] **P1** `internal/orquestra-service/orquestra-service.ts:3` — `OrquestraService`
  é classe vazia herdando de `Injectable`. Camada decorativa.
  *Fix:* deletar e usar `Injectable` direto, ou tornar `OrquestraService` o
  nome canônico e remover `Injectable` da API pública.

- [ ] **P1** `internal/orquestra-context/orquestra-context.ts:3` — `OrquestraContext`
  só carrega `container`. Indireção sem propósito.
  *Fix:* ou contexto recebe responsabilidades reais (logger, env, runId), ou
  passa `IIocContainer` direto.

- [ ] **P1** `internal/bootstrap/bootstrap.ts:92,114,229,300,395` — `as any` /
  `resolve<any>` no fluxo de containers; `containerTokens: unknown[]` força o
  cast em todo callsite.
  *Fix:* tipar `containerTokens` como `ProviderToken[]` e dar overload de
  `resolve` para containers.

- [ ] **P2** `types/components/components.types.ts:7-15` — `ContainerProvider`
  aceita 4 formatos; `bootstrap.ts:369-382` precisa de 2 helpers com if/else
  aninhado.
  *Fix:* normalizar em forma canônica `{ provide, useClass|useFactory, dependsOn? }`
  + açúcar `withDependencies(provider, deps)`.

- [ ] **P2** `internal/bootstrap/bootstrap.ts:209-332` — 120 linhas de algoritmo
  de grafo (Kahn-like + DFS) dentro do Bootstrap.
  *Fix:* extrair `ContainerGraph` (build, assertNoCycles, topoStart, topoStop).

- [ ] **P2** `internal/bootstrap/bootstrap.ts:166-180` — Bootstrap virou
  god-object com 4 getters consultáveis depois do `resolve()`.
  *Fix:* `BootstrapResult` imutável retornado de `resolve()`/`boot()`.

- [ ] **P2** `internal/ioc-container/injectable.ts:10` — `Injectable` instancia
  `Logger` no construtor com `level: "info"` hardcoded. Acopla todo serviço
  do user e ignora config global.
  *Fix:* injetar via `ctx`; não fazer `new Logger` no base.

- [ ] **P2** `types/ioc/ioc.types.ts:17` — `ProviderToken = string | Function | Symbol`.
  `Function` amplo demais; `Symbol` (capitalizado) é o wrapper, não o primitivo.
  *Fix:* `string | symbol | ClassConstructor<any>`.

- [ ] **P3** `core/src/index.ts:36-80` — barril único exporta 40+ tipos
  misturando contratos públicos e detalhes de motor (`HookFailure`, `StepEvent`).
  *Fix:* separar entrypoints: `orquestra` (user) e `orquestra/reporter` (consumido
  por reporters/adapters).

- [ ] **P3** `internal/bootstrap/bootstrap.ts:15-19` x
  `types/orquestra/worker-orquestra-options.types.ts:7` — `BootstrapResolveInput`
  e `WorkerOrquestraOptions` são quase idênticos.
  *Fix:* unificar via extensão.

---

## Runtime & Lifecycle

- [ ] **P1** `worker.ts:170-182` — race: 2º `feature:assign` durante
  `processingPromise` em curso sobrescreve sem aguardar.
  *Fix:* rejeitar/enfileirar quando há `processingPromise`; mensagem fora de
  protocolo deve gerar erro IPC.

- [ ] **P2** `worker-manager.ts:70-100` — `requestShutdown` ainda usa polling
  de 100ms. Sem `unref` no timer (mantém event loop vivo se caller desistir).
  *Fix:* contar exits via `aliveCount` no handler; setTimeout único só pro
  SIGKILL fallback, com `unref`.

- [ ] **P1** `worker.ts:176-178` — `feature:done` + `ready` redundantes.
  Manager confunde "terminei feature" com "pronto pra próxima".
  *Fix:* `feature:done` já implica readiness; remover `ready` repetido.

- [ ] **P2** `worker-manager.ts:201-211` — `featureTimer` faz SIGKILL direto
  no timeout, sem dar chance de teardown. Vaza recursos.
  *Fix:* SIGTERM (drain) com janela de N segundos, escalar para SIGKILL.

- [ ] **P2** `worker.ts:61-148` — `processFeature` é escada de 90 linhas com
  6 níveis. Padrão "rodar fase, capturar primeira falha, decidir continuar"
  repetido 5×.
  *Fix:* pipeline declarativo (array de fases com `continueOnFailure` policy).

- [ ] **P2** `ipc-protocol.ts:1-12` — sem versionamento, sem requestId, sem
  default no switch (mensagem desconhecida some silenciosa).
  *Fix:* `protocolVersion` no handshake `ready`; whitelist + log no default.

- [ ] **P2** `worker.ts:184-190` + `parallel-runner.ts:90-94` — handlers de
  sinal sem cleanup; `setMaxListeners` não definido.
  *Fix:* armazenar handlers e fazer `process.off` no `drainAndExit`.

- [ ] **P2** `worker.ts:135` + `parallel-runner.ts:80,85` — `console.error`
  cru pra logging. `silence-node-test` filtra stdout mas stderr passa cru.
  *Fix:* usar o `Logger` (já existe em `WorkerOrquestra`).

- [ ] **P3** `worker.ts:18-35` — `snapshotEnv`/`restoreEnv` é best-effort.
  Plugin que muta env em `afterStartServer` não é revertido entre features.
  *Fix:* documentar contrato; ou rodar em vm/worker_thread isolado.

- [ ] **P3** `worker-orquestra.ts:108` — `assertHookCanRegister` usa
  `kind as WorkerPhase`. `HookKind` inclui `beforeEachFeature`/`Scenario` que
  não estão em `PHASE_ORDER` — `indexOf` retorna -1, guard passa por coincidência.
  *Fix:* mapeamento explícito `HookKind → WorkerPhase | null`.

- [ ] **P3** `silence-node-test.ts:36-47` — muta `process.stdout.write`
  globalmente sem TTY check; `uninstall*` nunca é chamada.
  *Fix:* respeitar `NO_COLOR`/`TTY`; chamar uninstall em `drainAndExit`.

- [ ] **P3** `worker-manager.ts:148-152` — `fork` herda `process.env` inteiro,
  sem allowlist.
  *Fix:* whitelist mínima (PATH, NODE_*, ORQUESTRA_*) + merge controlado.

---

## BDD & Reports

- [ ] **P1** `bdd.container.ts:147,213-220` — `AsyncLocalStorage` no `Feature`
  é overkill. `als` só serializa acesso a `this.registry`. Não há concorrência
  efetiva.
  *Fix:* remover `als`/`withRegistry`; `getRegistry()` retorna `this.registry`.

- [ ] **P2** `bdd.container.ts:18-36` — `Step.fn?` opcional codifica "pending"
  implícito. Modelo dúbio.
  *Fix:* `class PendingStep` separada (sentinela) ou união discriminada.

- [ ] **P2** `bdd.runner.ts:4-8` + `event.types.ts` — 2 vocabulários para o
  mesmo conceito: enum `StepKind="GIVEN"` vs evento `keyword="Given"`. `keywordOf`
  inverte circularmente.
  *Fix:* unificar — ou `StepKind` já guarda forma Gherkin canônica, ou
  `StepEvent.keyword` passa a ser `StepKind`.

- [ ] **P2** `bdd.runner.ts:45-53` — convenção mágica `delta → ctx.result`
  para primitivos. `StepFn` retorna `T extends object` mas runtime aceita
  primitivo.
  *Fix:* forçar `T extends object` ou explicitar API.

- [ ] **P2** `event.types.ts:13` — `StepEvent.error?` opcional, mas pending
  obriga error (depois do A5). Status `pending` não é erro.
  *Fix:* discriminated union por status: `success`, `failed`, `pending` com
  shapes próprios.

- [ ] **P2** `artifact.generator.ts:60-110` — `buildFeatures` faz 5 coisas em
  ~50 linhas.
  *Fix:* extrair `splitHooksByScope`, `attachFileTimings(...)`.

- [ ] **P2** `orphan-files.ts:9-57` — muta `artifact` in-place; 2 loops com
  90% da estrutura repetida.
  *Fix:* `buildOrphanFeature(file, status)` + single loop; recalcular summary
  via `buildSummary`.

- [ ] **P3** `orquestra-console-reporter.ts:30,97-104` — output bilíngue
  (PT/EN); `prefixArticle` assume inglês ("a/an") e quebra em PT-BR.
  *Fix:* exigir `as` cru ou abstrair em `formatPersona(as, locale)` plugável.

- [ ] **P3** `orquestra-console-reporter.ts:14-18` — símbolos unicode
  (`✓✗○`) sem fallback Windows/CMD.
  *Fix:* checar `isTTY` + plataforma; ASCII fallback.

- [ ] **P3** `bdd.runner.ts:11-13` — `computeStepId` SHA-1 estático sem
  consumidor real fora do próprio evento.
  *Fix:* documentar consumidor ou substituir por concat legível.

- [ ] **P3** `reporters.ts:3-7` — `reporter` (singular) e `reporters` (plural)
  coexistem sem deprecation.
  *Fix:* warn no path singular, eliminar antes da v3.

---

## Config / Loaders / Transform

- [ ] **P1** `core/helpers/version/get-package-version.ts` x
  `runner/lib/artifact/version.ts` — mesmo código duplicado palavra-por-palavra.
  *Fix:* extrair `readPackageVersion(packageName, opts)` em `@orquestra/core/helpers`.

- [ ] **P1** `core/helpers/env/env-helper.ts:12-111` — 5 responsabilidades:
  load .env de path, load default, override mutável, snapshot/restore, getter.
  `loadFromValues` escreve em `process.env` mas `loadFromPath` não — incoerência.
  `get()` usa `||` (perde string vazia válida).
  *Fix:* separar `EnvLoader` (puro) de `EnvOverrider` (snapshot+restore); usar
  `??` no getter.

- [ ] **P2** `runner/loaders/config.loader.ts:42-76` + `spec.loader.ts:37-67` —
  validação manual via `if`s; `OrquestraConfig` tem ~10 campos top-level, só 3
  validados.
  *Fix:* schema único (zod ou valibot) exportado de `@orquestra/core`,
  reutilizado entre loaders e `defineConfig`.

- [ ] **P2** `runner/lib/transform/factory.ts:17-22` — `createOrquestraJiti`
  chamado em `loadConfig` e de novo em `loadSpec`. Sem reuso de instância.
  *Fix:* aceitar `Jiti` reutilizável vinda do command, ou cache por
  `cwd+tsconfigPath`.

- [ ] **P2** `runner/lib/commands/test.command.ts:65-70` — `Number.parseInt`
  sem validação aceita `"abc"` → NaN silencioso em `concurrency`/`featureTimeout`.
  *Fix:* parser util `parseIntArg(name, raw)` que falha com mensagem clara.

- [ ] **P3** `runner/loaders/discovery.ts:31-46` — `globSync` chamado N vezes
  (uma por pattern); `--filter` mistura regex `/.../` e substring sem doc visível.
  *Fix:* passar `patterns` direto ao glob; documentar formato no `description`
  do arg.

- [ ] **P3** `runner/lib/commands/test.command.ts:74` — recalcula `configPath`
  resolvendo de novo de `process.cwd()`, mas `loadConfig` já fez.
  *Fix:* `LoadedConfig` expõe `configPath`.

- [ ] **P3** `core/internal/logger/logger.ts:53-55` — `log()` ignora
  `isLevelEnabled`, `info()` respeita. Pegada não documentada.
  *Fix:* alinhar `log` ao gate ou remover método.

- [ ] **P3** `runner/transform/swc-transform.ts:94-125` — `mapScriptTarget`
  com 14 cases verbosos para mapeamento praticamente identidade.
  *Fix:* tabela `Record<ts.ScriptTarget, JscTarget>`.

- [ ] **P3** `runner/transform/tsconfig-resolver.ts:26-48` — cache estático em
  classe com `clearCache()` exposto só pra teste; problemático em runs paralelos
  com cwds diferentes.
  *Fix:* cache por escopo (instância) ou documentar como singleton.

---

## DX & API pública

- [ ] **P1** `define/define-feature.ts:12` x `orquestra/global.ts:90` — duas
  formas de criar feature (`defineFeature` × `orquestra.feature`); README usa
  uma, playground usa outra.
  *Fix:* eleger `defineFeature` como canônico (alinhado com Vitest); marcar a
  outra como atalho legado ou remover.

- [ ] **P1** `orquestra/global.ts:38-67` x `89-107` — free-functions
  (`beforeStartServer`) e métodos no facade (`orquestra.beforeStartServer`)
  coexistem sem doc dizer qual é canônico.
  *Fix:* free-functions canônicas para hooks (alinhado com Vitest); facade
  só pra atalhos cosméticos.

- [ ] **P1** `core/src/index.ts:1-80` — superfície obesa (50+). `WorkerOrquestra`,
  `GlobalOrquestra`, `init/get/resetOrquestraInstance`, `BddContainer`, `Feature`,
  `Scenario`, `Step` não deveriam ser top-level.
  *Fix:* esconder em `@orquestra/core/internal`.

- [ ] **P1** `types/define/macro.types.ts:11-13` + `module.types.ts:26-27` —
  `__orquestra` e `__token` aparecem no autocomplete do user.
  *Fix:* branding via `unique symbol` + `Omit` no tipo retornado.

- [ ] **P1** `orquestra/global.ts:11,21` + `worker-orquestra.ts:109,145` —
  todas as 6 mensagens de erro usam `Error` cru. Sem hierarquia para
  `instanceof` filtering.
  *Fix:* `OrquestraError` + subclasses (`OrquestraInitError`,
  `OrquestraServiceNotFoundError`, `OrquestraHookPhaseError`).

- [ ] **P2** `orquestra/global.ts:96-98` + `worker-orquestra.ts:140-148` —
  `orquestra.get(token)` aceita `string | Symbol | Function`. Cast `as any`
  interno (linha 143) vaza pro user.
  *Fix:* canonizar `get(ClassConstructor)`; `getByToken(string|symbol)` como
  escape hatch tipado.

- [ ] **P2** `e2e/playground/features/authorization.feature.ts:32-33` x
  `runner/README.md:53-68` — macros tipadas exigem `npx orquestra types` antes
  do primeiro run. Vitest funciona out-of-the-box.
  *Fix:* README raiz avisa antes de mostrar macro; idealmente `test` auto-roda
  geração de tipos uma vez.

- [ ] **P2** `types/bdd/bdd.types.ts:3-9` — `as`/`I`/`so` (1 letra capitalizada;
  `as` é palavra reservada em TS) destoa do resto.
  *Fix:* aceitar `userStory: { as, want, soThat }` como alternativa estruturada.

- [ ] **P3** `README.md:75-128` — quickstart com 53 linhas e 3 blocos antes do
  primeiro `orquestra test`.
  *Fix:* "1-minute quickstart" sem httpServer no topo.

- [ ] **P3** `core/README.md:43-51` — lista `WorkerOrquestra`, `init*`, etc
  como API. Esses são pro runner, não pro user.
  *Fix:* mover pra "Library mode (advanced)" ou remover.

- [ ] **P3** Mensagens de erro inconsistentes em tom. `worker-orquestra.ts:108`
  segue padrão "<problema> — <causa> — <fix>"; outras (`global.ts:11`,
  `worker-orquestra.ts:145`) ficam terse.
  *Fix:* todas com pattern explicativo.

- [ ] **P3** `define-feature.ts:9-10` — comentário admite shadowing real
  (variável `feature` sombreia a função importada).
  *Fix:* convencionar `featureBuilder` ou aceitar.

---

## Ordem sugerida

**Fase 1 (1-2 dias) — alto ROI, mexe em poucos arquivos:**
1. Top 5 acima.
2. `OrquestraError` + subclasses (P1 do DX).
3. Branding via `unique symbol` em `MacroDefinition`/`ModuleDefinition`.
4. Eleger canônico `defineFeature` × `orquestra.feature`.
5. Deduplicar `getPackageVersion` × `getRunnerVersion`.

**Fase 2 (3-5 dias) — escopo médio, dívida estrutural:**
1. Consolidar lifecycle vocabulary (`onStart`/`onTeardown` canônico, deletar
   `up/down`/`start/stop` extras).
2. Reduzir superfície pública (`@orquestra/core/internal` subpath).
3. State machine única de shutdown.
4. Refatorar `processFeature` em pipeline declarativo.
5. Schema de config único (zod).

**Fase 3 (1 semana) — polimento de longo prazo:**
1. Extrair `ContainerGraph` do Bootstrap.
2. Tipar `BddRunner.runScenario` e remover `any`.
3. Discriminated union para `StepEvent`.
4. Pluggable transport / formato no Logger.
5. Reporter ASCII fallback (Windows).
6. README quickstart "1 minuto".
