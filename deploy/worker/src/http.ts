// Errors and JSON responses shared by the routes and the DB ops.

export class HttpError extends Error {
  status: number;
  /** A sentence for the caller, beyond the short `message` code. */
  detail: string | null;
  constructor(status: number, message: string, detail: string | null = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
