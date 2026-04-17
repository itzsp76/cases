# Deploy na Vercel + Supabase

Guia passo-a-passo para ativar o ITZ Cases na Vercel com **Supabase** (Postgres gerenciado).

---

## 1. Criar projeto no Supabase

1. Acesse https://supabase.com → **Start your project** → login com GitHub.
2. **New Project**:
   - **Name:** `itz-cases`
   - **Database Password:** crie uma senha forte e **anote** (vai precisar depois)
   - **Region:** `South America (São Paulo)` ou `East US` (mais próximas)
   - **Pricing:** Free
3. Clique **Create new project** — leva ~2 min para provisionar.

---

## 2. Conectar Supabase ao projeto Vercel

### Opção A — Integração Marketplace (recomendada)

1. Na Vercel, abra o projeto `cases` → aba **Integrations** → **Browse Marketplace**.
2. Busque **Supabase** → **Add Integration**.
3. Autorize a conta, selecione o projeto Supabase `itz-cases` e o projeto Vercel `cases`.
4. Marque **Production + Preview + Development** → **Link Projects**.

A integração injeta automaticamente no projeto Vercel:
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_DATABASE`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

Nosso código lê `DATABASE_URL || POSTGRES_URL` — já está pronto.

### Opção B — Manual (se não quiser usar o Marketplace)

1. No Supabase → **Project Settings** → **Database** → **Connection string** → aba **URI**.
2. Marque **Use connection pooling** → **Mode: Transaction** (porta 6543).
3. Copie a string e troque `[YOUR-PASSWORD]` pela senha do passo 1.
4. Cole essa string na Vercel em **Settings → Environment Variables** como `DATABASE_URL` (Production + Preview + Development).

---

## 3. Adicionar as outras env vars na Vercel

Em **Project → Settings → Environment Variables** (todas em Production + Preview + Development):

| Nome | Valor |
|------|-------|
| `JWT_SECRET` | string aleatória de 64 bytes (veja abaixo) |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASS_HASH` | hash bcrypt da senha admin (veja abaixo) |
| `JWT_EXPIRY` | `24h` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | o domínio da Vercel — ex: `https://cases-mocha.vercel.app` |

### Como gerar JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Como gerar ADMIN_PASS_HASH
```bash
node -e "console.log(require('bcryptjs').hashSync('SUA_SENHA_AQUI',12))"
```

---

## 4. Popular banco com os 115 cases

Você precisa rodar o seed **uma vez**, do seu computador apontando para o Supabase.

1. No Supabase → **Project Settings** → **Database** → **Connection string** → **URI** com **Transaction pooler** (porta 6543). Copie e troque `[YOUR-PASSWORD]`.
2. Na raiz do projeto local:
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Edite `backend/.env` e cole apenas:
   ```
   DATABASE_URL=postgresql://postgres.xxxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```
4. Instale deps e rode o seed:
   ```bash
   npm install
   npm run migrate
   ```

O script:
- Cria as tabelas (`cases`, `leads`, `settings`)
- Importa os 115 cases de `backend/data/initial-cases.json`
- Cria configurações padrão

Para limpar e repopular: `npm run migrate:force`.

---

## 5. Redeploy

Após configurar as env vars no passo 3, vá em **Deployments** → último deploy → `...` → **Redeploy**.

Ou simplesmente faça um novo commit que a Vercel refaz automaticamente.

---

## 6. Validar

- `https://cases-mocha.vercel.app/api/health` → `{"status":"ok",...}`
- `https://cases-mocha.vercel.app` → frontend carrega lista de cases
- Login admin funciona com `ADMIN_USER` / senha que você escolheu

---

## 7. Dev local

```bash
npm run dev
```
Roda em `http://localhost:3001` apontando para o mesmo banco Supabase de produção.

Para isolar dev de prod, crie um segundo projeto Supabase e use seu `DATABASE_URL` no `.env` local.

---

## Notas

- **Pooler vs conexão direta**: use sempre a **Transaction pooler** (porta 6543) em serverless. A conexão direta (5432) gastaria limite de conexões e falharia em cold starts paralelos.
- **`prepare: false`**: o driver já vem configurado para isso no `db.js` (necessário com PgBouncer transaction mode).
- **Rate-limit** (`express-rate-limit` in-memory) é imperfeito em serverless — cada lambda tem seu próprio contador. Para proteção real, use **Vercel WAF** ou Upstash Redis.
- **Trocar senha admin**: POST `/api/admin/password/generate-hash` com `{password: "nova"}` → copie o hash retornado → atualize `ADMIN_PASS_HASH` nas env vars → Redeploy.
- **Backup**: Supabase free já faz backups diários automáticos (retenção de 7 dias).
