# Deploy na Vercel + Neon

Guia passo-a-passo para ativar o ITZ Cases na Vercel usando **Neon** (PostgreSQL serverless).
A integração Neon é nativa da Vercel — zero CLI, tudo pelo dashboard.

---

## 1. Conectar Neon à Vercel (1 clique)

1. Entre em https://vercel.com no projeto `cases` (já deployado).
2. Aba **Storage** → **Create Database** → escolha **Neon — Serverless Postgres**.
   - *Ou:* **Integrations** → **Browse Marketplace** → **Neon** → **Add Integration**.
3. Aceite / crie conta Neon (pode logar com o mesmo GitHub).
4. Região: escolha **us-east** ou a mais próxima de você (Neon não tem São Paulo ainda).
5. Plano: **Free** é suficiente (0.5 GB, 190 compute-hours/mês).
6. **Connect to Project** → selecione `cases` → Connect.

A integração injeta automaticamente estas env vars no projeto:
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` etc.

Nosso código usa `DATABASE_URL` → já está pronto.

---

## 2. Adicionar as outras env vars

Em **Project → Settings → Environment Variables** → **Production + Preview + Development**:

| Nome | Valor |
|------|-------|
| `JWT_SECRET` | string aleatória de 64 bytes (veja "como gerar" abaixo) |
| `ADMIN_USER` | `admin` (ou o nome que preferir) |
| `ADMIN_PASS_HASH` | hash bcrypt da senha (veja "como gerar") |
| `JWT_EXPIRY` | `24h` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | o domínio Vercel — ex: `https://cases-mocha.vercel.app` |

### Como gerar JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Como gerar ADMIN_PASS_HASH
```bash
node -e "console.log(require('bcryptjs').hashSync('SUA_SENHA_AQUI',12))"
```
(troque `SUA_SENHA_AQUI` pela senha real)

---

## 3. Popular banco com os 115 cases

Você precisa rodar o seed **uma vez**, apontando do seu computador para o Neon.

1. No dashboard Neon (ou na aba **Storage → Neon** da Vercel), copie a **Pooled connection string** (`DATABASE_URL`).
2. Na raiz do projeto local:
   ```bash
   cp backend/.env.example backend/.env
   ```
3. Edite `backend/.env` e cole apenas:
   ```
   DATABASE_URL=postgresql://user:pass@xxx.neon.tech/neondb?sslmode=require
   ```
4. Instale e rode o seed:
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

## 4. Redeploy

Após adicionar as env vars (passo 2), clique em **Redeploy** no último deploy (aba **Deployments** → `...` → Redeploy).

Ou simplesmente faça um novo commit que a Vercel refaz.

---

## 5. Validar

- `https://cases-mocha.vercel.app/api/health` → deve retornar `{"status":"ok",...}`
- `https://cases-mocha.vercel.app` → frontend carrega
- Lista de cases vem do Neon

---

## 6. Testar local (opcional)

```bash
npm run dev
```

Abre em `http://localhost:3001` apontando para o Neon (mesmo banco de produção).

Se quiser banco separado para dev, crie um segundo database no Neon e aponte o `DATABASE_URL` do `.env` local para ele.

---

## Notas

- **Rate-limit** (`express-rate-limit` in-memory) é imperfeito em serverless — cada lambda tem seu próprio contador. Para proteção real use **Vercel WAF** ou Upstash Redis.
- **Cold start**: ~300-600ms quando a função fica ociosa. Neon HTTP driver é leve.
- **Trocar senha admin**: POST para `/api/admin/password/generate-hash` com `{password: "novaSenha"}` → pegar o hash → atualizar `ADMIN_PASS_HASH` nas env vars da Vercel → Redeploy.
- **Backup**: Neon free já tem branches / point-in-time restore (7 dias). Para export manual: use `pg_dump` com a connection string.
