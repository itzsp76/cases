# Deploy no VPS — Passo a passo

Guia completo para colocar o ITZ Cases no ar em um VPS Ubuntu (DigitalOcean, Hostinger VPS, Vultr, etc.).

**Tempo estimado:** 30–45 minutos na primeira vez.
**Custo mensal típico:** US$ 4–6 (DigitalOcean droplet básico) ou ~R$ 25 (Hostinger VPS).

---

## Pré-requisitos

- VPS Ubuntu 22.04 ou 24.04 com acesso SSH (usuário com `sudo`)
- Domínio apontado pro IP do VPS (ex: `cases.itzinteligencia.com.br` → registro A)
- Acesso ao seu provedor de DNS

---

## 1. Preparar o servidor

Conecte via SSH e atualize:

```bash
ssh usuario@ip-do-vps
sudo apt update && sudo apt upgrade -y
```

Instale Node 20 (via NodeSource), Nginx, Certbot e utilitários:

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Nginx, Certbot, Git
sudo apt install -y nginx certbot python3-certbot-nginx git ufw build-essential

# PM2 global
sudo npm install -g pm2
```

Configure o firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

---

## 2. Subir os arquivos do projeto

### Opção A — via Git (recomendado)

No VPS:

```bash
sudo mkdir -p /var/www/itz-cases
sudo chown -R $USER:$USER /var/www/itz-cases
cd /var/www/itz-cases
git clone SEU-REPOSITORIO-GIT .
```

### Opção B — via SCP (se não tem Git)

Na sua máquina local (Mac):

```bash
# Compactar o projeto
cd "/Users/elisonperini/Desktop/Michael Parceirs"
zip -r itz-cases-sistema.zip itz-cases-sistema -x '*/node_modules/*' '*/data/*.db'

# Enviar
scp itz-cases-sistema.zip usuario@ip-do-vps:/tmp/
```

No VPS:

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
unzip /tmp/itz-cases-sistema.zip
mv itz-cases-sistema itz-cases
```

---

## 3. Instalar dependências e configurar .env

```bash
cd /var/www/itz-cases/backend
npm install --production
```

Crie o `.env` a partir do exemplo:

```bash
cp .env.example .env
nano .env
```

**Valores importantes a preencher:**

### Gerar JWT_SECRET (64 bytes aleatórios):
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Cole no `.env` em `JWT_SECRET=...`

### Gerar hash da senha admin (escolha uma senha forte):
```bash
node -e "console.log(require('bcryptjs').hashSync('SuaSenhaForte123', 12))"
```
Cole no `.env` em `ADMIN_PASS_HASH=...`

### CORS_ORIGIN:
Coloque seu domínio final: `CORS_ORIGIN=https://cases.itzinteligencia.com.br`

**Salve e saia do nano:** `Ctrl+O` → `Enter` → `Ctrl+X`

---

## 4. Popular o banco com os 115 cases

```bash
cd /var/www/itz-cases/backend
npm run seed
```

Saída esperada:
```
📦 Importando 115 cases...
✅ Settings padrão criadas.
✅ Concluído: 115 cases em 44 segmentos.
```

---

## 5. Iniciar a API com PM2

```bash
cd /var/www/itz-cases/backend
pm2 start ../deploy/ecosystem.config.js
pm2 save
pm2 startup   # rode o comando que aparecer com sudo
```

Teste:
```bash
curl http://localhost:3001/api/health
# esperado: {"status":"ok","env":"production","uptime":X}
```

---

## 6. Configurar Nginx

```bash
sudo cp /var/www/itz-cases/deploy/nginx.conf /etc/nginx/sites-available/itz-cases
sudo nano /etc/nginx/sites-available/itz-cases
```

Substitua `cases.itzinteligencia.com.br` pelo seu domínio real (duas ocorrências no arquivo).

Ative:

```bash
sudo ln -s /etc/nginx/sites-available/itz-cases /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default   # remove o default do Nginx
sudo nginx -t                                # testa a config
sudo systemctl reload nginx
```

Abra no navegador: `http://seu-dominio.com.br` — deve aparecer o site.

---

## 7. Ativar SSL (HTTPS)

```bash
sudo certbot --nginx -d cases.itzinteligencia.com.br
```

O Certbot:
- Pede seu email
- Pede aceite dos termos
- Pergunta se quer redirecionar HTTP→HTTPS (escolha **2**: redirect)
- Gera o certificado e edita o Nginx automaticamente

Agora o site responde em HTTPS e renova o certificado sozinho (via cron).

---

## 8. Acessar o painel admin

1. Abra: `https://seu-dominio.com.br`
2. Role até o footer → clique em **"Área restrita"** (ou clique no ícone ⚙ do header)
3. Usuário: `admin`
4. Senha: a que você definiu no passo 3 (ao gerar o hash)

No painel você pode:
- Adicionar/editar/excluir cases
- Ver leads e exportar CSV
- Configurar GA4, Meta Pixel, API de notificação WhatsApp
- Trocar senha

---

## 9. Backup do banco

O SQLite vive em `/var/www/itz-cases/backend/data/itz-cases.db`.

**Backup manual:**
```bash
cp /var/www/itz-cases/backend/data/itz-cases.db ~/backup-$(date +%Y%m%d).db
```

**Backup automático diário (cron):**
```bash
sudo nano /etc/cron.daily/itz-cases-backup
```

Cole:
```bash
#!/bin/bash
mkdir -p /var/backups/itz-cases
cp /var/www/itz-cases/backend/data/itz-cases.db \
   /var/backups/itz-cases/itz-cases-$(date +\%Y\%m\%d).db
find /var/backups/itz-cases -name "*.db" -mtime +30 -delete
```

Torne executável:
```bash
sudo chmod +x /etc/cron.daily/itz-cases-backup
```

---

## Comandos úteis do dia a dia

```bash
# Ver status da API
pm2 status

# Ver logs em tempo real
pm2 logs itz-cases

# Reiniciar a API (depois de editar .env)
pm2 restart itz-cases

# Atualizar código (se usou Git)
cd /var/www/itz-cases
git pull
cd backend && npm install --production
pm2 restart itz-cases

# Ver logs do Nginx
sudo tail -f /var/log/nginx/itz-cases-access.log
sudo tail -f /var/log/nginx/itz-cases-error.log
```

---

## Troubleshooting

### "502 Bad Gateway" ao abrir o site
→ A API Node não está rodando. Verifique: `pm2 status` e `pm2 logs itz-cases`.

### Login não funciona (credenciais inválidas)
→ Verifique se `ADMIN_PASS_HASH` no `.env` foi gerado corretamente. Teste:
```bash
node -e "console.log(require('bcryptjs').compareSync('SUA_SENHA_AQUI', 'COLE_O_HASH_AQUI'))"
# deve retornar: true
```

### Cases não carregam
→ Veja o Console do navegador (F12) — se tiver erro CORS, confira `CORS_ORIGIN` no `.env`.

### SSL não renova sozinho
→ Teste: `sudo certbot renew --dry-run`. Se erro, verifique DNS do domínio.
