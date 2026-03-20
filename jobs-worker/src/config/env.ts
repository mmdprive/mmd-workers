import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  PORT: Number(process.env.PORT || 3000),

  AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY || "",
  AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg",

  AIRTABLE_TABLE_CLIENTS:
    process.env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
  AIRTABLE_TABLE_SESSIONS:
    process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
  AIRTABLE_TABLE_PAYMENTS:
    process.env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
  AIRTABLE_TABLE_JOBS:
    process.env.AIRTABLE_TABLE_JOBS || "tbl0jxIjN8QYwGABX",

  WEB_BASE_URL:
    process.env.WEB_BASE_URL || "https://mmdprive.webflow.io",
  PAYMENTS_WORKER_BASE_URL:
    process.env.PAYMENTS_WORKER_BASE_URL ||
    "https://payments-worker.malemodel-bkk.workers.dev",

  CONFIRM_KEY: process.env.CONFIRM_KEY || "",
  INTERNAL_TOKEN: process.env.INTERNAL_TOKEN || "",
  TELEGRAM_INTERNAL_SEND_URL: process.env.TELEGRAM_INTERNAL_SEND_URL || "",
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || "-1003546439681",
  TG_THREAD_CONFIRM: Number(process.env.TG_THREAD_CONFIRM || 61),
};

export const AIRTABLE_ENABLED = Boolean(
  ENV.AIRTABLE_API_KEY && ENV.AIRTABLE_BASE_ID
);
