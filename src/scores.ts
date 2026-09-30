import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface ScoreRecord {
  ts: number;
  agent: string;
  score: number;
  sessionID?: string;
  model?: string;
  task?: string;
  feedback?: string;
  /** New canonical fields (agent = orchester alias, model = "provider/model" alias). */
  orchester?: string;
  provider?: string;
  durationMs?: number;
}

export interface AgentAggregate {
  agent: string;
  count: number;
  average: number;
  last: number;
  lastAt: number;
  min: number;
  max: number;
}

interface Store {
  version: 1;
  records: ScoreRecord[];
}

function emptyStore(): Store {
  return { version: 1, records: [] };
}

export function loadStore(file: string): Store {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.records)) return emptyStore();
    return { version: 1, records: parsed.records };
  } catch {
    return emptyStore();
  }
}

function persist(file: string, store: Store): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function aggregate(records: ScoreRecord[], agent?: string): AgentAggregate[] {
  const byAgent = new Map<string, ScoreRecord[]>();
  for (const rec of records) {
    if (agent && rec.agent !== agent) continue;
    const list = byAgent.get(rec.agent) ?? [];
    list.push(rec);
    byAgent.set(rec.agent, list);
  }
  const rows: AgentAggregate[] = [];
  for (const [name, list] of byAgent) {
    const scores = list.map((r) => r.score);
    const last = list[list.length - 1];
    rows.push({
      agent: name,
      count: list.length,
      average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      last: last.score,
      lastAt: last.ts,
      min: Math.min(...scores),
      max: Math.max(...scores),
    });
  }
  // Ranking: highest average first, ties broken by more evidence, then recency.
  rows.sort((a, b) => b.average - a.average || b.count - a.count || b.lastAt - a.lastAt);
  return rows;
}

/** Split a "provider/model" (or bare "model") into its parts. First slash wins. */
export function splitModelRef(full?: string | null): { provider: string | null; modelID: string | null } {
  if (!full || typeof full !== "string") return { provider: null, modelID: null };
  const s = full.trim();
  const slash = s.indexOf("/");
  if (slash <= 0 || slash === s.length - 1) return { provider: null, modelID: s || null };
  return { provider: s.slice(0, slash), modelID: s.slice(slash + 1) };
}

/** Canonical orchester name: new `orchester` wins, legacy `agent` is the fallback. */
export function orchesterOf(rec: { orchester?: string; agent?: string }): string {
  return (rec.orchester ?? rec.agent ?? "").toString();
}

/** Canonical full model ref "provider/model" (or bare model when provider unknown). */
export function modelFullOf(rec: { model?: string; provider?: string }): string | undefined {
  if (rec.model && rec.model.includes("/")) return rec.model;
  if (rec.model && rec.provider) return `${rec.provider}/${rec.model}`;
  return rec.model;
}

export interface ModelAggregate {
  model: string;
  provider: string | null;
  modelID: string | null;
  count: number;
  averageScore: number;
  lastScore: number;
  lastAt: number;
  minScore: number;
  maxScore: number;
  avgDurationMs: number | null;
  lastDurationMs: number | null;
}

/** Per-model stats: score bands + average time of doing a task (from durationMs). */
export function aggregateModels(records: ScoreRecord[]): ModelAggregate[] {
  const byModel = new Map<string, ScoreRecord[]>();
  for (const rec of records) {
    const full = modelFullOf(rec) ?? orchesterOf(rec) ?? "(unknown)";
    const key = full || "(unknown)";
    const list = byModel.get(key) ?? [];
    list.push(rec);
    byModel.set(key, list);
  }
  const rows: ModelAggregate[] = [];
  for (const [key, list] of byModel) {
    const scores = list.map((r) => r.score);
    const last = list[list.length - 1]!;
    const durs = list.map((r) => r.durationMs).filter((d): d is number => typeof d === "number" && Number.isFinite(d) && d >= 0);
    const { provider, modelID } = splitModelRef(key.includes("/") ? key : last.provider ? `${last.provider}/${key}` : key);
    rows.push({
      model: key,
      provider,
      modelID,
      count: list.length,
      averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      lastScore: last.score,
      lastAt: last.ts,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      avgDurationMs: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
      lastDurationMs: typeof last.durationMs === "number" ? last.durationMs : null,
    });
  }
  rows.sort((a, b) => b.averageScore - a.averageScore || b.count - a.count || b.lastAt - a.lastAt);
  return rows;
}

export interface ScoreResult {
  record: ScoreRecord;
  agentStats: AgentAggregate;
  ranking: AgentAggregate[];
  storedAt: string;
}

/** Append one score and return the updated per-agent stats plus the leaderboard. */
export function recordScore(
  file: string,
  rec: Omit<ScoreRecord, "ts" | "agent"> & { ts?: number; agent?: string; orchester?: string },
): ScoreResult {
  const store = loadStore(file);
  const orchester = (rec.orchester ?? rec.agent ?? "").toString();
  const split = splitModelRef(rec.model);
  const record: ScoreRecord = {
    ts: rec.ts ?? Date.now(),
    agent: orchester,
    orchester,
    score: rec.score,
    ...(rec.sessionID !== undefined ? { sessionID: rec.sessionID } : {}),
    ...(rec.model !== undefined ? { model: rec.model } : {}),
    ...(rec.task !== undefined ? { task: rec.task } : {}),
    ...(rec.feedback !== undefined ? { feedback: rec.feedback } : {}),
    ...(rec.provider ?? split.provider ? { provider: rec.provider ?? split.provider! } : {}),
    ...(typeof rec.durationMs === "number" ? { durationMs: rec.durationMs } : {}),
  } as ScoreRecord;
  store.records.push(record);
  // Keep the file bounded so it can never grow without limit.
  if (store.records.length > 5000) store.records = store.records.slice(-5000);
  persist(file, store);

  const ranking = aggregate(store.records);
  const agentStats = ranking.find((row) => row.agent === record.agent)!;
  return { record, agentStats, ranking, storedAt: file };
}

/** Turn an absolute path into a file:// URI the prompt API accepts. */
export function toFileUri(input: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) return input;
  return pathToFileURL(path.resolve(input)).href;
}
