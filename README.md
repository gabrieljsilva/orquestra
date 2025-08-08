# Orquestra – Orquestração de ambientes de **testes de integração** em Node .js/TypeScript

> **One‑liner** Suba containers Docker, inicie seu server HTTP, injete helpers tipados, conecte plugins (GraphQL, AMQP, outros) – tudo com uma única instância compartilhável entre todas as _suites_.

---
## 1. Estrutura de pacotes
| Pacote | Conteúdo |
|--------|----------|
| **`@orquestra/core`** | Orquestra (classe principal), `Helper`, ciclo de vida, DI/`Context`, `Container` base, `RestClient`, tipos utilitários. |
| **`@orquestra/adapter-express`**, `@orquestra/adapter-fastify`, … | Adapters que tipam `orquestra.httpServer` de acordo com o framework usado. |
| **`@orquestra/plugin/graphql`** | `OrquestraGraphQLPlugin`, `GraphQLClient` estilo Apollo/urql. |
| **`@orquestra/plugin/amqp`** | `OrquestraAMQPPlugin`, `AMQPClient` com utilitários `publish`, `waitFor`, `publishAndWaitAck`, `waitQueueEmpty`. |
| **(futuros)** | `@orquestra/plugin/rest`, `@orquestra/plugin/redis`, etc. |

---
## 2. Instalação mínima (Express + Postgres)
```bash
pnpm add -D @orquestra/core @orquestra/adapter-express testcontainers pg supertest
```
Plugins são opcionais:
```bash
pnpm add -D @orquestra/plugin/graphql @orquestra/plugin/amqp graphql graphql-tag amqplib
```

---
## 3. Conceitos‑chave
| Conceito | Descrição rápida |
|----------|-----------------|
| **Instância** | `new Orquestra({...}).start()` cria todo o grafo. Pode ser compartilhada por todas as _suites_ via arquivo `setup.ts`. |
| **Containers** | Classes `extends Container` implementam `up()`/`down()` e usam **`this.metadata: Map<string, any>`** p/ expor info dinâmica (`connectionString`, `uri`, portas). |
| **Helpers** | Classes `extends Helper<Return, Params>` com acesso a `this.ctx` (DI). Podem consumir outros helpers, containers ou plugins. |
| **Context (ctx)** | Localizador de dependências em runtime – `ctx.get(MyHelper)`, `ctx.get(PostgresqlOrquestraContainer)`. Suporta `whenReady()` para aguardar provisionamento. |
| **Plugins** | Módulos que adicionam clients/helpers. Registrados via instância direta **ou** provider estilo Nest: `{ provide, useFactory(ctx) }`. |
| **Adapters** | Tipam o `httpServer` de forma segura sem poluir o core. |

---
## 4. Exemplo completo (Express + GraphQL + AMQP)
```ts
// vitest.setup.ts – sobe uma única instância
import { Orquestra, Helper, Context } from '@orquestra/core';
import { OrquestraServerExpress } from '@orquestra/adapter-express';
import { OrquestraGraphQLPlugin, GraphQLClient } from '@orquestra/plugin/graphql';
import { OrquestraAMQPPlugin, AMQPClient } from '@orquestra/plugin/amqp';
import { PostgresqlOrquestraContainer } from './containers/PostgresqlOrquestraContainer';
import { RabbitMQContainer } from './containers/RabbitMQContainer';
import { app } from '../src/express';

class MakeLoginHelper extends Helper<string, [string,string]> {
  async execute(email, password) {
    const res = await this.ctx.restClient.post('/auth/login').send({ email, password });
    return res.body.token;
  }
}

export const orquestra = new Orquestra<OrquestraServerExpress>({
  env: { NODE_ENV:'test' },
  loadEnvFromFile: true,
  httpServer: async () => app,
  containers: [PostgresqlOrquestraContainer, RabbitMQContainer],
  helpers: [MakeLoginHelper],
  plugins: [
    new OrquestraGraphQLPlugin({ endpoint:'/' }),
    {
      provide: OrquestraAMQPPlugin,
      useFactory: (ctx: Context) => {
        const rabbit = ctx.get(RabbitMQContainer);
        const uri = rabbit.metadata.get('uri');
        return new OrquestraAMQPPlugin({ uri, exchanges:[{name:'domain',type:'topic'}]});
      },
    },
  ],
});

beforeAll(() => orquestra.start());
afterAll(() => orquestra.teardown());
```
Em qualquer arquivo de teste:
```ts
import { orquestra } from '../vitest.setup';
const rest  = orquestra.restClient;
const gql   = orquestra.get(GraphQLClient);
const amqp  = orquestra.get(AMQPClient);
const login = orquestra.get(MakeLoginHelper);
```

---
## 5. Implementando um container com metadata
```ts
import { Container } from '@orquestra/core';
import { PostgreSqlContainer } from 'testcontainers';

export class PostgresqlOrquestraContainer extends Container {
  private instance?: PostgreSqlContainer;
  async up() {
    this.instance = await new PostgreSqlContainer('postgres:16')
      .withEnv('POSTGRES_PASSWORD','test')
      .withExposedPorts(5432)
      .start();
    this.metadata.set('connectionString', this.instance.getConnectionString());
    return this.instance;
  }
  async down() { await this.instance?.stop(); }
}
```

---
## 6. Providers estilo Nest (injeção dinâmica)
```ts
plugins: [
  {
    provide: OrquestraAMQPPlugin,
    useFactory: (ctx) => {
      const rabbit = ctx.get(RabbitMQContainer);
      return new OrquestraAMQPPlugin({ uri: rabbit.metadata.get('uri') });
    },
  },
];
```
A função recebe o `Context` já inicializado (containers prontos), permitindo criar plugins com valores runtime.

---
## 7. Clients & Utilitários
| Client | Métodos-chave | Observações |
|--------|---------------|-------------|
| **RestClient** | `get/post/put/…` (Supertest) | Pronto no core. |
| **GraphQLClient** | `query({ query, variables, headers })` | Auto codegen opcional. |
| **AMQPClient** | `publish`, `waitFor`, `publishAndWaitAck`, `waitQueueEmpty` | Usa publisher confirms + Rabbit Management API. |

---
## 8. Compartilhando uma instância global
* **Vitest**: arquivo `setupFiles` (executa 1× por worker). Use `threads:false` p/ instância única.
* **Jest**: `globalSetup` + `globalTeardown`; exponha via `global.__ORQUESTRA__`.

---
## 9. Boas práticas de runtime
* Rodar containers com **portas dinâmicas** e ler do `metadata` em helpers/plugins.
* Usar `autoTransaction:'perTest'` (roadmap) ou truncar DB em `afterEach` para isolamento.
* Configurar `ORQ_TIMEOUT_FACTOR` para CIs lentos.
* Detectar ciclos de dependência – Orquestra lança erro claro.

---
## 10. Roadmap curto
* **Adapters**: Fastify, Hono.
* **Plugin REST enhanced** (fetch/undici).
* **Snapshot Volume** p/ rollback instantâneo.
* **CLI** `orquestra init`, `orquestra graph`.

---
> **GitHub** <https://github.com/orquestra/orquestra> – issues e PRs são bem‑vindos!
