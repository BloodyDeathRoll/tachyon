// The Free plan allows 50 subrequests per invocation, and "any request a Worker makes
// using the Fetch API or to Cloudflare services like R2, KV, or D1" is one
// (docs/CLOUDFLARE-PLAN.md, limits). The cron's one invocation a minute serves every
// client, so it counts its D1, R2 and fetch calls through these wrappers and stops at
// BUDGET; what is left waits for the next minute.

export const BUDGET = 40; // the plan's margin under 50

export class Budget {
  used = 0;
  readonly limit: number;
  constructor(limit = BUDGET) {
    this.limit = limit;
  }
  spend(n = 1): void {
    this.used += n;
    // never thrown: stopping mid-step could leave a half-made post; the log says it ran over
    if (this.used === this.limit + 1) console.warn(`subrequest budget passed: ${this.used} > ${this.limit}`);
  }
  get left(): number {
    return this.limit - this.used;
  }
  has(n: number): boolean {
    return this.left >= n;
  }
}

const RUNS = new Set(["run", "first", "all", "raw"]);

// the real statement behind each counting proxy: batch() hands D1 its own objects
const RAW = new WeakMap<object, D1PreparedStatement>();

function statement(s: D1PreparedStatement, b: Budget): D1PreparedStatement {
  const p = new Proxy(s, {
    get(t, k: string) {
      const v = Reflect.get(t, k) as unknown;
      if (k === "bind") return (...args: unknown[]) => statement((v as (...a: unknown[]) => D1PreparedStatement).apply(t, args), b);
      if (RUNS.has(k)) {
        return (...args: unknown[]) => {
          b.spend();
          return (v as (...a: unknown[]) => unknown).apply(t, args);
        };
      }
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
  RAW.set(p, s);
  return p;
}

/** The D1 binding, every statement run and every batch counted as one. */
export function countedDB(db: D1Database, b: Budget): D1Database {
  return new Proxy(db, {
    get(t, k: string) {
      const v = Reflect.get(t, k) as unknown;
      if (k === "prepare") return (q: string) => statement(t.prepare(q), b);
      if (k === "batch") {
        return (stmts: D1PreparedStatement[]) => {
          b.spend();
          return t.batch(stmts.map((x) => RAW.get(x) ?? x));
        };
      }
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

/** The R2 binding, every call counted as one. */
export function countedR2(r2: R2Bucket, b: Budget): R2Bucket {
  return new Proxy(r2, {
    get(t, k: string) {
      const v = Reflect.get(t, k) as unknown;
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        b.spend();
        return (v as (...a: unknown[]) => unknown).apply(t, args);
      };
    },
  });
}

export function countedFetch<F extends (...a: never[]) => unknown>(f: F, b: Budget): F {
  return ((...args: never[]) => {
    b.spend();
    return f(...args);
  }) as F;
}
