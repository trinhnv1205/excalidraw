import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { config } from "../config.js";
import { logger } from "../logger.js";
import type {
  PersistedState,
  PublicUser,
  Scene,
  SceneSummary,
  User,
} from "./types.js";

/**
 * A tiny file-backed data store with an interface that intentionally mirrors a
 * repository pattern, so it can be swapped for Postgres/Prisma later without
 * touching the route handlers.
 *
 * Writes are synchronous + atomic-ish (write then rename) which is more than
 * enough for a single-node self-hosted deployment. For multi-node / high
 * traffic, point DATABASE_URL at Postgres and replace this module.
 */

const emptyState = (): PersistedState => ({ users: [], scenes: [] });

class FileStore {
  private state: PersistedState;
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.state = this.load();
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
    // rename is atomic on POSIX filesystems
    writeFileSync(this.file, readFileSync(tmp));
  }

  findUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.state.users.find((u) => u.email === normalized);
  }

  findUserById(id: string): User | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  findUserByStripeCustomerId(customerId: string): User | undefined {
    return this.state.users.find((u) => u.stripeCustomerId === customerId);
  }

  createUser(input: {
    email: string;
    passwordHash: string;
    name: string;
  }): User {
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      plan: "free",
      subscriptionStatus: "none",
    };
    this.state.users.push(user);
    this.persist();
    return user;
  }

  updateUser(id: string, patch: Partial<User>): User | undefined {
    const user = this.findUserById(id);
    if (!user) {
      return undefined;
    }
    Object.assign(user, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return user;
  }

  countUsers(): number {
    return this.state.users.length;
  }

  // ---- Scenes ----

  listScenes(userId: string): SceneSummary[] {
    return this.state.scenes
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toSceneSummary);
  }

  countScenes(userId: string): number {
    return this.state.scenes.reduce(
      (total, s) => (s.userId === userId ? total + 1 : total),
      0,
    );
  }

  findScene(userId: string, sceneId: string): Scene | undefined {
    return this.state.scenes.find(
      (s) => s.id === sceneId && s.userId === userId,
    );
  }

  createScene(input: { userId: string; name: string; data: unknown }): Scene {
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

  updateScene(
    userId: string,
    sceneId: string,
    patch: Partial<Pick<Scene, "name" | "data">>,
  ): Scene | undefined {
    const scene = this.findScene(userId, sceneId);
    if (!scene) {
      return undefined;
    }
    Object.assign(scene, patch, { updatedAt: new Date().toISOString() });
    this.persist();
    return scene;
  }

  deleteScene(userId: string, sceneId: string): boolean {
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

export const store = new FileStore(config.storage.dataFile);

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
