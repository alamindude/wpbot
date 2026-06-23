module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'src/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
    },
  ],
};
