# ITZ Cases de Sucesso — Sistema Completo

Sistema de cases de sucesso da **ITZ Inteligência Comercial**, com frontend público responsivo e painel administrativo.

## Arquitetura

```
itz-cases-sistema/
├── backend/              ← API Node.js + Express + SQLite
│   ├── server.js         ← servidor principal
│   ├── db.js             ← schema e queries SQLite
│   ├── seed.js           ← popula 115 cases iniciais
│   ├── routes/
│   │   ├── auth.js       ← POST /api/auth/login
│   │   ├── public.js     ← /api/cases, /api/leads
│   │   └── admin.js      ← /api/admin/* (JWT protected)
│   ├── middleware/auth.js
│   ├── data/             ← banco SQLite + dados iniciais
│   ├── .env.example      ← template de configuração
│   └── package.json
│
├── frontend/
│   └── index.html        ← SPA servida pelo Nginx (consome /api)
│
├── deploy/
│   ├── ecosystem.config.js  ← PM2
│   ├── nginx.conf           ← reverse proxy + SSL
│   └── deploy-vps.md        ← guia passo a passo completo
│
└── README.md (este arquivo)
```

## Stack

| Camada      | Tecnologia                |
|-------------|---------------------------|
| Frontend    | HTML/CSS/JS vanilla       |
| Backend     | Node.js 20 + Express 4    |
| Banco       | SQLite (better-sqlite3)   |
| Auth        | JWT + bcrypt              |
| Deploy      | Nginx + PM2 + Let's Encrypt |
| Hospedagem  | VPS Ubuntu                |

**Por que SQLite:** zero configuração, performance excelente pra esse volume (milhares de cases, milhões de views), backup = copiar 1 arquivo.

---

## Rodar localmente (desenvolvimento)

### 1. Instalar dependências

```bash
cd backend
npm install
```

### 2. Configurar `.env`

```bash
cp .env.example .env
```

Edite o `.env`:

- Gere `JWT_SECRET`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- Gere `ADMIN_PASS_HASH` (ex: senha "minhaSenha123"):
  ```bash
  node -e "console.log(require('bcryptjs').hashSync('minhaSenha123', 12))"
  ```
- Deixe `CORS_ORIGIN=*` em dev pra facilitar

### 3. Popular o banco

```bash
npm run seed
```

### 4. Iniciar o servidor

```bash
npm run dev
```

Acesse: http://localhost:3001

Login admin: `admin` / `minhaSenha123` (ou a que você gerou o hash).

---

## Deploy em produção

**Veja o guia completo em [`deploy/deploy-vps.md`](deploy/deploy-vps.md).**

Resumo rápido:

1. Provisione VPS Ubuntu 22.04
2. Instale Node 20, Nginx, Certbot, PM2
3. Clone/envie o projeto pra `/var/www/itz-cases`
4. `cd backend && npm install --production && cp .env.example .env`
5. Edite `.env` (gere JWT_SECRET, ADMIN_PASS_HASH, ajuste CORS)
6. `npm run seed`
7. `pm2 start ../deploy/ecosystem.config.js && pm2 save && pm2 startup`
8. Configure Nginx: `sudo cp deploy/nginx.conf /etc/nginx/sites-available/itz-cases` e edite
9. `sudo certbot --nginx -d seu-dominio.com.br`
10. Acesse `https://seu-dominio.com.br`

---

## API Endpoints

### Públicos (sem autenticação)

| Método | Endpoint                  | Descrição                        |
|--------|---------------------------|----------------------------------|
| GET    | `/api/health`             | Health check                     |
| GET    | `/api/cases`              | Lista todos os cases             |
| GET    | `/api/cases/:id`          | Detalhe + incrementa views       |
| POST   | `/api/cases/:id/view`     | Incrementa view (sem retorno)    |
| POST   | `/api/leads`              | Submete lead (rate-limited)      |
| GET    | `/api/settings/public`    | Configs seguras do frontend      |

### Autenticação

| Método | Endpoint              | Descrição                       |
|--------|-----------------------|---------------------------------|
| POST   | `/api/auth/login`     | Retorna JWT                     |
| GET    | `/api/auth/me`        | Valida token atual              |

### Admin (JWT obrigatório)

| Método | Endpoint                              | Descrição                    |
|--------|---------------------------------------|------------------------------|
| POST   | `/api/admin/cases`                    | Criar case                   |
| PUT    | `/api/admin/cases/:id`                | Atualizar case               |
| DELETE | `/api/admin/cases/:id`                | Excluir case                 |
| GET    | `/api/admin/leads`                    | Listar leads                 |
| DELETE | `/api/admin/leads`                    | Limpar todos                 |
| GET    | `/api/admin/leads/export.csv`         | Baixar CSV                   |
| GET    | `/api/admin/analytics`                | Métricas                     |
| GET    | `/api/admin/settings`                 | Todas as configs             |
| PUT    | `/api/admin/settings`                 | Salvar configs               |
| POST   | `/api/admin/password/generate-hash`   | Gerar hash de nova senha     |

---

## Segurança

- **Senhas:** bcrypt com cost 12 (hash armazenado no `.env`, nunca no banco)
- **JWT:** 24h de validade, assinado com secret de 64 bytes aleatórios
- **Rate limit:** 5 tentativas de login/15min, 5 leads/10min, 300 req/min global
- **CORS:** origem específica em produção (não use `*`)
- **Helmet headers:** X-Frame-Options, X-Content-Type-Options no Nginx
- **HTTPS obrigatório** via Let's Encrypt
- **SQLite journal mode WAL:** previne corrupção
- **Sanitização de inputs:** validação de tamanho e tipo em todas rotas
- **`.env` nunca commitado** (já no `.gitignore`)

---

## Trocar senha admin

Pelo painel: **Admin → Configurações → Nova senha**. Ao salvar, o sistema gera um hash e mostra instruções — copie o hash no `.env` e rode `pm2 restart itz-cases`.

Manualmente no VPS:
```bash
node -e "console.log(require('bcryptjs').hashSync('NovaSenha123', 12))"
# copie o hash e edite .env: ADMIN_PASS_HASH=...
pm2 restart itz-cases
```

---

## Backup

O banco é um único arquivo: `backend/data/itz-cases.db`.

**Manual:**
```bash
cp backend/data/itz-cases.db ~/backup-itz-$(date +%Y%m%d).db
```

**Automático diário:** veja `deploy/deploy-vps.md` seção 9.

---

## Estrutura de dados (SQLite)

### Tabela `cases`
| Coluna      | Tipo    | Descrição                     |
|-------------|---------|-------------------------------|
| id          | INTEGER | PK autoincrement              |
| niche       | TEXT    | Segmento (ex: "Imóveis")      |
| name        | TEXT    | Nome do case                  |
| video_url   | TEXT    | URL do YouTube                |
| description | TEXT    | Texto livre                   |
| featured    | INTEGER | 1 = destaque                  |
| views       | INTEGER | Contador de visualizações    |
| created_at  | TEXT    | Timestamp                     |
| updated_at  | TEXT    | Timestamp                     |

### Tabela `leads`
| Coluna      | Tipo    | Descrição                    |
|-------------|---------|------------------------------|
| id          | INTEGER | PK                           |
| name        | TEXT    | Nome do lead                 |
| phone       | TEXT    | WhatsApp                     |
| niche       | TEXT    | Segmento de interesse        |
| case_id     | INTEGER | FK → cases.id (nullable)     |
| case_name   | TEXT    | Snapshot do nome do case     |
| message     | TEXT    | Mensagem opcional            |
| ip          | TEXT    | IP do visitante              |
| user_agent  | TEXT    | Browser/device               |
| created_at  | TEXT    | Timestamp                    |

### Tabela `settings`
Key/value simples. Chaves usadas:
`waPhone`, `waMsg`, `heroTitle`, `heroSub`, `notifyApiUrl`, `notifyApiToken`, `notifyDestPhone`, `notifyChannel`, `notifyMessage`, `notifyEnabled`, `ga4Id`, `metaPixelId`, `customScript`.

---

## Custos mensais típicos

| Item              | Valor           |
|-------------------|-----------------|
| VPS (2GB RAM)     | US$ 6 / R$ 30   |
| Domínio (.com.br) | R$ 40 / ano     |
| SSL (Let's Encrypt) | Grátis        |
| **Total**         | **~R$ 35/mês**  |

---

## Contato técnico

Desenvolvido com as diretrizes de arquitetura de Brad Frost (Atomic Design):
sistemas > páginas, componentes > cópias, banco de dados normalizado > JSON blob.

O sistema é **portável**: qualquer provedor de WhatsApp/CRM pode ser integrado via a aba "API Notificações" do painel admin — basta colar o endpoint e token.
