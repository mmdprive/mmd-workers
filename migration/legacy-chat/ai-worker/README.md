# MMD AI Worker Scaffold

Starter scaffold for `ai-worker` aligned with current MMD architecture.

## Position in architecture
- `chat-worker` = interface
- `ai-worker` = search, retrieval, ranking, summarization, intelligence
- `admin-worker`, `payments-worker`, `events-worker` = domain truth
- `telegram-worker` = internal messaging
- `jobs-worker` = immigration layer

## Included endpoints
- `GET /ping`
- `POST /v1/ai/search`
- `POST /v1/ai/answer`
- `POST /v1/ai/member-context`
- `POST /v1/ai/recommend`

## Notes
- Connectors are placeholders right now.
- Replace example worker URLs in `wrangler.toml`.
- Add secrets in Wrangler / Cloudflare dashboard:
  - `INTERNAL_TOKEN`
  - `AIRTABLE_API_KEY`
  - `MEMBERSTACK_SECRET_KEY`
- This scaffold is read-oriented by design. Writes should stay in the domain workers.
