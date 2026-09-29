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

export interface ScoreResult {
  record: ScoreRecord;
  agentStats: AgentAggregate;
  ranking: AgentAggregate[];
  storedAt: string;
}

/** Append one score and return the updated per-agent stats plus the leaderboard. */
export function recordScore(file: string, rec: Omit<ScoreRecord, "ts"> & { ts?: number }): ScoreResult {
  const store = loadStore(file);
  const record: ScoreRecord = { ts: rec.ts ?? Date.now(), ...rec } as ScoreRecord;
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
