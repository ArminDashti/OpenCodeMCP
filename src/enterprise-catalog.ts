import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** One model entry from the OpenCode console provider catalog. */
export interface CatalogModelDef {
  name?: string;
  family?: string;
  release_date?: string;
  status?: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  interleaved?: boolean | { field?: string };
  cost?: Record<string, unknown>;
  limit?: { context?: number; input?: number; output?: number };
  provider?: { npm?: string; api?: string };
  disabled?: boolean;
}

export interface CatalogProviderDef {
  name?: string;
  npm?: string;
  api?: string;
  env?: string[];
  options?: {
    apiKey?: string;
    headers?: Record<string, string>;
  };
  whitelist?: string[];
  models?: Record<string, CatalogModelDef>;
}

export interface EnterpriseProviderDoc {
  enterprise?: { url?: string };
  provider?: {
    opencode?: CatalogProviderDef;
    "opencode-go"?: CatalogProviderDef;
  };
}

let cached: EnterpriseProviderDoc | null | undefined;

function catalogPaths(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.join(here, "data", "enterprise-providers.json"),
    path.join(here, "..", "src", "data", "enterprise-providers.json"),
    path.join(process.cwd(), "src", "data", "enterprise-providers.json"),
  ];
}

/** Load the bundled OpenCode console provider snapshot (if present). */
export function loadEnterpriseDoc(): EnterpriseProviderDoc | null {
  if (cached !== undefined) return cached;
  for (const file of catalogPaths()) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      cached = JSON.parse(raw) as EnterpriseProviderDoc;
      return cached;
    } catch {
      /* try next path */
    }
  }
  cached = null;
  return null;
}

export function enterpriseConsoleUrl(doc = loadEnterpriseDoc()): string | null {
  return doc?.enterprise?.url ?? null;
}

export function catalogProvider(doc: EnterpriseProviderDoc | null, providerId: string): CatalogProviderDef | undefined {
  return doc?.provider?.[providerId as keyof NonNullable<EnterpriseProviderDoc["provider"]>];
}

export function whitelistFor(doc: EnterpriseProviderDoc | null, providerId: string): Set<string> | null {
  const list = catalogProvider(doc, providerId)?.whitelist;
  if (!list?.length) return null;
  return new Set(list);
}

function catalogEntry(
  doc: EnterpriseProviderDoc | null,
  providerId: string,
  modelId: string,
): CatalogModelDef | undefined {
  return catalogProvider(doc, providerId)?.models?.[modelId];
}

function isCatalogEnabled(
  doc: EnterpriseProviderDoc | null,
  providerId: string,
  modelId: string,
  apiEnabled: boolean,
): boolean {
  const wl = whitelistFor(doc, providerId);
  const entry = catalogEntry(doc, providerId, modelId);
  if (entry?.disabled) return false;
  if (wl) return wl.has(modelId) && apiEnabled;
  return apiEnabled;
}

function modalitiesToCaps(mod?: CatalogModelDef["modalities"]): {
  input?: string[];
  output?: string[];
} | null {
  if (!mod) return null;
  return { input: mod.input, output: mod.output };
}

/** Merge API model row with console catalog metadata and whitelist rules. */
export function enrichModelRow(
  m: any,
  doc: EnterpriseProviderDoc | null,
  ctx: {
    defaultKey: string | null;
    stats?: {
      count?: number;
      averageScore?: number | null;
      lastScore?: number | null;
      avgDurationMs?: number | null;
    };
    detail?: "brief" | "full";
  },
): Record<string, unknown> {
  const providerId = m.providerID as string;
  const modelId = m.id as string;
  const id = `${providerId}/${modelId}`;
  const cat = catalogEntry(doc, providerId, modelId);
  const apiEnabled = m.enabled !== false;
  const enabled = isCatalogEnabled(doc, providerId, modelId, apiEnabled);
  const caps = m.capabilities ?? {};
  const catModalities = modalitiesToCaps(cat?.modalities);

  return {
    id,
    provider: providerId,
    providerID: providerId,
    model: modelId,
    modelID: modelId,
    name: cat?.name ?? m.name,
    family: cat?.family ?? m.family ?? null,
    context: cat?.limit?.context ?? m.limit?.context ?? null,
    maxOutput: cat?.limit?.output ?? m.limit?.output ?? null,
    tools: cat?.tool_call ?? caps.tools ?? null,
    input: catModalities?.input ?? caps.input ?? null,
    output: catModalities?.output ?? caps.output ?? null,
    variants: (m.variants ?? []).map((v: any) => v.id),
    status: cat?.status ?? m.status ?? null,
    enabled,
    inWhitelist: whitelistFor(doc, providerId)?.has(modelId) ?? null,
    isDefault: ctx.defaultKey !== null && id === ctx.defaultKey,
    scoreCount: ctx.stats?.count ?? 0,
    averageScore: ctx.stats?.averageScore ?? null,
    lastScore: ctx.stats?.lastScore ?? null,
    avgTaskMs: ctx.stats?.avgDurationMs ?? null,
    avgTaskTime: ctx.stats?.avgDurationMs ?? null,
    ...(ctx.detail === "full"
      ? {
          cost: cat?.cost ?? m.cost ?? null,
          capabilities: caps,
          package: m.package ?? null,
          released: cat?.release_date ?? m.time?.released ?? null,
          catalog: cat
            ? {
                reasoning: cat.reasoning,
                attachment: cat.attachment,
                temperature: cat.temperature,
                providerRoute: cat.provider ?? null,
              }
            : null,
        }
      : {}),
  };
}

/** Build model rows from the catalog when the API returns nothing for a provider. */
export function catalogFallbackRows(
  providerId: string,
  doc: EnterpriseProviderDoc | null,
  ctx: {
    defaultKey: string | null;
    statsByModel: Map<string, any>;
    detail?: "brief" | "full";
  },
): Record<string, unknown>[] {
  const prov = catalogProvider(doc, providerId);
  if (!prov?.whitelist?.length) return [];
  const rows: Record<string, unknown>[] = [];
  for (const modelId of prov.whitelist) {
    const cat = prov.models?.[modelId];
    if (cat?.disabled) continue;
    const fake = {
      providerID: providerId,
      id: modelId,
      name: cat?.name,
      family: cat?.family,
      limit: cat?.limit,
      capabilities: {
        tools: cat?.tool_call,
        input: cat?.modalities?.input,
        output: cat?.modalities?.output,
      },
      cost: cat?.cost,
      status: cat?.status,
      enabled: true,
      variants: [],
    };
    rows.push(
      enrichModelRow(fake, doc, {
        defaultKey: ctx.defaultKey,
        stats: ctx.statsByModel.get(`${providerId}/${modelId}`),
        detail: ctx.detail,
      }),
    );
  }
  return rows;
}

export const CATALOG_PROVIDER_IDS = ["opencode", "opencode-go"] as const;
