"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bindModelIdentity, prepareModelRecord } from "@/lib/admin-api";
import type {
  BoundModelRecord,
  ModelCardLite,
  PreparedModelRecord,
} from "@/lib/types";

type FormState = {
  folder_name: string;
  display_name: string;
  model_record_id: string;
  identity_id: string;
  memberstack_id: string;
  visibility: "public" | "private";
  program_type: "standard" | "premium" | "extreme" | "travel";
  catalog_group: "pn" | "vip" | "variety" | "compcard" | "general";
  orientation: string;
  position_tag: "top" | "bottom_flexible" | "unknown";
  rules_version_required: string;
  rules_ack_version: string;
};

const INITIAL_FORM: FormState = {
  folder_name: "",
  display_name: "",
  model_record_id: "",
  identity_id: "",
  memberstack_id: "",
  visibility: "private",
  program_type: "standard",
  catalog_group: "general",
  orientation: "straight",
  position_tag: "unknown",
  rules_version_required: "private-model-work-v1",
  rules_ack_version: "",
};

function FieldLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-white/80">
      <span className="font-medium text-white">{label}</span>
      {hint ? <span className="text-xs text-white/45">{hint}</span> : null}
    </label>
  );
}

function StatusPill({
  value,
  tone,
}: {
  value: string;
  tone: "amber" | "emerald" | "sky" | "slate";
}) {
  const tones = {
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    sky: "border-sky-400/20 bg-sky-400/10 text-sky-200",
    slate: "border-white/10 bg-white/5 text-white/70",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] ${tones[tone]}`}
    >
      {value}
    </span>
  );
}

function FieldValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-white/35">{label}</div>
      <div className="mt-2 break-all text-sm text-white">{value || "-"}</div>
    </div>
  );
}

function isBoundRecord(
  value: PreparedModelRecord | BoundModelRecord | null,
): value is BoundModelRecord {
  return Boolean(value && "persisted" in value && "persistence_target" in value);
}

function inferProgramType(
  tier: ModelCardLite["model_tier"],
): FormState["program_type"] {
  if (tier === "ems") return "extreme";
  if (tier === "premium" || tier === "vip") return "premium";
  return "standard";
}

function badgeToneForBinding(
  value: ModelCardLite["binding_status"],
): "amber" | "emerald" | "sky" | "slate" {
  if (value === "bound") return "emerald";
  if (value === "needs_review") return "sky";
  return "amber";
}

function badgeToneForConsole(
  value: ModelCardLite["console_access"],
): "amber" | "emerald" | "sky" | "slate" {
  if (value === "ready") return "emerald";
  if (value === "pending_rules") return "sky";
  return "amber";
}

export function ModelBindPanel({ models }: { models: ModelCardLite[] }) {
  const [modelList, setModelList] = useState<ModelCardLite[]>(models);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [preview, setPreview] = useState<PreparedModelRecord | null>(null);
  const [bound, setBound] = useState<BoundModelRecord | null>(null);
  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [bindingFilter, setBindingFilter] = useState<
    "all" | "unbound" | "bound" | "needs_review"
  >("all");
  const [consoleFilter, setConsoleFilter] = useState<
    "all" | "pending_bind" | "pending_rules" | "ready"
  >("all");
  const [isPending, startTransition] = useTransition();
  const formCardRef = useRef<HTMLElement | null>(null);
  const identityInputRef = useRef<HTMLInputElement | null>(null);
  const memberstackInputRef = useRef<HTMLInputElement | null>(null);

  const currentRecord = bound || preview;
  const isReadyToBind = useMemo(
    () => Boolean(form.folder_name.trim()),
    [form.folder_name],
  );
  const filteredModels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return modelList.filter((model) => {
      const matchesBinding =
        bindingFilter === "all" ||
        (model.binding_status || "unbound") === bindingFilter;
      const matchesConsole =
        consoleFilter === "all" ||
        (model.console_access || "pending_bind") === consoleFilter;

      if (!matchesBinding || !matchesConsole) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystacks = [
        model.working_name,
        model.orientation_label || "",
        model.model_tier,
        model.base_area || "",
        ...(model.vibe_tags || []),
      ];
      return haystacks.some((value) => value.toLowerCase().includes(needle));
    });
  }, [bindingFilter, consoleFilter, modelList, query]);

  useEffect(() => {
    setModelList(models);
  }, [models]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function payloadFromForm() {
    return {
      ...form,
      folder_name: form.folder_name.trim(),
      display_name: form.display_name.trim(),
      model_record_id: form.model_record_id.trim(),
      identity_id: form.identity_id.trim(),
      memberstack_id: form.memberstack_id.trim(),
      orientation: form.orientation.trim(),
      rules_version_required: form.rules_version_required.trim(),
      rules_ack_version: form.rules_ack_version.trim(),
    };
  }

  function handlePrepare() {
    setError("");
    setMessage("");
    setBound(null);

    startTransition(async () => {
      try {
        const payload = payloadFromForm();
        const response = await prepareModelRecord(payload);
        setPreview(response.data);
        setMessage("Prepared model record preview.");
      } catch (nextError) {
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : "Prepare failed");
      }
    });
  }

  function handleBind() {
    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        const response = await bindModelIdentity(payloadFromForm());
        setBound(response.data);
        setPreview(response.data);
        setModelList((current) =>
          current.map((model) =>
            model.model_record_id === response.data.model_record_id
              ? {
                  ...model,
                  working_name: response.data.display_name || model.working_name,
                  binding_status: response.data.binding_status,
                  console_access: response.data.console_access,
                  binding_record_id: response.data.binding_record_id,
                  binding_memberstack_id:
                    response.data.memberstack_id || model.binding_memberstack_id,
                }
              : model,
          ),
        );
        setMessage(`Persisted binding to ${response.data.persistence_target}.`);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Bind failed");
      }
    });
  }

  function handleQuickPrepare(model: ModelCardLite) {
    const nextPayload = {
      ...payloadFromForm(),
      folder_name: model.working_name,
      display_name: model.working_name,
      model_record_id: model.model_record_id,
      orientation: model.orientation_label || form.orientation,
      program_type: inferProgramType(model.model_tier),
    };

    setForm((current) => ({
      ...current,
      folder_name: nextPayload.folder_name,
      display_name: nextPayload.display_name,
      model_record_id: nextPayload.model_record_id,
      orientation: nextPayload.orientation,
      program_type: nextPayload.program_type,
    }));
    setError("");
    setMessage("");
    setBound(null);

    startTransition(async () => {
      try {
        const response = await prepareModelRecord(nextPayload);
        setPreview(response.data);
        setMessage(`Prepared preview for ${model.working_name}.`);
      } catch (nextError) {
        setPreview(null);
        setError(nextError instanceof Error ? nextError.message : "Prepare failed");
      }
    });
  }

  function handleQuickBind(model: ModelCardLite) {
    const nextPayload = {
      ...payloadFromForm(),
      folder_name: model.working_name,
      display_name: model.working_name,
      model_record_id: model.model_record_id,
      orientation: model.orientation_label || form.orientation,
      program_type: inferProgramType(model.model_tier),
    };

    setForm((current) => ({
      ...current,
      folder_name: nextPayload.folder_name,
      display_name: nextPayload.display_name,
      model_record_id: nextPayload.model_record_id,
      orientation: nextPayload.orientation,
      program_type: nextPayload.program_type,
    }));
    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        const response = await bindModelIdentity(nextPayload);
        setBound(response.data);
        setPreview(response.data);
        setModelList((current) =>
          current.map((entry) =>
            entry.model_record_id === response.data.model_record_id
              ? {
                  ...entry,
                  working_name: response.data.display_name || entry.working_name,
                  binding_status: response.data.binding_status,
                  console_access: response.data.console_access,
                  binding_record_id: response.data.binding_record_id,
                  binding_memberstack_id:
                    response.data.memberstack_id || entry.binding_memberstack_id,
                }
              : entry,
          ),
        );
        setMessage(`Persisted binding for ${model.working_name}.`);
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Bind failed");
      }
    });
  }

  function selectModel(model: ModelCardLite) {
    setForm((current) => ({
      ...current,
      folder_name: model.working_name,
      display_name: model.working_name,
      model_record_id: model.model_record_id,
      orientation: model.orientation_label || current.orientation,
      program_type: inferProgramType(model.model_tier),
    }));
    setPreview(null);
    setBound(null);
    setError("");
    setMessage(`Loaded ${model.working_name} into the binding form.`);
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      if (!form.identity_id.trim()) {
        identityInputRef.current?.focus();
        return;
      }

      memberstackInputRef.current?.focus();
    }, 120);
  }

  const canQuickBind = Boolean(form.identity_id.trim() || form.memberstack_id.trim());

  return (
    <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <section
        ref={formCardRef}
        className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(247,181,83,0.14),_transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-200/80">
              Model Binding
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-white">Bind model identity</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/60">
              ใช้หน้านี้เตรียม username จาก folder name แล้ว bind identity เข้ากับ
              model record จริง เพื่อให้ console gate คำนวณจากข้อมูลที่ persist แล้ว
            </p>
          </div>
          <StatusPill value={isPending ? "working" : "ready"} tone={isPending ? "amber" : "slate"} />
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/35">
                Existing Models
              </div>
              <div className="mt-1 text-sm text-white/60">
                เลือก model จาก Airtable เพื่อ autofill form และใช้ record id จริง
              </div>
            </div>
            <div className="text-xs text-white/40">{filteredModels.length} models</div>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-4 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            placeholder="Search model by name, tier, vibe, area..."
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              value={bindingFilter}
              onChange={(event) =>
                setBindingFilter(
                  event.target.value as "all" | "unbound" | "bound" | "needs_review",
                )
              }
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            >
              <option value="all">All binding states</option>
              <option value="unbound">Only unbound</option>
              <option value="bound">Only bound</option>
              <option value="needs_review">Only needs review</option>
            </select>

            <select
              value={consoleFilter}
              onChange={(event) =>
                setConsoleFilter(
                  event.target.value as "all" | "pending_bind" | "pending_rules" | "ready",
                )
              }
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            >
              <option value="all">All console states</option>
              <option value="pending_bind">Only pending bind</option>
              <option value="pending_rules">Only pending rules</option>
              <option value="ready">Only ready</option>
            </select>
          </div>

          <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">
            {filteredModels.map((model) => (
              <div
                key={model.model_record_id}
                onClick={() => selectModel(model)}
                className="flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-amber-300/30 hover:bg-white/[0.06]"
              >
                <div>
                  <div className="text-sm font-medium text-white">{model.working_name}</div>
                  <div className="mt-1 text-xs text-white/45">
                    {model.model_tier} • {model.orientation_label || "unknown"} •{" "}
                    {model.base_area || "no area"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill
                      value={model.binding_status || "unbound"}
                      tone={badgeToneForBinding(model.binding_status)}
                    />
                    <StatusPill
                      value={model.console_access || "pending_bind"}
                      tone={badgeToneForConsole(model.console_access)}
                    />
                  </div>
                </div>
                <div className="min-w-[172px] text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        selectModel(model);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/75 transition hover:bg-white/10"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleQuickPrepare(model);
                      }}
                      className="rounded-xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-100 transition hover:bg-sky-300/15"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={!canQuickBind || isPending}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleQuickBind(model);
                      }}
                      className="rounded-xl border border-amber-300/20 bg-amber-300/15 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Bind
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-white/35">
                    {model.binding_memberstack_id ? "memberstack linked" : "no memberstack"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel label="Folder Name" hint="ชื่อโฟลเดอร์จริงจาก Drive หรือ source catalog" />
            <input
              value={form.folder_name}
              onChange={(event) => update("folder_name", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="Boat T"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Display Name" hint="ถ้าเว้นไว้ ระบบจะใช้ folder name" />
            <input
              value={form.display_name}
              onChange={(event) => update("display_name", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="Boat T"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Model Record ID" hint="Airtable record id ของ model เดิม ถ้ามี" />
            <input
              value={form.model_record_id}
              onChange={(event) => update("model_record_id", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="rec123..."
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Identity ID" hint="identity account ที่สมัครเข้ามาแล้ว" />
            <input
              value={form.identity_id}
              onChange={(event) => update("identity_id", event.target.value)}
              ref={identityInputRef}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="idn_..."
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Memberstack ID" hint="ใส่ถ้ามี เพื่อ bind console account" />
            <input
              value={form.memberstack_id}
              onChange={(event) => update("memberstack_id", event.target.value)}
              ref={memberstackInputRef}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="mem_..."
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Orientation" hint="เก็บไว้เป็น catalog metadata" />
            <input
              value={form.orientation}
              onChange={(event) => update("orientation", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="straight"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Visibility" />
            <select
              value={form.visibility}
              onChange={(event) => update("visibility", event.target.value as FormState["visibility"])}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            >
              <option value="private">private</option>
              <option value="public">public</option>
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel label="Program Type" />
            <select
              value={form.program_type}
              onChange={(event) => update("program_type", event.target.value as FormState["program_type"])}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            >
              <option value="standard">standard</option>
              <option value="premium">premium</option>
              <option value="extreme">extreme</option>
              <option value="travel">travel</option>
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel label="Catalog Group" />
            <select
              value={form.catalog_group}
              onChange={(event) => update("catalog_group", event.target.value as FormState["catalog_group"])}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            >
              <option value="general">general</option>
              <option value="pn">pn</option>
              <option value="vip">vip</option>
              <option value="variety">variety</option>
              <option value="compcard">compcard</option>
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel label="Position Tag" />
            <select
              value={form.position_tag}
              onChange={(event) => update("position_tag", event.target.value as FormState["position_tag"])}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
            >
              <option value="unknown">unknown</option>
              <option value="top">top</option>
              <option value="bottom_flexible">bottom_flexible</option>
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel label="Rules Required" />
            <input
              value={form.rules_version_required}
              onChange={(event) => update("rules_version_required", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="private-model-work-v1"
            />
          </div>

          <div className="space-y-2">
            <FieldLabel label="Rules Ack Version" hint="ถ้ากรอกตรงกับ rules required console จะพร้อมใช้งาน" />
            <input
              value={form.rules_ack_version}
              onChange={(event) => update("rules_ack_version", event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-amber-300/60"
              placeholder="private-model-work-v1"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePrepare}
            disabled={!isReadyToBind || isPending}
            className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prepare Preview
          </button>
          <button
            type="button"
            onClick={handleBind}
            disabled={!isReadyToBind || isPending}
            className="rounded-2xl border border-amber-300/20 bg-amber-300/15 px-5 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Persist Binding
          </button>
        </div>

        {message ? (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/35">Prepared Record</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Binding result</h2>
          </div>
          {currentRecord ? (
            <div className="flex flex-wrap gap-2">
              <StatusPill
                value={currentRecord.binding_status}
                tone={currentRecord.binding_status === "bound" ? "emerald" : "amber"}
              />
              <StatusPill
                value={currentRecord.console_access}
                tone={currentRecord.console_access === "ready" ? "emerald" : "sky"}
              />
            </div>
          ) : null}
        </div>

        {currentRecord ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldValue label="Model ID" value={currentRecord.model_id} />
              <FieldValue label="Username" value={currentRecord.username} />
              <FieldValue label="Display Name" value={currentRecord.display_name} />
              <FieldValue label="Folder Slug" value={currentRecord.folder_slug} />
              <FieldValue label="R2 Prefix" value={currentRecord.r2_prefix} />
              <FieldValue label="Primary Image Key" value={currentRecord.primary_image_key} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FieldValue label="Visibility" value={currentRecord.visibility} />
              <FieldValue label="Program Type" value={currentRecord.program_type} />
              <FieldValue label="Catalog Group" value={currentRecord.catalog_group} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FieldValue label="Orientation" value={currentRecord.orientation} />
              <FieldValue label="Position Tag" value={currentRecord.position_tag} />
              <FieldValue label="Rules Ack" value={currentRecord.rules_ack_version || "-"} />
            </div>

            {isBoundRecord(currentRecord) ? (
              <div className="rounded-3xl border border-amber-300/15 bg-amber-300/8 p-5">
                <div className="text-xs uppercase tracking-[0.25em] text-amber-200/80">
                  Persistence
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <FieldValue label="Target" value={currentRecord.persistence_target} />
                  <FieldValue label="Binding Record ID" value={currentRecord.binding_record_id} />
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
                Preview only ตอนนี้ยังไม่เขียนลง Airtable จนกว่าจะกด Persist Binding
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-sm leading-6 text-white/45">
            กรอก folder name แล้วกด Prepare Preview เพื่อดู `username`, `model_id`,
            `console_access` ก่อน จากนั้นค่อยกด Persist Binding เพื่อบันทึกจริง
          </div>
        )}
      </section>
    </div>
  );
}
