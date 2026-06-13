import { randomUUID } from "node:crypto";

import pg from "pg";

import { logger } from "../logger.js";
import type { DataStore } from "./store.js";
import { toSceneSummary } from "./store.js";
import type {
  OAuthProvider,
  Scene,
  SceneSummary,
  User,
} from "./types.js";

/**
 * Production Postgres implementation of {@link DataStore}. The schema is created
 * on {@link init} if it does not exist, so no separate migration step is needed
 * for a fresh deployment.
 */
export class PostgresStore implements DataStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      // Most managed Postgres providers require TLS; allow self-signed.
      ssl: /sslmode=require/.test(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        plan TEXT NOT NULL DEFAULT 'free',
        subscription_status TEXT NOT NULL DEFAULT 'none',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        current_period_end TIMESTAMPTZ,
        google_id TEXT,
        github_id TEXT
      );
      CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS scenes_user_id_idx ON scenes(user_id);
      CREATE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id);
      CREATE INDEX IF NOT EXISTS users_github_id_idx ON users(github_id);
    `);
    logger.info("Postgres schema ready");
  }

  private static rowToUser(row: Record<string, unknown>): User {
    const iso = (v: unknown): string =>
      v instanceof Date ? v.toISOString() : String(v);
    return {
      id: row.id as string,
      email: row.email as string,
      passwordHash: (row.password_hash as string | null) ?? undefined,
      name: row.name as string,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      plan: row.plan as User["plan"],
      subscriptionStatus: row.subscription_status as User["subscriptionStatus"],
      stripeCustomerId: (row.stripe_customer_id as string | null) ?? undefined,
      stripeSubscriptionId:
        (row.stripe_subscription_id as string | null) ?? undefined,
      currentPeriodEnd: row.current_period_end
        ? iso(row.current_period_end)
        : undefined,
      googleId: (row.google_id as string | null) ?? undefined,
      githubId: (row.github_id as string | null) ?? undefined,
    };
  }

  private static rowToScene(row: Record<string, unknown>): Scene {
    const iso = (v: unknown): string =>
      v instanceof Date ? v.toISOString() : String(v);
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      data: row.data ?? null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private async findUserWhere(
    column: string,
    value: string,
  ): Promise<User | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM users WHERE ${column} = $1 LIMIT 1`,
      [value],
    );
    return rows[0] ? PostgresStore.rowToUser(rows[0]) : undefined;
  }

  findUserByEmail(email: string): Promise<User | undefined> {
    return this.findUserWhere("email", email.trim().toLowerCase());
  }

  findUserById(id: string): Promise<User | undefined> {
    return this.findUserWhere("id", id);
  }

  findUserByStripeCustomerId(customerId: string): Promise<User | undefined> {
    return this.findUserWhere("stripe_customer_id", customerId);
  }

  findUserByProvider(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<User | undefined> {
    const column = provider === "google" ? "google_id" : "github_id";
    return this.findUserWhere(column, providerId);
  }

  async createUser(input: {
    email: string;
    passwordHash?: string;
    name: string;
    googleId?: string;
    githubId?: string;
  }): Promise<User> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO users (id, email, password_hash, name, google_id, github_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        id,
        input.email.trim().toLowerCase(),
        input.passwordHash ?? null,
        input.name,
        input.googleId ?? null,
        input.githubId ?? null,
      ],
    );
    return PostgresStore.rowToUser(rows[0]);
  }

  async updateUser(
    id: string,
    patch: Partial<User>,
  ): Promise<User | undefined> {
    const columnMap: Record<string, string> = {
      email: "email",
      passwordHash: "password_hash",
      name: "name",
      plan: "plan",
      subscriptionStatus: "subscription_status",
      stripeCustomerId: "stripe_customer_id",
      stripeSubscriptionId: "stripe_subscription_id",
      currentPeriodEnd: "current_period_end",
      googleId: "google_id",
      githubId: "github_id",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, column] of Object.entries(columnMap)) {
      if (key in patch) {
        sets.push(`${column} = $${i++}`);
        values.push((patch as Record<string, unknown>)[key] ?? null);
      }
    }
    sets.push(`updated_at = now()`);
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values,
    );
    return rows[0] ? PostgresStore.rowToUser(rows[0]) : undefined;
  }

  async countUsers(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM users`,
    );
    return rows[0].count as number;
  }

  async listScenes(userId: string): Promise<SceneSummary[]> {
    const { rows } = await this.pool.query(
      `SELECT id, name, created_at, updated_at FROM scenes
       WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId],
    );
    return rows.map((row) => toSceneSummary(PostgresStore.rowToScene(row)));
  }

  async countScenes(userId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM scenes WHERE user_id = $1`,
      [userId],
    );
    return rows[0].count as number;
  }

  async findScene(
    userId: string,
    sceneId: string,
  ): Promise<Scene | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM scenes WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [sceneId, userId],
    );
    return rows[0] ? PostgresStore.rowToScene(rows[0]) : undefined;
  }

  async createScene(input: {
    userId: string;
    name: string;
    data: unknown;
  }): Promise<Scene> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO scenes (id, user_id, name, data)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, input.userId, input.name, JSON.stringify(input.data ?? null)],
    );
    return PostgresStore.rowToScene(rows[0]);
  }

  async updateScene(
    userId: string,
    sceneId: string,
    patch: Partial<Pick<Scene, "name" | "data">>,
  ): Promise<Scene | undefined> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(patch.name);
    }
    if ("data" in patch) {
      sets.push(`data = $${i++}`);
      values.push(JSON.stringify(patch.data ?? null));
    }
    if (sets.length === 0) {
      return this.findScene(userId, sceneId);
    }
    sets.push(`updated_at = now()`);
    values.push(sceneId, userId);
    const { rows } = await this.pool.query(
      `UPDATE scenes SET ${sets.join(", ")}
       WHERE id = $${i++} AND user_id = $${i} RETURNING *`,
      values,
    );
    return rows[0] ? PostgresStore.rowToScene(rows[0]) : undefined;
  }

  async deleteScene(userId: string, sceneId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM scenes WHERE id = $1 AND user_id = $2`,
      [sceneId, userId],
    );
    return (rowCount ?? 0) > 0;
  }
}
