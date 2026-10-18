/**
 * In-memory stand-ins for the parts of the Firebase Admin SDK the medal floor
 * uses: Firestore documents, queries, transactions and batches, the Realtime
 * Database's refs, multi-path updates and transactions, and ID token checks.
 * Nothing here talks to a network; no real project, account or token is used.
 */

type Data = Record<string, unknown>;

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

const isPlain = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

function fieldAt(data: Data, path: string): unknown {
  let at: unknown = data;
  for (const part of path.split('.')) {
    if (!isPlain(at)) return undefined;
    at = at[part];
  }
  return at;
}

function setField(data: Data, path: string, value: unknown): void {
  const parts = path.split('.');
  let at = data;
  for (const part of parts.slice(0, -1)) {
    if (!isPlain(at[part])) at[part] = {};
    at = at[part] as Data;
  }
  at[parts[parts.length - 1]] = value;
}

/** As Firestore does: a field whose value is `undefined` is refused (it is not a value), wherever it is in the document. */
function refuseUndefined(value: unknown, path = ''): void {
  if (value === undefined) throw new Error(`fake Firestore: Cannot use "undefined" as a Firestore value (found in field "${path}")`);
  if (Array.isArray(value)) value.forEach((item, index) => refuseUndefined(item, `${path}.${index}`));
  else if (isPlain(value)) for (const [key, field] of Object.entries(value)) refuseUndefined(field, path ? `${path}.${key}` : key);
}

function deepMerge(into: Data, from: Data): Data {
  const out: Data = { ...into };
  for (const [key, value] of Object.entries(from)) out[key] = isPlain(value) && isPlain(out[key]) ? deepMerge(out[key] as Data, value) : value;
  return out;
}

export class FakeSnapshot {
  constructor(
    readonly ref: FakeDocRef,
    private readonly stored: Data | undefined,
  ) {}

  get id(): string {
    return this.ref.id;
  }

  get exists(): boolean {
    return this.stored !== undefined;
  }

  data(): Data | undefined {
    return clone(this.stored);
  }
}

export class FakeDocRef {
  constructor(
    readonly db: FakeFirestore,
    readonly path: string,
  ) {}

  get id(): string {
    return this.path.split('/').pop() ?? '';
  }

  collection(name: string): FakeQuery {
    return new FakeQuery(this.db, `${this.path}/${name}`);
  }

  snapshot(): FakeSnapshot {
    return new FakeSnapshot(this, this.db.docs.get(this.path));
  }

  async get(): Promise<FakeSnapshot> {
    this.db.reads += 1;
    return this.snapshot();
  }

  async set(data: Data, options?: { merge?: boolean }): Promise<void> {
    refuseUndefined(data);
    this.db.write(this, 'set', data, options);
  }

  async update(data: Data): Promise<void> {
    refuseUndefined(data);
    this.db.write(this, 'update', data);
  }

  async delete(): Promise<void> {
    this.db.write(this, 'delete');
  }
}

interface Filter {
  field: string;
  op: '==';
  value: unknown;
}

export class FakeQuery {
  constructor(
    readonly db: FakeFirestore,
    readonly path: string,
    private readonly filters: Filter[] = [],
    private readonly order: { field: string; direction: 'asc' | 'desc' } | null = null,
    private readonly count = Number.POSITIVE_INFINITY,
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.db, `${this.path}/${id}`);
  }

  where(field: string, op: '==', value: unknown): FakeQuery {
    if (op !== '==') throw new Error(`fake Firestore: unsupported operator ${op}`);
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.order, this.count);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
    return new FakeQuery(this.db, this.path, this.filters, { field, direction }, this.count);
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.db, this.path, this.filters, this.order, count);
  }

  async get(): Promise<{ docs: FakeSnapshot[]; empty: boolean; size: number }> {
    let found = [...this.db.docs.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`) && !path.slice(this.path.length + 1).includes('/'))
      .map(([path, data]) => ({ ref: new FakeDocRef(this.db, path), data }));
    for (const filter of this.filters) found = found.filter(({ data }) => fieldAt(data, filter.field) === filter.value);
    if (this.order) {
      const { field, direction } = this.order;
      // As in Firestore, a document without the field is not in a query ordered by it.
      found = found.filter(({ data }) => fieldAt(data, field) !== undefined);
      found.sort((a, b) => {
        const x = fieldAt(a.data, field) as number;
        const y = fieldAt(b.data, field) as number;
        return direction === 'desc' ? y - x : x - y;
      });
    }
    const docs = found.slice(0, this.count).map(({ ref, data }) => new FakeSnapshot(ref, data));
    this.db.reads += docs.length;
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

type Write = { ref: FakeDocRef; kind: 'set' | 'update' | 'delete'; data?: Data; options?: { merge?: boolean } };

/** A transaction that read a document another transaction has written since: it is run again, as Firestore runs it. */
class Contention extends Error {}

export class FakeTransaction {
  private readonly writes: Write[] = [];
  /** The version of every document read, as it was read. */
  private readonly seen = new Map<string, number>();

  constructor(private readonly db: FakeFirestore) {}

  async get(ref: FakeDocRef): Promise<FakeSnapshot> {
    // As in Firestore: every read of a transaction comes before its writes.
    if (this.writes.length > 0) throw new Error('fake Firestore: a transaction read after a write');
    this.seen.set(ref.path, this.db.versionOf(ref.path));
    // A read takes a moment, as it does over the network: another transaction can run in between.
    await Promise.resolve();
    return ref.get();
  }

  set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }): this {
    refuseUndefined(data);
    this.writes.push({ ref, kind: 'set', data: clone(data), options });
    return this;
  }

  update(ref: FakeDocRef, data: Data): this {
    refuseUndefined(data);
    this.writes.push({ ref, kind: 'update', data: clone(data) });
    return this;
  }

  delete(ref: FakeDocRef): this {
    this.writes.push({ ref, kind: 'delete' });
    return this;
  }

  commit(): void {
    // Checked first, then applied: a write that fails leaves nothing of the transaction behind.
    for (const [path, version] of this.seen) if (this.db.versionOf(path) !== version) throw new Contention(`fake Firestore: ${path} changed under the transaction`);
    for (const write of this.writes) if (write.kind === 'update' && !this.db.docs.has(write.ref.path)) throw new Error(`fake Firestore: NOT_FOUND ${write.ref.path}`);
    for (const write of this.writes) this.db.write(write.ref, write.kind, write.data, write.options);
  }
}

export class FakeFirestore {
  readonly docs = new Map<string, Data>();
  /** How many times each document has been written: what a transaction checks its reads against. */
  private readonly versions = new Map<string, number>();
  reads = 0;
  writes = 0;
  /** Transactions run again because what they read had changed. */
  retries = 0;
  /** Set to make every call fail, as a store that is down does. */
  failing: Error | null = null;

  collection(name: string): FakeQuery {
    this.check();
    return new FakeQuery(this, name);
  }

  doc(path: string): FakeDocRef {
    return new FakeDocRef(this, path);
  }

  async runTransaction<T>(run: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    this.check();
    for (let attempt = 1; ; attempt += 1) {
      const tx = new FakeTransaction(this);
      const result = await run(tx);
      try {
        tx.commit();
        return result;
      } catch (error) {
        // As Firestore: tried again from the start, on what is there now, up to five times.
        if (!(error instanceof Contention) || attempt >= 5) throw error;
        this.retries += 1;
      }
    }
  }

  versionOf(path: string): number {
    return this.versions.get(path) ?? 0;
  }

  batch() {
    const writes: Write[] = [];
    return {
      set: (ref: FakeDocRef, data: Data) => {
        refuseUndefined(data);
        writes.push({ ref, kind: 'set', data: clone(data) });
      },
      update: (ref: FakeDocRef, data: Data) => {
        refuseUndefined(data);
        writes.push({ ref, kind: 'update', data: clone(data) });
      },
      delete: (ref: FakeDocRef) => writes.push({ ref, kind: 'delete' }),
      commit: async () => {
        for (const write of writes) this.write(write.ref, write.kind, write.data);
      },
    };
  }

  write(ref: FakeDocRef, kind: Write['kind'], data?: Data, options?: { merge?: boolean }): void {
    this.writes += 1;
    this.versions.set(ref.path, this.versionOf(ref.path) + 1);
    if (kind === 'delete') {
      this.docs.delete(ref.path);
      return;
    }
    const was = this.docs.get(ref.path);
    if (kind === 'update') {
      if (!was) throw new Error(`fake Firestore: NOT_FOUND ${ref.path}`);
      const next = clone(was);
      for (const [path, value] of Object.entries(data ?? {})) setField(next, path, clone(value));
      this.docs.set(ref.path, next);
      return;
    }
    this.docs.set(ref.path, options?.merge && was ? deepMerge(was, clone(data ?? {})) : clone(data ?? {}));
  }

  /** The document at `path`, as stored. */
  read(path: string): Data | undefined {
    return clone(this.docs.get(path));
  }

  private check(): void {
    if (this.failing) throw this.failing;
  }
}

// ── Realtime Database ────────────────────────────────────────────────────────

const parts = (path: string): string[] => path.split('/').filter(Boolean);

export class FakeRtdbRef {
  constructor(
    private readonly rtdb: FakeRtdb,
    readonly path: string,
  ) {}

  get key(): string | null {
    return parts(this.path).pop() ?? null;
  }

  async get(): Promise<{ val: () => unknown; exists: () => boolean }> {
    const value = clone(this.rtdb.at(this.path));
    return { val: () => (value === undefined ? null : value), exists: () => value !== undefined && value !== null };
  }

  async set(value: unknown): Promise<void> {
    this.rtdb.put(this.path, value);
  }

  async remove(): Promise<void> {
    this.rtdb.put(this.path, null);
  }

  async update(values: Record<string, unknown>): Promise<void> {
    for (const [path, value] of Object.entries(values)) this.rtdb.put(`${this.path}/${path}`, value);
  }

  async transaction(update: (value: unknown) => unknown): Promise<{ committed: boolean; snapshot: { val: () => unknown } }> {
    const next = update(clone(this.rtdb.at(this.path)) ?? null);
    if (next === undefined) return { committed: false, snapshot: { val: () => clone(this.rtdb.at(this.path)) ?? null } };
    this.rtdb.put(this.path, next);
    return { committed: true, snapshot: { val: () => clone(next) } };
  }
}

export class FakeRtdb {
  root: Data = {};

  ref(path = ''): FakeRtdbRef {
    return new FakeRtdbRef(this, path);
  }

  at(path: string): unknown {
    let at: unknown = this.root;
    for (const part of parts(path)) {
      if (!isPlain(at)) return undefined;
      at = at[part];
    }
    return at;
  }

  /** Writes a value at a path; null removes it, and a branch left empty goes with it, as in the Realtime Database. */
  put(path: string, value: unknown): void {
    const keys = parts(path);
    if (keys.length === 0) {
      this.root = isPlain(value) ? clone(value) : {};
      return;
    }
    const trail: Data[] = [this.root];
    let at = this.root;
    for (const key of keys.slice(0, -1)) {
      if (!isPlain(at[key])) at[key] = {};
      at = at[key] as Data;
      trail.push(at);
    }
    const last = keys[keys.length - 1];
    if (value === null || value === undefined) delete at[last];
    else at[last] = clone(value);
    for (let index = trail.length - 1; index > 0; index -= 1) {
      if (Object.keys(trail[index]).length === 0) delete trail[index - 1][keys[index - 1]];
    }
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Made-up players: each token stands for an account that exists only in these tests. */
export const FAKE_ACCOUNTS = {
  'fake-token-ann': { uid: 'test-uid-ann', firebase: { sign_in_provider: 'password' } },
  'fake-token-ben': { uid: 'test-uid-ben', firebase: { sign_in_provider: 'google.com' } },
  'fake-token-guest': { uid: 'test-uid-guest', firebase: { sign_in_provider: 'anonymous' } },
  'fake-token-owner': { uid: 'test-uid-owner', admin: true, firebase: { sign_in_provider: 'google.com' } },
} as const;

export type FakeToken = keyof typeof FAKE_ACCOUNTS;

export const fakeAuth = () => ({
  verifyIdToken: async (token: string) => {
    const account = (FAKE_ACCOUNTS as Record<string, unknown>)[token];
    if (!account) throw new Error('fake auth: not a token of these tests');
    return clone(account);
  },
});
