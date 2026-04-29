import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const PLAN = {
  production: [
    ["admin-worker", "core/admin-worker"],
    ["payments-worker", "core/payments-worker"],
    ["events-worker", "core/events-worker"],
    ["chat-worker", "core/chat-worker"],
    ["telegram-worker", "core/telegram-worker"],
    ["realtime-worker", "core/realtime-worker"],
  ],
  apps: [["admin-console-V1", "apps/dashboard/admin-console-v1"]],
  migration: [
    ["immigrate-worker", "migration/immigrate-worker"],
    ["jobs-worker", "migration/jobs-worker"],
    ["ai-worker", "migration/legacy-chat/ai-worker"],
    ["services/mmd-chat-webhook", "migration/legacy-chat/mmd-chat-webhook"],
    ["admin-worker/mmd-chat-webhook", "migration/legacy-chat/admin-worker-mmd-chat-webhook"],
    ["exports", "migration/legacy-artifacts/exports"],
    ["patch.diff", "migration/legacy-artifacts/patch.diff"],
  ],
  specs: [
    ["openapi/mmd-core-api.v1.yaml", "openapi/core-api/mmd-core-api.v1.yaml"],
    ["spec/openapi.payments.v2.yaml", "openapi/payments/openapi.payments.v2.yaml"],
    ["infra/omni/models-airtable-schema.template.json", "infra/airtable/models-airtable-schema.template.json"],
  ],
};

const REQUIRED_SCRIPT_TARGETS = {
  "deploy:payments": "payments-worker/wrangler.merged.toml",
  "deploy:admin": "admin-worker/wrangler.toml",
  "deploy:events": "events-worker/wrangler.toml",
  "deploy:telegram": "telegram-worker/wrangler.toml",
  "dev:payments": "payments-worker/wrangler.merged.toml",
  "dev:admin": "admin-worker/wrangler.toml",
  "dev:events": "events-worker/wrangler.toml",
  "dev:telegram": "telegram-worker/wrangler.toml",
};

function statType(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return "missing";
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) return "dir";
  if (stat.isFile()) return "file";
  return "other";
}

function isEmptyDir(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return false;
  return fs.readdirSync(abs).length === 0;
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
}

function buildMoveRows(rows) {
  return rows.map(([source, destination]) => {
    const sourceType = statType(source);
    const destinationType = statType(destination);
    const destinationEmpty = isEmptyDir(destination);
    const moved = sourceType === "missing" && destinationType !== "missing";
    return {
      source,
      destination,
      source_exists: sourceType !== "missing",
      destination_exists: destinationType !== "missing",
      destination_empty: destinationEmpty,
      status: moved
        ? "moved"
        : destinationType !== "missing"
          ? destinationEmpty
            ? "destination_empty"
            : "partial"
          : "not_moved",
    };
  });
}

function checkScripts(pkg) {
  const report = [];
  for (const [scriptName, configPath] of Object.entries(REQUIRED_SCRIPT_TARGETS)) {
    const command = String(pkg.scripts?.[scriptName] || "");
    report.push({
      script: scriptName,
      configured: Boolean(command),
      mentions_expected_path: command.includes(configPath),
      expected_path_exists: fs.existsSync(path.join(ROOT, configPath)),
    });
  }
  return report;
}

function main() {
  const pkg = readPackageJson();
  const scripts = checkScripts(pkg);
  const sections = {
    production: buildMoveRows(PLAN.production),
    apps: buildMoveRows(PLAN.apps),
    migration: buildMoveRows(PLAN.migration),
    specs: buildMoveRows(PLAN.specs),
  };

  const unresolvedMoves = Object.values(sections)
    .flat()
    .filter((item) => item.status !== "moved");
  const scriptIssues = scripts.filter(
    (item) => !item.configured || !item.mentions_expected_path || !item.expected_path_exists
  );

  const summary = {
    package_script_targets_valid: scriptIssues.length === 0,
    unresolved_move_count: unresolvedMoves.length,
    closeout_ready: unresolvedMoves.length === 0 && scriptIssues.length === 0,
    scripts,
    sections,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.closeout_ready) {
    process.exitCode = 1;
  }
}

main();
