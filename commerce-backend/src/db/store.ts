import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  OAuthProvider,
  PersistedState,
  PublicUser,
  Scene,
  SceneSummary,
  User,
} from "./types.js";

/**
 * Storage abstraction. Two interchangeable implementations are provided:
 *
 *  - {@link FileStore}      – zero-dependency JSON file (default, single-node).
 *  - {@link PostgresStore}  – production-grade, selected when DATABASE_URL is set.
 *
 * All methods are async so the same interface fits both a synchronous file
 * store and a network-backed database.
 */
export interface DataStore {
  init(): Promise<void>;

  findUserByEmail(email: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  findUserByStripeCustomerId(customerId: string): Promise<User | undefined>;
  findUserByProvider(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<User | undefined>;
  createUser(input: {
    email: string;
    passwordHash?: string;
    name: string;
    googleId?: string;
    githubId?: string;
  }): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<User | undefined>;
  countUsers(): Promise<number>;

  listScenes(userId: string): Promise<SceneSummary[]>;
  countScenes(userId: string): Promise<number>;
  findScene(userId: string, sceneId: string): Promise<Scene | undefined>;
  createScene(input: {
    userId: string;
    name: string;
    data: unknown;
  }): Promise<Scene>;
  updateScene(
    userId: string,
    sceneId: string,
    patch: Partial<Pick<Scene, "name" | "data">>,
  ): Promise<Scene | undefined>;
  deleteScene(userId: string, sceneId: string): Promise<boolean>;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// ---------------------------------------------------------------------------
// File-backed store
// ---------------------------------------------------------------------------

const emptyState = (): PersistedState => ({ users: [], scenes: [] });

class FileStore implements DataStore {
  private state: PersistedState;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.state = this.load();
  }

  async init(): Promise<void> {
    // Nothing to do – state is loaded in the constructor.
  }

  private load(): PersistedState {
    try {
      if (existsSync(this.file)) {
        const raw = readFileSync(this.file, "utf8");
        const parsed = JSON.parse(raw) as PersistedState;
        return { users: parsed.users ?? [], scenes: parsed.scenes ?? [] };
      }
    } catch (error) {
      logger.error("Failed to load data file, starting empty", {
        file: this.file,
        error: (error as Error).message,
      });
    }
    return emptyState();
  }

  private persist(): void {
    const dir = dirname(this.file);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    writeFileSync(this.file, readFileSync(tmp));
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const normalized = normalizeEmail(email);
    return this.state.users.find((u) => u.email === normalized);
  }

  async findUserById(id: string): Promise<User | undefined> {
    return this.state.users.find((u) => u.id === id);
  }

  async findUserByStripeCustomerId(
    customerId: string,
  ): Promise<User | undefined> {
    return this.state.users.find((u) => u.stripeCustomerId === customerId);
  }

  async findUserByProvider(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<User | undefined> {
    const key = provider === "google" ? "googleId" : "githubId";
    return this.state.users.find((u) => u[key] === providerId);
  }

  async createUser(input: {
    email: string;
    passwordHash?: string;
    name: string;
    googleId?: string;
    githubId?: string;
  }): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email: normalizeEmail(input.email),
      passwordHash: input.passwordHash,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      plan: "free",
      subscriptionStatus: "none",
      googleId: input.googleId,
      githubId: input.githubId,
    };
    this.state.users.push(user);
    this.persist();
    return user;
  }

  async updateUser(
    id: string,
    patch: Partial<User>,
  ): Promise<User | undefined> {
    const user = this.state.users.find((u) => u.id === id);
    if (!user) {
      return undefined;
    }
    Object.assign(user, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return user;
  }

  async countUsers(): Promise<number> {
    return this.state.users.length;
  }

  async listScenes(userId: string): Promise<SceneSummary[]> {
    return this.state.scenes
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toSceneSummary);
  }

  async countScenes(userId: string): Promise<number> {
    return this.state.scenes.reduce(
      (total, s) => (s.userId === userId ? total + 1 : total),
      0,
    );
  }

  async findScene(
    userId: string,
    sceneId: string,
  ): Promise<Scene | undefined> {
    return this.state.scenes.find(
      (s) => s.id === sceneId && s.userId === userId,
    );
  }

  async createScene(input: {
    userId: string;
    name: string;
    data: unknown;
  }): Promise<Scene> {
    const now = new Date().toISOString();
    const scene: Scene = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      data: input.data,
      createdAt: now,
      updatedAt: now,
    };
    this.state.scenes.push(scene);
    this.persist();
    return scene;
  }

  async updateScene(
    userId: string,
    sceneId: string,
    patch: Partial<Pick<Scene, "name" | "data">>,
  ): Promise<Scene | undefined> {
    const scene = this.state.scenes.find(
      (s) => s.id === sceneId && s.userId === userId,
    );
    if (!scene) {
      return undefined;
    }
    Object.assign(scene, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return scene;
  }

  async deleteScene(userId: string, sceneId: string): Promise<boolean> {
    const index = this.state.scenes.findIndex(
      (s) => s.id === sceneId && s.userId === userId,
    );
    if (index === -1) {
      return false;
    }
    this.state.scenes.splice(index, 1);
    this.persist();
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  plan: user.plan,
  subscriptionStatus: user.subscriptionStatus,
  currentPeriodEnd: user.currentPeriodEnd,
  createdAt: user.createdAt,
});

export const toSceneSummary = (scene: Scene): SceneSummary => ({
  id: scene.id,
  name: scene.name,
  createdAt: scene.createdAt,
  updatedAt: scene.updatedAt,
});

// ---------------------------------------------------------------------------
// Store selection
// ---------------------------------------------------------------------------

const createStore = async (): Promise<DataStore> => {
  if (config.storage.databaseUrl) {
    // Lazy import so `pg` is only required when Postgres is actually used.
    const { PostgresStore } = await import("./postgres.js");
    const pgStore = new PostgresStore(config.storage.databaseUrl);
    await pgStore.init();
    logger.info("Using Postgres store");
    return pgStore;
  }
  const fileStore = new FileStore(config.storage.dataFile);
  await fileStore.init();
  logger.info("Using file store", { file: config.storage.dataFile });
  return fileStore;
};

export const store: DataStore = await createStore();
