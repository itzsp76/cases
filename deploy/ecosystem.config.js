// PM2 config — gerencia o processo Node em produção
// Uso:
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//   pm2 startup   (para iniciar no boot do servidor)

module.exports = {
  apps: [{
    name: 'itz-cases',
    script: './server.js',
    cwd: '/var/www/itz-cases/backend',   // ajuste se usou outro caminho
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/var/log/pm2/itz-cases-error.log',
    out_file:   '/var/log/pm2/itz-cases-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }],
};
