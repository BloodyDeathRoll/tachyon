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
  }
  get left(): number {
    return this.limit - this.used;
  }
  has(n: number): boolean {
    return this.left >= n;
  }
}

const RUNS = new Set(["run", "first", "all", "raw"]);

function statement(s: D1PreparedStatement, b: Budget): D1PreparedStatement {
  return new Proxy(s, {
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
          return t.batch(stmts);
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
