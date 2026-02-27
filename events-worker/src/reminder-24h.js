// events-worker/src/reminder-24h.js
/* 
  - query sessions 23.5h..24.5h (not yet reminder_24h_sent)
  - send message to model (if telegram_consent && telegram_chat_id)
  - send reassurance to member
  - mark reminder_24h_sent on session
  - schedule check ack in 12 hours (KV or queue)
*/
// Paste the processOneSession/run24hReminders code provided earlier
