import {
  catalogFallbackRows,
  enrichModelRow,
  loadEnterpriseDoc,
  type EnterpriseProviderDoc,
} from "./enterprise-catalog.js";
import { aggregateModels, loadStore } from "./scores.js";
import { compactSession } from "./render.js";
import type { OpenCode } from "./opencode.js";

/** Format ms as YYYY-MM-DDTHH-MM-SS (dash-separated clock fields). */
export function formatCompactTimestamp(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

/** Parse YYYY-MM-DDTHH-MM-SS (or ISO with colons in the time part). */
export function parseCompactTimestamp(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.includes("T") ? raw.replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3") : raw;
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : null;
}

export function resolveDirectory(
  directories: string | string[] | null | undefined,
  fallback: string,
): string {
  if (Array.isArray(directories)) {
    const first = directories.map((d) => d?.trim()).find(Boolean);
    return first ?? fallback;
  }
  if (typeof directories === "string" && directories.trim()) return directories.trim();
  return fallback;
}

function costIsFree(cost: unknown): boolean {
  if (!cost || typeof cost !== "object") return false;
  const c = cost as Record<string, unknown>;
  const nums = [
    c.input,
    c.output,
    c.prompt,
    c.completion,
    c.cache_read,
    c.cache_write,
  ].map((v) => (v === undefined || v === null ? 0 : Number(v)));
  if (nums.some((n) => !Number.isFinite(n))) return false;
  return nums.every((n) => n === 0);
}

export function modelRowIsFree(row: Record<string, unknown>, apiModel?: any): boolean {
  if (costIsFree(row.cost)) return true;
  if (apiModel && costIsFree(apiModel.cost)) return true;
  return false;
}

export interface ModelListArgs {
  provider?: string | null;
  model?: string | null;
  onlyFreeModels?: boolean | null;
}

export async function listModelEntries(
  oc: OpenCode,
  scoresFile: string,
  args: ModelListArgs,
): Promise<{ modelId: string; free: boolean }[]> {
  const doc = loadEnterpriseDoc();
  const [models, def] = await Promise.all([oc.models(), oc.defaultModel()]);
  const defaultKey = def ? `${def.providerID}/${def.modelID ?? def.id}` : null;
  const needle = args.model?.trim().toLowerCase() || null;
  const statsByModel = new Map(
    aggregateModels(loadStore(scoresFile).records).map((s) => [s.model, s]),
  );

  let rows: Record<string, unknown>[] = models.map((m: any) => {
    const id = `${m.providerID}/${m.id}`;
    return enrichModelRow(m, doc, {
      defaultKey,
      stats: statsByModel.get(id),
      detail: "full",
    });
  });

  if (args.provider && rows.length === 0 && doc) {
    rows = catalogFallbackRows(String(args.provider), doc, {
      defaultKey,
      statsByModel,
      detail: "full",
    });
  }

  if (args.provider) rows = rows.filter((r) => r.providerID === args.provider);
  if (needle) {
    rows = rows.filter((r) =>
      [r.id, r.name ?? "", r.family ?? "", r.modelID ?? ""].some((v) =>
        String(v).toLowerCase().includes(needle!),
      ),
    );
  }

  const apiById = new Map(models.map((m: any) => [`${m.providerID}/${m.id}`, m]));
  let out = rows.map((r) => {
    const modelId = String(r.id ?? `${r.providerID}/${r.modelID}`);
    const free = modelRowIsFree(r, apiById.get(modelId));
    return { modelId, free };
  });

  if (args.onlyFreeModels) out = out.filter((r) => r.free);
  out.sort((a, b) => a.modelId.localeCompare(b.modelId));
  return out;
}

export interface SessionFilterArgs {
  fromDate?: string | null;
  toDate?: string | null;
  provider?: string | null;
  modelId?: string | null;
  harness?: string | null;
  limit?: number | null;
}

export function filterSessionIds(sessions: any[], args: SessionFilterArgs): string[] {
  const fromMs = parseCompactTimestamp(args.fromDate ?? undefined);
  const toMs = parseCompactTimestamp(args.toDate ?? undefined);
  const limit = args.limit ?? 16;
  const provider = args.provider?.trim() || null;
  const modelNeedle = args.modelId?.trim() || null;
  const harness = args.harness?.trim() || null;

  let rows = sessions.map(compactSession);
  if (fromMs != null) rows = rows.filter((s) => (Number(s.created) || 0) >= fromMs);
  if (toMs != null) rows = rows.filter((s) => (Number(s.created) || 0) <= toMs);
  if (provider) {
    rows = rows.filter((s) => {
      const m = String(s.model ?? "");
      return m.startsWith(`${provider}/`) || m === provider;
    });
  }
  if (modelNeedle) {
    rows = rows.filter((s) => {
      const m = String(s.model ?? "");
      const bare = m.includes("/") ? m.split("/").slice(1).join("/") : m;
      return m === modelNeedle || m.endsWith(`/${modelNeedle}`) || bare === modelNeedle;
    });
  }
  if (harness) rows = rows.filter((s) => String(s.agent ?? "") === harness);

  rows.sort((a, b) => (Number(b.created) || 0) - (Number(a.created) || 0));
  return rows.slice(0, limit).map((s) => String(s.id)).filter(Boolean);
}
