// ═══════════════════════════════════════════════════════
// SEED — popula o banco com os 115 cases iniciais da ITZ
// ═══════════════════════════════════════════════════════
// Uso:   node seed.js           (popula apenas se tabela estiver vazia)
// Uso:   node seed.js --force   (limpa e repopula — CUIDADO em produção)
// ═══════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const force = process.argv.includes('--force');

function run() {
  const existing = db._stmts.countCases.get().total;

  if (existing > 0 && !force) {
    console.log(`ℹ️  Tabela "cases" já tem ${existing} registros. Use --force para limpar e repopular.`);
    return;
  }

  if (force && existing > 0) {
    console.log(`⚠️  Limpando ${existing} cases existentes...`);
    db.db.prepare('DELETE FROM cases').run();
  }

  const jsonPath = path.join(__dirname, 'data', 'initial-cases.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Arquivo de dados não encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const cases = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📦 Importando ${cases.length} cases...`);

  const tx = db.db.transaction((items) => {
    for (const c of items) {
      db.createCase({
        niche:       c.niche,
        name:        c.name,
        videoUrl:    c.videoUrl,
        description: c.description || '',
        featured:    !!c.featured,
      });
    }
  });
  tx(cases);

  // Settings iniciais (se não existirem)
  const currentSettings = db.getAllSettings();
  if (!currentSettings.waPhone) {
    db.setManySettings({
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

  const total = db._stmts.countCases.get().total;
  const niches = db._stmts.countNiches.get().total;
  console.log(`✅ Concluído: ${total} cases em ${niches} segmentos.`);
}

try {
  run();
  process.exit(0);
} catch (err) {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
}
