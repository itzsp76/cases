# Deploy na Vercel + Turso

Guia passo-a-passo para subir o ITZ Cases na Vercel usando **Turso** como banco (SQLite remoto).

---

## 1. Criar banco no Turso

1. Crie conta gratuita em https://turso.tech
2. Instale a CLI (opcional, mas recomendado):
   ```bash
   # Windows (PowerShell)
   winget install Turso.turso
   # Mac / Linux
   curl -sSfL https://get.tur.so/install.sh | bash
   ```
3. Login e criação do banco:
   ```bash
   turso auth login
   turso db create itz-cases
   turso db show --url itz-cases        # copia a URL
   turso db tokens create itz-cases     # copia o token
   ```

Alternativa sem CLI: no dashboard do Turso clique em **Create Database** → depois em **Database** copie a URL e em **Tokens** gere um auth token.

---

## 2. Configurar variáveis locais

Na raiz do projeto, copie o exemplo:
```bash
cp backend/.env.example backend/.env
```

Preencha **`backend/.env`** com:
- `TURSO_DATABASE_URL` — ex: `libsql://itz-cases-xxx.turso.io`
- `TURSO_AUTH_TOKEN` — o token gerado acima
- `JWT_SECRET` — gere com `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `ADMIN_USER` — ex: `admin`
- `ADMIN_PASS_HASH` — gere com `node -e "console.log(require('bcryptjs').hashSync('SUASENHA',12))"`

---

## 3. Instalar deps + popular banco (uma vez)

```bash
npm install
npm run migrate
```

O script cria as tabelas e importa os 115 cases de `backend/data/initial-cases.json`.

Para limpar e repopular: `npm run migrate:force`.

---

## 4. Testar local

```bash
npm run dev
```

Abra `http://localhost:3001` — front + back rodando juntos.

---

## 5. Deploy na Vercel

### 5.1. Importar projeto
1. Faça login em https://vercel.com com a conta GitHub **itzsp76**
2. **Add New… → Project** → selecione o repositório `itzsp76/cases`
3. Framework preset: **Other** (ou "Node.js")
4. Root Directory: **`./`** (deixe como está)
5. Build Command: **deixe vazio**
6. Output Directory: **deixe vazio**
7. Install Command: `npm install` (padrão)

### 5.2. Environment Variables
Em **Project → Settings → Environment Variables** adicione (Production + Preview + Development):

| Nome | Valor |
|------|-------|
| `TURSO_DATABASE_URL` | `libsql://...` |
| `TURSO_AUTH_TOKEN` | `eyJ...` |
| `JWT_SECRET` | (seu secret) |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASS_HASH` | (hash bcrypt) |
| `JWT_EXPIRY` | `24h` |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | (o domínio da Vercel, ex: `https://cases-xxx.vercel.app`) |

### 5.3. Deploy
Clique em **Deploy**. Vai fazer build + subir em ~1 minuto.

---

## 6. Após o primeiro deploy

- Acesse `https://SEU-DOMINIO.vercel.app/api/health` — deve retornar `{"status":"ok",...}`
- Acesse `https://SEU-DOMINIO.vercel.app` — frontend carrega
- Login admin: `https://SEU-DOMINIO.vercel.app/#/admin` (ou conforme sua rota) com `ADMIN_USER` / senha original

---

## Notas / limitações

- **Rate-limit** (`express-rate-limit` in-memory) é imperfeito em serverless — cada função lambda tem seu próprio contador. Para proteção forte, use o **Vercel WAF** ou um serviço externo (Upstash Redis + `@upstash/ratelimit`).
- **Cold start** (~500-800ms) acontece quando a função fica ociosa. Turso é rápido, então o primeiro pedido após idle leva ~1s.
- **Senha admin** — trocar via endpoint `/api/admin/password/generate-hash`, pegar o hash retornado e atualizar `ADMIN_PASS_HASH` nas env vars da Vercel → **Redeploy**.
- **Backup** — o plano free do Turso já faz snapshots diários. Para exportar manualmente: `turso db shell itz-cases ".dump" > backup.sql`.
