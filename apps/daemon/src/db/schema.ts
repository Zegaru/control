import { sql } from 'drizzle-orm'
import {
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type {
  DetectedStack,
  GroupStep,
} from '@control/shared'

// Booleans are stored as 0/1 integers (SQLite has no native boolean).

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().unique(),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  icon: text('icon'),
  createdAt: integer('created_at').notNull(),
  lastScanAt: integer('last_scan_at'),
  composeProjects: text('compose_projects', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .default(sql`'[]'`),
})

export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  relPath: text('rel_path').notNull(),
  name: text('name').notNull(),
  detectedStacks: text('detected_stacks', { mode: 'json' })
    .notNull()
    .$type<DetectedStack[]>()
    .default(sql`'[]'`),
  hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
})

export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  moduleId: text('module_id').notNull(),
  naturalKey: text('natural_key').notNull(),
  name: text('name').notNull(),
  command: text('command').notNull(),
  cwd: text('cwd'),
  type: text('type').notNull(),
  source: text('source').notNull(),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
  primary: integer('primary', { mode: 'boolean' }).notNull().default(false),
  envOverrides: text('env_overrides', { mode: 'json' }).$type<
    Record<string, string>
  >(),
  portHint: integer('port_hint'),
  healthUrl: text('health_url'),
})

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  actionId: text('action_id').notNull(),
  pid: integer('pid'),
  status: text('status').notNull(),
  startedAt: integer('started_at').notNull(),
  exitedAt: integer('exited_at'),
  exitCode: integer('exit_code'),
  ports: text('ports', { mode: 'json' }).notNull().$type<number[]>().default(sql`'[]'`),
  logFile: text('log_file'),
})

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  name: text('name').notNull(),
  steps: text('steps', { mode: 'json' }).notNull().$type<GroupStep[]>().default(sql`'[]'`),
})

/** Idempotent DDL run at boot (M0 uses this in place of drizzle-kit migrations). */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  favorite INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  created_at INTEGER NOT NULL,
  last_scan_at INTEGER,
  compose_projects TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  detected_stacks TEXT NOT NULL DEFAULT '[]',
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_modules_project ON modules(project_id);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  natural_key TEXT NOT NULL,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  cwd TEXT,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  "primary" INTEGER NOT NULL DEFAULT 0,
  env_overrides TEXT,
  port_hint INTEGER,
  health_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_actions_module ON actions(module_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_natkey ON actions(module_id, natural_key);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  pid INTEGER,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  exited_at INTEGER,
  exit_code INTEGER,
  ports TEXT NOT NULL DEFAULT '[]',
  log_file TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_action ON runs(action_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]'
);
`
