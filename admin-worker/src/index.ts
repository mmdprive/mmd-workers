import type {
  BindModelIdentityResponse,
  DealsListLiteResponse,
  Env,
  HealthResponse,
  ModelsListLiteResponse,
  PrepareModelRecordResponse,
  PromoteImmigrationRequest,
  PromoteImmigrationResponse,
  UpsertAiRequest,
  UpsertAiResponse,
} from "./types";
import { isAuthorized } from "./lib/auth";
import { listModelCardsLite, persistModelBinding } from "./lib/airtable";
import { listDealsLite, upsertDealAi } from "./lib/airtable-deals";
import { promoteImmigrationToMember } from "./lib/member-promotion";
import {
  badRequest,
  internalError,
  json,
  notFound,
  unauthorized,
  unsupportedMediaType,
} from "./lib/response";

type AdminEnv = Env & Record<string, unknown>;

const AIRTABLE_API = "https://api.airtable.com/v0";
const SESSION_FIELDS = {
  SESSION_ID: "fldLTq2kZbyRv22IA",
  STATUS: "fldHAlxnRfpKucnNV",
  PACKAGE_CODE: "fldp6xNSvxDh5pjR9",
  AMOUNT_THB: "fldhwC79ndbnEXSZz",
  PAYMENT_STATUS: "fldTY5lE6m0kQf72n",
  PAYMENT_REF: "fldojgjSQLaO0uQLX",
  MEMBERSTACK_ID: "fldjelgJTzCHSCWZ0",
  CUSTOMER_TELEGRAM_USERNAME: "fld4DR9g4mEGX1fY1",
  MODEL_TELEGRAM_USERNAME: "fldEiYlmpAFgLS3or",
  LINE_USER_ID: "fld5tzCzdTTh8AJyI",
  JOB_ID: "fldHw5HdDDdkHXMhG",
  BASE_PRICE_THB: "fldDJhAadiWBr5IxS",
  ADDON_1_NAME: "fldB4VaqL5WQMuIQc",
  ADDON_1_PRICE_THB: "fldoljkFyEGBG4WG2",
  ADDON_2_NAME: "fldwvFmq7nzvwMRQb",
  ADDON_2_PRICE_THB: "fldNjpBzmXzMu1gxm",
  ADDON_3_NAME: "fldG919c6kp0IDmYk",
  ADDON_3_PRICE_THB: "fldyF0PSXHVaVxNSs",
  ADDON_4_NAME: "fldqXRwRy5O77EeW0",
  ADDON_4_PRICE_THB: "fldWBweLDvRRNAAD9",
  ADDONS_TOTAL_THB: "fldpyZCttPVRFbzjX",
  FINAL_PRICE_THB: "fldug5LUyiLyLvrCV",
} as const;
const PAYMENT_FIELDS = {
  PAYMENT_REF: "fldOO6SY49iDw8VBZ",
  PAYMENT_DATE: "fld3yAwxIu2dkw7fO",
  AMOUNT: "fldvCSwrUW8OMAooS",
  PAYMENT_STATUS: "fldEJ1hmm7KwWuI6q",
  PAYMENT_METHOD: "fldsblzIn0wzan3c9",
  VERIFICATION_STATUS: "fldJ7a0Ube9F0bmRy",
  PAYMENT_INTENT_STATUS: "fld04fr3bRJTohO6y",
  PACKAGE_CODE: "fldfyHYVrzbGPvMJR",
  CREATED_AT: "flduxcPpowBxEZSLu",
  SESSION_ID: "fld2wdhBvc8xrV6y5",
  PAYMENT_STAGE: "fldrr9g8ZZjqAbdKQ",
  PROVIDER: "fldJNMenT0woUXbKG",
  PROVIDER_TXN_ID: "fldHUvPn5CxK9i1Mq",
  NOTES: "fldjsZIKoJPawlb2u",
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("application/json");
}

function slugifyFolderName(value: unknown): string {
  return (
    nonEmptyString(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_") || "model"
  );
}

function alphaSuffix(seed: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `${chars[hash % 26]}${chars[Math.floor(hash / 26) % 26]}`;
}

function deriveUsername(raw: Record<string, unknown>): string {
  const manual = slugifyFolderName(raw.username);
  if (manual && manual !== "model") return manual;

  const folderSlug = slugifyFolderName(raw.folder_name);
  const base = folderSlug.slice(0, 24) || "model";
  return `${base}_${alphaSuffix(
    [
      nonEmptyString(raw.folder_name),
      nonEmptyString(raw.identity_id),
      nonEmptyString(raw.memberstack_id),
      nonEmptyString(raw.model_record_id),
    ]
      .filter(Boolean)
      .join("|") || base,
  )}`;
}

function deriveModelId(raw: Record<string, unknown>, folderSlug: string): string {
  const manual = nonEmptyString(raw.model_id);
  if (manual) return manual;
  return `mdl_${folderSlug || "model"}_${alphaSuffix(
    [
      nonEmptyString(raw.model_record_id),
      nonEmptyString(raw.identity_id),
      nonEmptyString(raw.memberstack_id),
      folderSlug,
    ]
      .filter(Boolean)
      .join("|") || "model",
  )}`;
}

function prepareModelRecord(raw: Record<string, unknown>): PrepareModelRecordResponse {
  const folderName = nonEmptyString(raw.folder_name);
  const folderSlug = slugifyFolderName(folderName);
  const username = deriveUsername(raw);
  const modelId = deriveModelId(raw, folderSlug);
  const rulesRequired = nonEmptyString(raw.rules_version_required) || "private-model-work-v1";
  const rulesAck = nonEmptyString(raw.rules_ack_version);
  const modelRecordId = nonEmptyString(raw.model_record_id);
  const identityId = nonEmptyString(raw.identity_id);
  const memberstackId = nonEmptyString(raw.memberstack_id);
  const bindingStatus =
    modelRecordId && (identityId || memberstackId) ? "bound" : "unbound";
  const consoleAccess =
    bindingStatus !== "bound"
      ? "pending_bind"
      : rulesAck !== rulesRequired
        ? "pending_rules"
        : "ready";

  return {
    ok: true,
    data: {
      model_id: modelId,
      username,
      display_name: nonEmptyString(raw.display_name) || folderName,
      folder_name: folderName,
      folder_slug: folderSlug,
      model_record_id: modelRecordId,
      identity_id: identityId,
      memberstack_id: memberstackId,
      visibility:
        (nonEmptyString(raw.visibility) as PrepareModelRecordResponse["data"]["visibility"]) ||
        "private",
      program_type:
        (nonEmptyString(raw.program_type) as PrepareModelRecordResponse["data"]["program_type"]) ||
        "standard",
      catalog_group:
        (nonEmptyString(
          raw.catalog_group,
        ) as PrepareModelRecordResponse["data"]["catalog_group"]) || "general",
      orientation: nonEmptyString(raw.orientation) || "straight",
      position_tag:
        (nonEmptyString(raw.position_tag) as PrepareModelRecordResponse["data"]["position_tag"]) ||
        "unknown",
      binding_status: bindingStatus,
      console_access: consoleAccess,
      rules_version_required: rulesRequired,
      rules_ack_version: rulesAck,
      r2_prefix: `models/${modelId}/`,
      primary_image_key: `models/${modelId}/profile/main.jpg`,
      preview_only: true,
    },
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const parsed = await request.json().catch(() => null);
  return isObject(parsed) ? parsed : null;
}

function getOrigin(request: Request): string {
  return request.headers.get("origin") || "*";
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getOrigin(request),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Confirm-Key",
    Vary: "Origin",
  };
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonWithCors(request: Request, body: unknown, init?: ResponseInit): Response {
  return withCors(request, json(body, init));
}

function badRequestWithCors(request: Request, message: string): Response {
  return withCors(request, badRequest(message));
}

function unauthorizedWithCors(request: Request): Response {
  return withCors(request, unauthorized());
}

function unsupportedMediaTypeWithCors(request: Request): Response {
  return withCors(request, unsupportedMediaType());
}

function internalErrorWithCors(request: Request): Response {
  return withCors(request, internalError());
}

function notFoundWithCors(request: Request): Response {
  return withCors(request, notFound());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAdminConsolePage(request: Request): Response {
  const url = new URL(request.url);
  const next = `/internal/admin/console${url.search}`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MMD Admin Console</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #08070a;
        --panel: rgba(19,15,24,.86);
        --panel-2: rgba(15,12,18,.72);
        --line: rgba(247,240,232,.14);
        --text: #f7f0e8;
        --muted: #c4b3a7;
        --gold: #d1a66a;
        --rose: #a45b5b;
        --teal: #5f7f84;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at top, rgba(164,91,91,.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(95,127,132,.12), transparent 30%),
          linear-gradient(180deg, #110d14 0%, #09080d 52%, #060507 100%);
        font-family: Baskerville, "Iowan Old Style", Palatino, Georgia, serif;
      }
      .shell {
        width: min(1320px, 100%);
        margin: 0 auto;
        padding: 28px;
        display: grid;
        gap: 18px;
      }
      .hero, .panel {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: 0 24px 80px rgba(0,0,0,.35);
        backdrop-filter: blur(18px);
      }
      .hero { padding: 28px; }
      .kicker {
        margin: 0 0 12px;
        color: var(--gold);
        font: 600 .8rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-size: clamp(2.4rem, 7vw, 4.8rem);
        line-height: .9;
        letter-spacing: -.04em;
      }
      .lead {
        margin: 18px 0 0;
        color: var(--muted);
        max-width: 56ch;
        line-height: 1.7;
      }
      .meta {
        margin-top: 18px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .meta span, code {
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,.04);
        color: var(--text);
        font-size: .82rem;
      }
      .grid {
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .panel {
        padding: 22px;
        display: grid;
        gap: 14px;
      }
      h2 {
        margin: 0;
        font-size: 1.35rem;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.65;
      }
      label {
        display: grid;
        gap: 8px;
        color: var(--gold);
        font: 600 .76rem/1.2 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      input, textarea, select, button {
        font: inherit;
      }
      input, textarea, select {
        width: 100%;
        min-height: 48px;
        padding: 10px 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: var(--panel-2);
        color: var(--text);
      }
      textarea { min-height: 120px; resize: vertical; }
      .row {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      button {
        min-height: 46px;
        padding: 0 18px;
        border: 1px solid rgba(209,166,106,.36);
        border-radius: 999px;
        background: linear-gradient(135deg, rgba(209,166,106,.24), rgba(164,91,91,.28));
        color: var(--text);
        font: 600 .92rem/1 "Avenir Next Condensed", "Gill Sans", sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        cursor: pointer;
      }
      button.secondary {
        background: rgba(255,255,255,.04);
        border-color: var(--line);
      }
      .status {
        min-height: 1.2em;
        font-size: .95rem;
      }
      .status.ok { color: #bfe6cb; }
      .status.error { color: #f2b0b0; }
      .results {
        margin: 0;
        padding-left: 20px;
        color: var(--muted);
        display: grid;
        gap: 8px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      @media (max-width: 720px) {
        .shell { padding: 18px; }
        .row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="kicker">Admin Console</p>
        <h1>Private operations surface.</h1>
        <p class="lead">This console uses the browser gate session created by <code>/internal/admin/login</code>. If the session is missing or expired, we return to login and keep the current path in <code>next</code>.</p>
        <div class="meta">
          <span id="sessionState">Checking session…</span>
          <code>${escapeHtml(next)}</code>
        </div>
        <div class="actions">
          <button id="pingButton" type="button">Check Admin Ping</button>
          <button id="logoutButton" type="button" class="secondary">Logout</button>
        </div>
        <p id="topStatus" class="status"></p>
      </section>

      <section class="grid">
        <article class="panel">
          <h2>Members</h2>
          <p>Search members from <code>/v1/admin/members/list</code>.</p>
          <div class="row">
            <label>Query
              <input id="memberQuery" type="text" placeholder="name, memberstack_id, telegram…" />
            </label>
            <label>Limit
              <input id="memberLimit" type="number" min="1" max="50" value="10" />
            </label>
          </div>
          <button id="memberSearch" type="button">Search Members</button>
          <p id="memberStatus" class="status"></p>
          <ol id="memberResults" class="results"></ol>
        </article>

        <article class="panel">
          <h2>Models</h2>
          <p>Search models from <code>/v1/admin/models/list</code>.</p>
          <div class="row">
            <label>Query
              <input id="modelQuery" type="text" placeholder="name, nickname, telegram…" />
            </label>
            <label>Limit
              <input id="modelLimit" type="number" min="1" max="50" value="10" />
            </label>
          </div>
          <button id="modelSearch" type="button">Search Models</button>
          <p id="modelStatus" class="status"></p>
          <ol id="modelResults" class="results"></ol>
        </article>

        <article class="panel">
          <h2>Create Job</h2>
          <p>Create a job and mint customer/model confirmation links through <code>/v1/admin/job/create</code>.</p>
          <div class="row">
            <label>Client Name
              <input id="jobClient" type="text" />
            </label>
            <label>Model Name
              <input id="jobModel" type="text" />
            </label>
            <label>Job Type
              <input id="jobType" type="text" />
            </label>
            <label>Job Date
              <input id="jobDate" type="date" />
            </label>
            <label>Start Time
              <input id="jobStart" type="time" />
            </label>
            <label>End Time
              <input id="jobEnd" type="time" />
            </label>
            <label>Location Name
              <input id="jobLocation" type="text" />
            </label>
            <label>Amount THB
              <input id="jobAmount" type="number" min="1" step="1" />
            </label>
          </div>
          <label>Note
            <textarea id="jobNote" placeholder="Optional note"></textarea>
          </label>
          <button id="jobCreate" type="button">Create Job</button>
          <p id="jobStatus" class="status"></p>
          <ol id="jobResults" class="results"></ol>
        </article>
      </section>
    </main>

    <script>
      (() => {
        const SESSION_KEY = "mmd_admin_gate_v1";
        const TTL_MS = 8 * 60 * 60 * 1000;
        const LOGIN_URL = "/internal/admin/login?next=" + encodeURIComponent(location.pathname + location.search + location.hash);
        const LOGIN_SESSION_URL = "/internal/admin/login/session";

        function setStatus(id, message, tone) {
          const node = document.getElementById(id);
          if (!node) return;
          node.textContent = message || "";
          node.className = "status" + (tone ? " " + tone : "");
        }

        function listResults(id, items, formatter) {
          const node = document.getElementById(id);
          if (!node) return;
          node.innerHTML = "";
          (items || []).forEach((item) => {
            const li = document.createElement("li");
            li.textContent = formatter(item);
            node.appendChild(li);
          });
        }

        function readSession() {
          try {
            return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
          } catch {
            return null;
          }
        }

        function isValidSession(session) {
          return !!session &&
            session.ok === true &&
            typeof session.at === "number" &&
            Date.now() - session.at <= TTL_MS &&
            typeof session.baseUrl === "string" &&
            session.baseUrl.length > 0 &&
            (session.bearer || session.confirmKey);
        }

        function goToLogin() {
          try { sessionStorage.removeItem(SESSION_KEY); } catch {}
          location.replace(LOGIN_URL);
        }

        const session = readSession();
        if (!isValidSession(session)) {
          goToLogin();
          return;
        }

        document.getElementById("sessionState").textContent = "Session ready: " + session.baseUrl;

        async function adminFetch(path, init) {
          const headers = new Headers((init && init.headers) || {});
          if (session.bearer) headers.set("Authorization", "Bearer " + session.bearer);
          if (session.confirmKey) headers.set("X-Confirm-Key", session.confirmKey);

          const response = await fetch(session.baseUrl.replace(/\\/+$/, "") + path, {
            ...init,
            headers,
          });

          const payload = await response.json().catch(() => null);
          if (response.status === 401) {
            goToLogin();
            throw new Error("Session expired");
          }
          if (!response.ok || !payload || payload.ok === false) {
            throw new Error(payload && payload.error ? (payload.error.message || payload.error.code || "Request failed") : "Request failed");
          }
          return payload;
        }

        document.getElementById("pingButton").addEventListener("click", async () => {
          setStatus("topStatus", "Checking admin ping…");
          try {
            const data = await adminFetch("/v1/admin/ping");
            setStatus("topStatus", "Admin worker ok at " + new Date(data.ts).toLocaleString(), "ok");
          } catch (error) {
            setStatus("topStatus", error.message || "Ping failed", "error");
          }
        });

        document.getElementById("logoutButton").addEventListener("click", async () => {
          try { sessionStorage.removeItem(SESSION_KEY); } catch {}
          try {
            await fetch(LOGIN_SESSION_URL, { method: "DELETE", credentials: "same-origin" });
          } catch {}
          location.replace(LOGIN_URL);
        });

        document.getElementById("memberSearch").addEventListener("click", async () => {
          const q = document.getElementById("memberQuery").value.trim();
          const limit = document.getElementById("memberLimit").value.trim() || "10";
          setStatus("memberStatus", "Loading members…");
          listResults("memberResults", []);
          try {
            const data = await adminFetch("/v1/admin/members/list?q=" + encodeURIComponent(q) + "&limit=" + encodeURIComponent(limit));
            setStatus("memberStatus", "Loaded " + (data.count || 0) + " member(s).", "ok");
            listResults("memberResults", data.items || [], (item) => {
              const fields = item && item.fields ? item.fields : {};
              return [fields.name, fields.nickname, fields.memberstack_id, item.id].filter(Boolean).join(" | ");
            });
          } catch (error) {
            setStatus("memberStatus", error.message || "Member search failed", "error");
          }
        });

        document.getElementById("modelSearch").addEventListener("click", async () => {
          const q = document.getElementById("modelQuery").value.trim();
          const limit = document.getElementById("modelLimit").value.trim() || "10";
          setStatus("modelStatus", "Loading models…");
          listResults("modelResults", []);
          try {
            const data = await adminFetch("/v1/admin/models/list?q=" + encodeURIComponent(q) + "&limit=" + encodeURIComponent(limit));
            setStatus("modelStatus", "Loaded " + (data.count || 0) + " model(s).", "ok");
            listResults("modelResults", data.items || [], (item) => {
              const fields = item && item.fields ? item.fields : {};
              return [fields.name, fields.nickname, fields.telegram_username, item.id].filter(Boolean).join(" | ");
            });
          } catch (error) {
            setStatus("modelStatus", error.message || "Model search failed", "error");
          }
        });

        document.getElementById("jobCreate").addEventListener("click", async () => {
          setStatus("jobStatus", "Creating job…");
          listResults("jobResults", []);
          try {
            const payload = {
              client_name: document.getElementById("jobClient").value.trim(),
              model_name: document.getElementById("jobModel").value.trim(),
              job_type: document.getElementById("jobType").value.trim(),
              job_date: document.getElementById("jobDate").value,
              start_time: document.getElementById("jobStart").value,
              end_time: document.getElementById("jobEnd").value,
              location_name: document.getElementById("jobLocation").value.trim(),
              amount_thb: Number(document.getElementById("jobAmount").value || "0"),
              note: document.getElementById("jobNote").value.trim(),
            };

            const data = await adminFetch("/v1/admin/job/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            setStatus("jobStatus", "Job created successfully.", "ok");
            listResults("jobResults", [
              "session_id: " + (data.session_id || ""),
              "payment_ref: " + (data.payment_ref || ""),
              "customer_confirmation_url: " + (data.customer_confirmation_url || ""),
              "model_confirmation_url: " + (data.model_confirmation_url || ""),
            ], (item) => item);
          } catch (error) {
            setStatus("jobStatus", error.message || "Job create failed", "error");
          }
        });

        document.getElementById("pingButton").click();
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function envString(env: AdminEnv, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveInt(value: string | null, fallback: number, min = 1, max = 200): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function makeOpaqueId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function absoluteUrl(pathOrUrl: unknown, baseUrl: string): string {
  const value = nonEmptyString(pathOrUrl);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${baseUrl.replace(/\/+$/, "")}${value.startsWith("/") ? "" : "/"}${value}`;
}

async function airtableFetch(
  env: AdminEnv,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: any }> {
  const apiKey = envString(env, "AIRTABLE_API_KEY");
  const baseId = envString(env, "AIRTABLE_BASE_ID");

  if (!apiKey || !baseId) {
    throw new Error("missing_airtable_env");
  }

  const res = await fetch(`${AIRTABLE_API}/${baseId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function airtableCreateRecord(
  env: AdminEnv,
  tableName: string,
  fields: Record<string, unknown>,
): Promise<{ id: string; fields?: Record<string, unknown> }> {
  const result = await airtableFetch(env, `/${encodeURIComponent(tableName)}`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });

  if (!result.ok) {
    throw new Error(`airtable_create_failed:${tableName}:${result.status}`);
  }

  return isObject(result.data)
    ? {
        id: nonEmptyString(result.data.id),
        fields: isObject(result.data.fields) ? result.data.fields : undefined,
      }
    : { id: "" };
}

async function airtableList(
  env: AdminEnv,
  tableName: string,
  options: {
    q?: string;
    limit?: number;
    matchFields: string[];
  },
): Promise<any[]> {
  const q = nonEmptyString(options.q);
  const limit = options.limit || 50;

  let formula = "";
  if (q) {
    const escaped = q.replace(/"/g, '\\"');
    const parts = options.matchFields.map((field) => `SEARCH(LOWER("${escaped}"), LOWER({${field}}&""))`);
    formula = `OR(${parts.join(",")})`;
  }

  const params = new URLSearchParams();
  params.set("maxRecords", String(limit));
  if (formula) params.set("filterByFormula", formula);

  const result = await airtableFetch(
    env,
    `/${encodeURIComponent(tableName)}?${params.toString()}`,
    { method: "GET" },
  );

  if (!result.ok) {
    throw new Error(`airtable_list_failed:${result.status}`);
  }

  return Array.isArray(result.data?.records) ? result.data.records : [];
}

function strReq(raw: Record<string, unknown>, key: string): string {
  const value = nonEmptyString(raw[key]);
  if (!value) throw new Error(`${key}_required`);
  return value;
}

function numReq(raw: Record<string, unknown>, key: string): number {
  const value = Number(raw[key]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${key}_required`);
  return value;
}

async function callPaymentsCreateLink(
  env: AdminEnv,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const paymentsBase =
    envString(env, "PAYMENTS_WORKER_ORIGIN") ||
    envString(env, "PAYMENTS_WORKER_BASE_URL") ||
    "https://payments-worker.malemodel-bkk.workers.dev";

  const internalToken = envString(env, "INTERNAL_TOKEN");
  const confirmKey = envString(env, "CONFIRM_KEY");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (internalToken) headers.Authorization = `Bearer ${internalToken}`;
  if (confirmKey) headers["X-Confirm-Key"] = confirmKey;

  const res = await fetch(`${paymentsBase.replace(/\/+$/, "")}/v1/confirm/link`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`payments_create_link_failed:${res.status}`);
  }

  return isObject(data) ? data : {};
}

function resolveCreateLinksUpstream(env: AdminEnv): string {
  const explicit = envString(env, "CREATE_LINKS_URL");
  if (explicit) return explicit;

  const jobsBase = envString(env, "JOBS_WORKER_BASE_URL");
  if (jobsBase) return `${jobsBase.replace(/\/+$/, "")}/v1/jobs/create-links`;

  return "";
}

function isPaymentsConfirmLinkUpstream(url: string): boolean {
  return /\/v1\/confirm\/link$/i.test(url.trim());
}

async function callCreateLinksUpstream(
  env: AdminEnv,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const upstreamUrl = resolveCreateLinksUpstream(env);
  if (!upstreamUrl) {
    throw new Error("create_links_upstream_missing");
  }

  const internalToken = envString(env, "INTERNAL_TOKEN");
  const confirmKey = envString(env, "CONFIRM_KEY");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (internalToken) headers.Authorization = `Bearer ${internalToken}`;
  if (confirmKey) headers["X-Confirm-Key"] = confirmKey;

  const res = await fetch(upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`create_links_upstream_failed:${res.status}`);
  }

  return isObject(data) ? data : {};
}

async function persistAdminJobToAirtable(
  env: AdminEnv,
  payload: Record<string, unknown>,
  minted: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sessionsTable = envString(env, "AIRTABLE_TABLE_SESSIONS");
  const paymentsTable = envString(env, "AIRTABLE_TABLE_PAYMENTS");
  const clientsTable = envString(env, "AIRTABLE_TABLE_CLIENTS");
  const activityTable = envString(env, "AIRTABLE_TABLE_ACTIVITY_LOGS");

  if (!sessionsTable || !paymentsTable) {
    return { persisted: false, reason: "missing_sessions_or_payments_table" };
  }

  const sessionId =
    nonEmptyString(minted.session_id) || makeOpaqueId("sess");
  const paymentRef =
    nonEmptyString(minted.payment_ref) || makeOpaqueId("pay");
  const memberstackId = nonEmptyString(payload.memberstack_id);
  const lineUserId = nonEmptyString(payload.line_user_id);
  const email = nonEmptyString(payload.email || payload.gmail).toLowerCase();
  const note = nonEmptyString(payload.note || payload.notes);
  const paymentMethod = nonEmptyString(payload.payment_method) || "promptpay";
  const paymentType = nonEmptyString(payload.payment_type) || "full";
  const amountThb = Number(payload.amount_thb);
  const clientName = nonEmptyString(payload.client_name);
  const modelName = nonEmptyString(payload.model_name);
  const nowIso = new Date().toISOString();

  let clientRecordId = "";
  if (clientsTable) {
    const clientRecord = await airtableCreateRecord(env, clientsTable, {
      "Client Name": clientName,
      client_name: clientName,
      mmd_client_name: clientName,
      nickname: nonEmptyString(payload.nickname),
      memberstack_id: memberstackId || undefined,
      line_user_id: lineUserId || undefined,
      telegram_username:
        nonEmptyString(payload.telegram_username || payload.customer_telegram_username) || undefined,
      email: email || undefined,
      source: "admin_worker",
      latest_payment_ref: paymentRef,
      latest_session_id: sessionId,
    });
    clientRecordId = clientRecord.id;
  }

  const sessionRecord = await airtableCreateRecord(env, sessionsTable, {
    [SESSION_FIELDS.SESSION_ID]: sessionId,
    [SESSION_FIELDS.STATUS]: "pending",
    [SESSION_FIELDS.PACKAGE_CODE]: nonEmptyString(payload.package_code) || "job",
    [SESSION_FIELDS.AMOUNT_THB]: amountThb,
    [SESSION_FIELDS.PAYMENT_STATUS]: "pending",
    [SESSION_FIELDS.PAYMENT_REF]: paymentRef,
    [SESSION_FIELDS.MEMBERSTACK_ID]: memberstackId || undefined,
    [SESSION_FIELDS.CUSTOMER_TELEGRAM_USERNAME]:
      nonEmptyString(payload.customer_telegram_username || payload.telegram_username) || undefined,
    [SESSION_FIELDS.MODEL_TELEGRAM_USERNAME]:
      nonEmptyString(payload.model_telegram_username) || undefined,
    [SESSION_FIELDS.LINE_USER_ID]: lineUserId || undefined,
    [SESSION_FIELDS.JOB_ID]: nonEmptyString(payload.job_id) || sessionId,
    [SESSION_FIELDS.BASE_PRICE_THB]: amountThb,
    [SESSION_FIELDS.ADDONS_TOTAL_THB]: 0,
    [SESSION_FIELDS.FINAL_PRICE_THB]: amountThb,
    client_name: clientName,
    mmd_client_name: clientName,
    username: nonEmptyString(payload.username) || undefined,
    model_name: modelName,
    job_type: nonEmptyString(payload.job_type),
    job_date: nonEmptyString(payload.job_date),
    start_time: nonEmptyString(payload.start_time),
    end_time: nonEmptyString(payload.end_time),
    location_name: nonEmptyString(payload.location_name),
    google_map_url: nonEmptyString(payload.google_map_url) || undefined,
    note: note || undefined,
    payment_ref: paymentRef,
    customer_confirmation_url:
      nonEmptyString(minted.customer_confirmation_url) || undefined,
    model_confirmation_url:
      nonEmptyString(minted.model_confirmation_url) || undefined,
    customer_dashboard_url:
      nonEmptyString(minted.customer_onboarding_url || payload.customer_dashboard_url) || undefined,
    model_dashboard_url:
      nonEmptyString(minted.model_dashboard_url || payload.model_dashboard_url) || undefined,
    client_record_id: clientRecordId || undefined,
    source: "admin_worker",
  });

  const paymentRecord = await airtableCreateRecord(env, paymentsTable, {
    [PAYMENT_FIELDS.PAYMENT_REF]: paymentRef,
    [PAYMENT_FIELDS.PAYMENT_DATE]: nowIso,
    [PAYMENT_FIELDS.AMOUNT]: amountThb,
    [PAYMENT_FIELDS.PAYMENT_STATUS]: "pending",
    [PAYMENT_FIELDS.PAYMENT_METHOD]: paymentMethod,
    [PAYMENT_FIELDS.VERIFICATION_STATUS]: "pending",
    [PAYMENT_FIELDS.PAYMENT_INTENT_STATUS]: "manual_review",
    [PAYMENT_FIELDS.PACKAGE_CODE]: nonEmptyString(payload.package_code) || "job",
    [PAYMENT_FIELDS.CREATED_AT]: nowIso,
    [PAYMENT_FIELDS.SESSION_ID]: sessionId,
    [PAYMENT_FIELDS.PAYMENT_STAGE]: paymentType,
    [PAYMENT_FIELDS.PROVIDER]: paymentMethod,
    [PAYMENT_FIELDS.PROVIDER_TXN_ID]: "",
    [PAYMENT_FIELDS.NOTES]: note,
    payment_ref: paymentRef,
    memberstack_id: memberstackId || undefined,
    member_email: email || undefined,
    client_name: clientName,
    model_name: modelName,
    source: "admin_worker",
  });

  let activityRecordId = "";
  if (activityTable) {
    const activityRecord = await airtableCreateRecord(env, activityTable, {
      event_type: "admin_job_created",
      session_id: sessionId,
      payment_ref: paymentRef,
      memberstack_id: memberstackId || undefined,
      client_name: clientName,
      model_name: modelName,
      amount_thb: amountThb,
      payload_json: JSON.stringify({
        client_name: clientName,
        model_name: modelName,
        job_type: nonEmptyString(payload.job_type),
        job_date: nonEmptyString(payload.job_date),
        start_time: nonEmptyString(payload.start_time),
        end_time: nonEmptyString(payload.end_time),
        location_name: nonEmptyString(payload.location_name),
        payment_type: paymentType,
      }),
      source: "admin_worker",
      created_at: nowIso,
    });
    activityRecordId = activityRecord.id;
  }

  return {
    persisted: true,
    client_record_id: clientRecordId,
    session_record_id: sessionRecord.id,
    payment_record_id: paymentRecord.id,
    activity_record_id: activityRecordId,
    session_id: sessionId,
    payment_ref: paymentRef,
  };
}

async function createAdminJob(
  env: AdminEnv,
  raw: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client_name = strReq(raw, "client_name");
  const model_name = strReq(raw, "model_name");
  const job_type = strReq(raw, "job_type");
  const job_date = strReq(raw, "job_date");
  const start_time = strReq(raw, "start_time");
  const end_time = strReq(raw, "end_time");
  const location_name = strReq(raw, "location_name");
  const amount_thb = numReq(raw, "amount_thb");

  const google_map_url = nonEmptyString(raw.google_map_url);
  const note = nonEmptyString(raw.note || raw.notes);
  const payment_type = nonEmptyString(raw.payment_type) || "full";
  const payment_method = nonEmptyString(raw.payment_method) || "promptpay";

  const webBase = envString(env, "WEB_BASE_URL") || "https://mmdbkk.com";

  const confirm_page = absoluteUrl(raw.confirm_page || "/confirm/job-confirmation", webBase);
  const model_confirm_page = absoluteUrl(raw.model_confirm_page || "/confirm/job-model", webBase);

  const payload = {
    client_name,
    model_name,
    job_type,
    job_date,
    start_time,
    end_time,
    location_name,
    google_map_url,
    amount_thb,
    payment_type,
    payment_method,
    note,
    confirm_page,
    model_confirm_page,
    memberstack_id: nonEmptyString(raw.memberstack_id),
    line_user_id: nonEmptyString(raw.line_user_id),
    telegram_username: nonEmptyString(raw.telegram_username),
    customer_telegram_username: nonEmptyString(raw.customer_telegram_username),
    model_telegram_username: nonEmptyString(raw.model_telegram_username),
    email: nonEmptyString(raw.email),
    gmail: nonEmptyString(raw.gmail),
    nickname: nonEmptyString(raw.nickname),
    username: nonEmptyString(raw.username),
    package_code: nonEmptyString(raw.package_code) || "job",
    customer_dashboard_url: absoluteUrl(
      raw.customer_dashboard_url || raw.customer_dashboard_path || "/member/dashboard",
      webBase,
    ),
    model_dashboard_url: absoluteUrl(
      raw.model_dashboard_url || raw.model_dashboard_path || "/model/dashboard",
      webBase,
    ),
  };

  let minted: Record<string, unknown>;
  let persistence: Record<string, unknown> = {};
  const createLinksUpstream = resolveCreateLinksUpstream(env);

  if (createLinksUpstream) {
    minted = await callCreateLinksUpstream(env, payload);
    if (isPaymentsConfirmLinkUpstream(createLinksUpstream)) {
      persistence = await persistAdminJobToAirtable(env, payload, minted);
    }
  } else {
    minted = await callPaymentsCreateLink(env, payload);
    persistence = await persistAdminJobToAirtable(env, payload, minted);
  }

  const session_id =
    nonEmptyString((persistence as Record<string, unknown>).session_id) ||
    nonEmptyString(minted.session_id) ||
    nonEmptyString(minted.sessionId);

  const payment_ref =
    nonEmptyString((persistence as Record<string, unknown>).payment_ref) ||
    nonEmptyString(minted.payment_ref) ||
    nonEmptyString(minted.paymentRef);

  const customer_confirmation_url =
    nonEmptyString(minted.customer_confirmation_url) ||
    nonEmptyString(minted.confirmation_url) ||
    (nonEmptyString(minted.customer_t)
      ? `${confirm_page}?t=${encodeURIComponent(nonEmptyString(minted.customer_t))}`
      : "") ||
    (nonEmptyString(minted.t)
      ? `${confirm_page}?t=${encodeURIComponent(nonEmptyString(minted.t))}`
      : "");

  const model_confirmation_url =
    nonEmptyString(minted.model_confirmation_url) ||
    (nonEmptyString(minted.model_t)
      ? `${model_confirm_page}?t=${encodeURIComponent(nonEmptyString(minted.model_t))}`
      : "");

  return {
    session_id,
    payment_ref,
    customer_confirmation_url,
    model_confirmation_url,
    customer_onboarding_url:
      nonEmptyString(minted.customer_onboarding_url) ||
      nonEmptyString(minted.onboarding_url),
    model_dashboard_url:
      nonEmptyString(minted.model_dashboard_url) ||
      absoluteUrl(payload.model_dashboard_url, webBase),
    persistence,
    flow: createLinksUpstream
      ? isPaymentsConfirmLinkUpstream(createLinksUpstream)
        ? "payments_upstream_plus_airtable_fallback"
        : "jobs_upstream"
      : "payments_plus_airtable_fallback",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { method } = request;
      const adminEnv = env as AdminEnv;

      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request),
        });
      }

      if (method === "GET" && url.pathname === "/v1/admin/health") {
        const body: HealthResponse = {
          ok: true,
          service: "admin-worker",
          version: "v1",
        };
        return jsonWithCors(request, body);
      }

      if (
        (method === "GET" || method === "HEAD") &&
        (url.pathname === "/internal/admin/console" || url.pathname.startsWith("/internal/admin/console/"))
      ) {
        return renderAdminConsolePage(request);
      }

      if (method === "GET" && url.pathname === "/v1/admin/ping") {
        if (!isAuthorized(request, env)) {
          return unauthorizedWithCors(request);
        }

        return jsonWithCors(request, {
          ok: true,
          admin: true,
          worker: "admin-worker",
          ts: Date.now(),
        });
      }

      if (!isAuthorized(request, env)) {
        return unauthorizedWithCors(request);
      }

      if (method === "GET" && url.pathname === "/v1/admin/models/list-lite") {
        const models = await listModelCardsLite(env);

        const body: ModelsListLiteResponse = {
          ok: true,
          models,
          count: models.length,
        };

        return jsonWithCors(request, body);
      }

      if (method === "GET" && url.pathname === "/v1/admin/models/list") {
        const q = nonEmptyString(url.searchParams.get("q"));
        const limit = toPositiveInt(url.searchParams.get("limit"), 50, 1, 200);
        const tableName = envString(adminEnv, "AIRTABLE_TABLE_MODELS") || "models";

        const items = await airtableList(adminEnv, tableName, {
          q,
          limit,
          matchFields: ["name", "nickname", "telegram_username", "telegram_id", "unique_key"],
        });

        return jsonWithCors(request, {
          ok: true,
          items,
          count: items.length,
        });
      }

      if (method === "GET" && url.pathname === "/v1/admin/members/list") {
        const q = nonEmptyString(url.searchParams.get("q"));
        const limit = toPositiveInt(url.searchParams.get("limit"), 50, 1, 200);
        const tableName = envString(adminEnv, "AIRTABLE_TABLE_MEMBERS") || "members";

        const items = await airtableList(adminEnv, tableName, {
          q,
          limit,
          matchFields: [
            "name",
            "nickname",
            "memberstack_id",
            "telegram_username",
            "telegram_id",
            "mmd_client_name",
          ],
        });

        return jsonWithCors(request, {
          ok: true,
          items,
          count: items.length,
        });
      }

      if (method === "GET" && url.pathname === "/v1/admin/deals/list-lite") {
        const deals = await listDealsLite(env);

        const body: DealsListLiteResponse = {
          ok: true,
          deals,
          count: deals.length,
        };

        return jsonWithCors(request, body);
      }

      if (method === "POST" && url.pathname === "/v1/admin/deals/upsert-ai") {
        if (!isJsonRequest(request)) {
          return unsupportedMediaTypeWithCors(request);
        }

        const rawPayload = await readJsonBody(request);

        if (!rawPayload) {
          return badRequestWithCors(request, "valid JSON object body is required");
        }

        const dealId = nonEmptyString(rawPayload.deal_id);

        if (!dealId) {
          return badRequestWithCors(request, "deal_id is required");
        }

        const payload: UpsertAiRequest = {
          ...(rawPayload as Partial<UpsertAiRequest>),
          deal_id: dealId,
        } as UpsertAiRequest;

        const result: UpsertAiResponse = await upsertDealAi(env, payload);
        return jsonWithCors(request, result);
      }

      if (method === "POST" && url.pathname === "/v1/admin/models/prepare-record") {
        if (!isJsonRequest(request)) {
          return unsupportedMediaTypeWithCors(request);
        }

        const rawPayload = await readJsonBody(request);
        if (!rawPayload) {
          return badRequestWithCors(request, "valid JSON object body is required");
        }

        if (!nonEmptyString(rawPayload.folder_name)) {
          return badRequestWithCors(request, "folder_name is required");
        }

        return jsonWithCors(request, prepareModelRecord(rawPayload));
      }

      if (method === "POST" && url.pathname === "/v1/admin/models/bind-identity") {
        if (!isJsonRequest(request)) {
          return unsupportedMediaTypeWithCors(request);
        }

        const rawPayload = await readJsonBody(request);
        if (!rawPayload) {
          return badRequestWithCors(request, "valid JSON object body is required");
        }

        if (!nonEmptyString(rawPayload.folder_name)) {
          return badRequestWithCors(request, "folder_name is required");
        }

        const prepared = prepareModelRecord(rawPayload);
        const result: BindModelIdentityResponse = {
          ok: true,
          data: await persistModelBinding(env, prepared.data),
        };

        return jsonWithCors(request, result);
      }

      if (method === "POST" && url.pathname === "/v1/admin/members/promote-immigration") {
        if (!isJsonRequest(request)) {
          return unsupportedMediaTypeWithCors(request);
        }

        const rawPayload = await readJsonBody(request);
        if (!rawPayload) {
          return badRequestWithCors(request, "valid JSON object body is required");
        }

        const immigrationId = nonEmptyString(rawPayload.immigration_id);
        if (!immigrationId) {
          return badRequestWithCors(request, "immigration_id is required");
        }

        const notes = rawPayload.notes as Record<string, unknown> | undefined;
        if (!nonEmptyString(notes?.manual_note_raw)) {
          return badRequestWithCors(request, "notes.manual_note_raw is required");
        }

        try {
          const result: PromoteImmigrationResponse =
            await promoteImmigrationToMember(
              env,
              {
                ...(rawPayload as Partial<PromoteImmigrationRequest>),
                immigration_id: immigrationId,
              } as PromoteImmigrationRequest,
            );
          return jsonWithCors(request, result);
        } catch (error) {
          if (error instanceof Error && error.message === "IDENTITY_CONFLICT") {
            return jsonWithCors(
              request,
              {
                ok: false,
                error: {
                  code: "IDENTITY_CONFLICT",
                  message: "Multiple candidate members matched",
                },
              },
              { status: 409 },
            );
          }

          throw error;
        }
      }

      if (method === "POST" && url.pathname === "/v1/admin/job/create") {
        if (!isJsonRequest(request)) {
          return unsupportedMediaTypeWithCors(request);
        }

        const rawPayload = await readJsonBody(request);
        if (!rawPayload) {
          return badRequestWithCors(request, "valid JSON object body is required");
        }

        try {
          const out = await createAdminJob(adminEnv, rawPayload);
          return jsonWithCors(request, {
            ok: true,
            ...out,
          });
        } catch (error) {
          return jsonWithCors(
            request,
            {
              ok: false,
              error: String((error as Error)?.message || error || "job_create_failed"),
            },
            { status: 500 },
          );
        }
      }

      return notFoundWithCors(request);
    } catch (error) {
      console.error("admin-worker error", error);
      return internalErrorWithCors(request);
    }
  },
};
