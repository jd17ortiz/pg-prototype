import fs from "fs";
import path from "path";
import os from "os";
import type {
  SitesStore,
  UsersStore,
  TemplatesStore,
  GuidelinesStore,
  AuditStore,
  AuditEvent,
  ComplianceStore,
} from "./types";
import type { ImportsStore } from "./migration/types";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

function dataPath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readStore<T>(name: string, defaultVal: T): T {
  const p = dataPath(name);
  if (!fs.existsSync(p)) return defaultVal;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return defaultVal;
  }
}

/** Atomic write: write to temp file then rename */
function writeStore<T>(name: string, data: T): void {
  const p = dataPath(name);
  const tmp = path.join(os.tmpdir(), `pg-${name}-${Date.now()}.json`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

// ─── Sites ────────────────────────────────────────────────────────────────────
export function readSites(): SitesStore {
  return readStore<SitesStore>("sites", { sites: [] });
}

export function writeSites(store: SitesStore): void {
  writeStore("sites", store);
}

// ─── Users ────────────────────────────────────────────────────────────────────
export function readUsers(): UsersStore {
  return readStore<UsersStore>("users", { users: [] });
}

export function writeUsers(store: UsersStore): void {
  writeStore("users", store);
}

// ─── Templates ────────────────────────────────────────────────────────────────
export function readTemplates(): TemplatesStore {
  return readStore<TemplatesStore>("templates", { templates: [], versions: [] });
}

export function writeTemplates(store: TemplatesStore): void {
  writeStore("templates", store);
}

// ─── Guidelines ───────────────────────────────────────────────────────────────
export function readGuidelines(): GuidelinesStore {
  return readStore<GuidelinesStore>("guidelines", {
    guidelines: [],
    versions: [],
    approvals: [],
  });
}

export function writeGuidelines(store: GuidelinesStore): void {
  writeStore("guidelines", store);
}

// ─── Compliance ───────────────────────────────────────────────────────────────
export function readCompliance(): ComplianceStore {
  return readStore<ComplianceStore>("compliance", { tasks: [] });
}

export function writeCompliance(store: ComplianceStore): void {
  writeStore("compliance", store);
}

// ─── Audit ────────────────────────────────────────────────────────────────────
export function readAudit(): AuditStore {
  return readStore<AuditStore>("audit", { events: [] });
}

export function appendAudit(event: AuditEvent): void {
  const store = readAudit();
  store.events.push(event);
  writeStore("audit", store);
}

// ─── Migration Imports ────────────────────────────────────────────────────────
export function readImports(): ImportsStore {
  return readStore<ImportsStore>("imports", { runs: [] });
}

export function writeImports(store: ImportsStore): void {
  // Use same-dir temp to avoid cross-device rename on Windows
  const dest = dataPath("imports");
  const tmp  = path.join(DATA_DIR, `.tmp-imports-${Date.now()}.json`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmp, dest);
}

// ─── Uploads ──────────────────────────────────────────────────────────────────
export function ensureUploadsDir(): void {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function nowStamp(): string {
  return new Date().toISOString();
}

export function versionStamp(): string {
  return Date.now().toString();
}
