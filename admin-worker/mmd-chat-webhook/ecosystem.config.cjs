module.exports = {
  apps: [
    {
      name: "mmd-chat-webhook",
      script: "./server.js",      // หรือ "./index.js" ถ้าจะใช้เป็น entry
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        TELEGRAM_INTERNAL_SEND_URL: "http://localhost:5001/telegram/send",
        INTERNAL_TOKEN: "dev-token-xxx"
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        AIRTABLE_API_KEY: "<YOUR_AIRTABLE_KEY>",
        AIRTABLE_BASE_ID: "<YOUR_AIRTABLE_BASE_ID>",
        ADMIN_BEARER: "<ADMIN_BEARER_TOKEN>",
        CONFIRM_KEY: "<CONFIRM_KEY>",
        TELEGRAM_INTERNAL_SEND_URL: "https://internal.mmdprive.com/telegram/send",
        INTERNAL_TOKEN: "<PROD_INTERNAL_TOKEN>"
      }
    }
  ]
};
