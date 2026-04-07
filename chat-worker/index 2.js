// =========================================================
// chat-worker — AI Concierge
// =========================================================
//
// PUBLIC ENTRY
//   /v1/chat/message
//
// PURPOSE
//   AI concierge for members / prospects
//
// FLOW
//   Web /trust/inme
//        ↓
//   chat-worker
//        ↓
//   admin-worker / payments-worker / events-worker
//
// =========================================================

import { json, safeJson } from "../lib/http.js"

export default {
  async fetch(req, env, ctx) {

    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method.toUpperCase()

    if (method === "GET" && path === "/ping") {
      return json({
        ok: true,
        worker: "chat-worker",
        ts: Date.now()
      })
    }

    if (method === "POST" && path === "/v1/chat/message") {
      const body = await safeJson(req)

      const text = (body.message || "").trim()
      const user_id = body.user_id || ""

      if (!text) {
        return json({
          ok:false,
          error:"missing_message"
        },400)
      }

      const ai = await askAI(env,text)

      return json({
        ok:true,
        reply:ai.reply
      })
    }

    return json({ ok:false, error:"not_found" },404)

  }
}

async function askAI(env,text){

  if(!env.OPENAI_API_KEY){
    return { reply:"AI not configured." }
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${env.OPENAI_API_KEY}`
    },
    body:JSON.stringify({
      model:"gpt-4o-mini",
      messages:[
        {
          role:"system",
          content:`You are MMD Privé concierge.
You help clients book male models in Bangkok.`
        },
        {
          role:"user",
          content:text
        }
      ]
    })
  })

  const data = await res.json()

  return {
    reply:data.choices?.[0]?.message?.content || ""
  }

}