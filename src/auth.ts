import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type http from "node:http";
import {
  createAuthSession,
  deleteAuthSession,
  getAuthSession,
  getUserByUsername,
  insertUser,
  userCount,
} from "./db.js";

export const SESSION_COOKIE = "ocmcp_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts[0] !== "scrypt" || parts.length !== 3) return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function ensureDefaultUser(): void {
  if (userCount() > 0) return;
  const username = process.env.WEBUI_USERNAME ?? "admin";
  const email = process.env.WEBUI_EMAIL ?? "admin@local";
  const password = process.env.WEBUI_PASSWORD ?? "admin";
  insertUser(username, email, hashPassword(password));
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function sessionToken(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export function readSessionUsername(req: http.IncomingMessage): string | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = getAuthSession(token);
  if (!row || row.expiresAt < Date.now()) {
    if (row) deleteAuthSession(token);
    return null;
  }
  return row.username;
}

export function login(username: string, password: string): { token: string; username: string; email: string } | null {
  const user = getUserByUsername(username.trim());
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const token = sessionToken();
  createAuthSession(token, user.username, Date.now() + SESSION_MS);
  return { token, username: user.username, email: user.email };
}

export function logout(token: string | undefined): void {
  if (token) deleteAuthSession(token);
}

export function sessionCookieHeader(token: string): string {
  const maxAge = Math.floor(SESSION_MS / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function publicAuthPaths(): Set<string> {
  return new Set(["/login", "/api/auth/login"]);
}
