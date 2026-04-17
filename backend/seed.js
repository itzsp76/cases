// ═══════════════════════════════════════════════════════
// SEED / MIGRATE — cria schema e popula cases iniciais (Neon/Postgres)
// ═══════════════════════════════════════════════════════
// Uso:   npm run migrate              (popula apenas se tabela estiver vazia)
// Uso:   npm run migrate:force        (limpa e repopula — CUIDADO)
// ═══════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const force = process.argv.includes('--force');

async function run() {
  await db.ensureSchema();
  console.log('✅ Schema garantido.');

  const existing = await db.countCases();

  if (existing > 0 && !force) {
    console.log(`ℹ️  Tabela "cases" já tem ${existing} registros. Use --force para limpar e repopular.`);
    return;
  }

  if (force && existing > 0) {
    console.log(`⚠️  Limpando ${existing} cases existentes...`);
    await db.sql(`DELETE FROM cases`);
  }

  const jsonPath = path.join(__dirname, 'data', 'initial-cases.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Arquivo não encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const cases = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📦 Importando ${cases.length} cases...`);

  let done = 0;
  for (const c of cases) {
    await db.sql(
      `INSERT INTO cases (niche, name, video_url, description, featured)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        c.niche,
        c.name,
        c.videoUrl || '',
        c.description || '',
        c.featured ? 1 : 0,
      ]
    );
    done++;
    if (done % 25 === 0 || done === cases.length) {
      console.log(`   → ${done}/${cases.length}`);
    }
  }

  // Settings padrão (apenas se não existirem)
  const current = await db.getAllSettings();
  if (!current.waPhone) {
    await db.setManySettings({
      waPhone: '5511999999999',
      waMsg: 'Olá! Vi os cases de sucesso da ITZ e quero saber mais!',
      heroTitle: '',
      heroSub: '',
      notifyApiUrl: '',
      notifyApiToken: '',
      notifyDestPhone: '',
      notifyChannel: '',
      notifyMessage: '🔥 Novo lead via Cases de Sucesso!\n\nNome: {nome}\nTelefone: {telefone}\nInteresse: {nicho}\nCase visto: {case}\nMensagem: {mensagem}\n\nResponda em até 5 minutos!',
      notifyEnabled: false,
      ga4Id: '',
      metaPixelId: '',
      customScript: '',
    });
    console.log('✅ Settings padrão criadas.');
  }

  const total = await db.countCases();
  console.log(`✅ Concluído: ${total} cases no banco.`);
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erro no seed:', err);
    process.exit(1);
  });
