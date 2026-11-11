// Thin Instagram Graph API client (spine/publisher/graph.py, port). Every write the
// callers wrap in a journal entry. No retries here; publish.ts decides what to retry.
// The fetch function is a parameter so the tests script Meta's answers.

export const VERSION = "v26.0";
export const GRAPH = `https://graph.facebook.com/${VERSION}`;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type Params = Record<string, string>;
type Json = Record<string, unknown>;

export class GraphError extends Error {
  code: number | null;
  subcode: number | null;
  httpStatus: number | null;
  raw: Json;
  constructor(code: number | null, subcode: number | null, message: string, raw: Json = {}, httpStatus: number | null = null) {
    super(`Graph ${code}/${subcode}: ${message}`);
    this.code = code;
    this.subcode = subcode;
    this.raw = raw;
    this.httpStatus = httpStatus;
  }
  /** A 5xx or Meta's transient codes say nothing about whether a write took effect. */
  get ambiguous(): boolean {
    return (this.httpStatus ?? 0) >= 500 || this.code === 1 || this.code === 2 || Boolean(this.raw.is_transient);
  }
}

export async function request(fetcher: Fetcher, method: string, url: string, body?: BodyInit, headers?: Record<string, string>): Promise<Json> {
  const r = await fetcher(url, { method, body, headers });
  const text = await r.text();
  if (!r.ok) {
    let err: Json | undefined;
    try {
      err = (JSON.parse(text) as { error?: Json }).error;
    } catch {
      err = undefined;
    }
    if (!err) throw new GraphError(r.status, null, text.slice(0, 300), {}, r.status);
    throw new GraphError((err.code as number) ?? null, (err.error_subcode as number) ?? null, String(err.message ?? ""), err, r.status);
  }
  return text ? (JSON.parse(text) as Json) : {};
}

export class Graph {
  readonly token: string;
  readonly fetcher: Fetcher;
  // no parameter properties: Node runs the .ts sources in the tests and strips types only
  constructor(token: string, fetcher: Fetcher = fetch) {
    this.token = token;
    this.fetcher = fetcher;
  }

  get(path: string, params: Params = {}): Promise<Json> {
    return request(this.fetcher, "GET", `${GRAPH}/${path}?${new URLSearchParams({ ...params, access_token: this.token })}`);
  }

  write(path: string, params: Params): Promise<Json> {
    return request(this.fetcher, "POST", `${GRAPH}/${path}`, new URLSearchParams({ ...params, access_token: this.token }), {
      "Content-Type": "application/x-www-form-urlencoded",
    });
  }

  del(path: string): Promise<Json> {
    return request(this.fetcher, "DELETE", `${GRAPH}/${path}?${new URLSearchParams({ access_token: this.token })}`);
  }

  // ── convenience ──────────────────────────────────────────────────────────
  async publishingQuota(igUserId: string): Promise<number> {
    const r = await this.get(`${igUserId}/content_publishing_limit`);
    return Number((r.data as { quota_usage: unknown }[])[0]?.quota_usage ?? 0);
  }

  containerStatus(containerId: string): Promise<Json> {
    return this.get(containerId, { fields: "status_code,status" });
  }

  media(mediaId: string, fields = "id,permalink,timestamp,media_product_type"): Promise<Json> {
    return this.get(mediaId, { fields });
  }

  async recentMedia(igUserId: string, fields: string, limit = 25): Promise<Json[]> {
    const r = await this.get(`${igUserId}/media`, { limit: String(limit), fields });
    return (r.data as Json[] | undefined) ?? [];
  }

  async mediaInsights(mediaId: string, metrics: string[]): Promise<Record<string, number | null>> {
    const data = (await this.get(`${mediaId}/insights`, { metric: metrics.join(",") })).data as { name: string; values?: { value?: number }[]; total_value?: { value?: number } }[];
    return Object.fromEntries(data.map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? null]));
  }

  async accountInsights(igUserId: string, metrics: string[], window: Params = {}, period = "day", metricType = "total_value"): Promise<Record<string, number | null>> {
    const data = (await this.get(`${igUserId}/insights`, { metric: metrics.join(","), period, metric_type: metricType, ...window })).data as {
      name: string;
      values?: { value?: number }[];
      total_value?: { value?: number };
    }[];
    return Object.fromEntries(data.map((d) => [d.name, d.total_value?.value ?? d.values?.[0]?.value ?? null]));
  }
}
