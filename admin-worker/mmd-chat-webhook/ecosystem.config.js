module.exports = {
  apps: [
    {
      name: 'mmd-chat-webhook',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY,
        AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID || 'appsV1ILPRfIjkaYg',
        ADMIN_BEARER: process.env.ADMIN_BEARER,
        CONFIRM_KEY: process.env.CONFIRM_KEY,
        TELEGRAM_INTERNAL_SEND_URL: process.env.TELEGRAM_INTERNAL_SEND_URL || 'https://telegram-worker.malemodel-bkk.workers.dev',
        INTERNAL_TOKEN: process.env.INTERNAL_TOKEN,
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '-1003546439681',
        TG_THREAD_CONFIRM: process.env.TG_THREAD_CONFIRM || '61',
        PAYMENTS_WORKER_BASE_URL: process.env.PAYMENTS_WORKER_BASE_URL || 'https://payments-worker.malemodel-bkk.workers.dev',
        WEB_BASE_URL: process.env.WEB_BASE_URL || 'https://mmdprive.webflow.io'
      }
    }
  ]
};
