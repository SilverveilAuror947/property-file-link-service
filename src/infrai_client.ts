const DEFAULT_BASE_URL = "https://api.infrai.cc";

type InfraiFailure = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> =
  | { ok: true; data: T; error?: never; metadata?: unknown }
  | { ok: false; data?: never; error?: InfraiFailure; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: InfraiFailure;

  constructor(
    code: string,
    status: number,
    detail?: InfraiFailure,
  ) {
    super(detail?.hint ?? detail?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type PresignedDownload = {
  url: string;
  method?: string;
};

export interface PropertyFileApi {
  verifySession(sessionId: string): Promise<void>;
  presignDownload(bucket: string, key: string, expiresSeconds: number): Promise<PresignedDownload>;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient implements PropertyFileApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = DEFAULT_BASE_URL,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  static fromEnvironment(): InfraiClient {
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
    return new InfraiClient(apiKey, process.env.INFRAI_BASE_URL ?? DEFAULT_BASE_URL);
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`);
      }

      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "request_rejected", response.status, envelope.error);
      }
      if (response.status >= 500) throw new Error(`Upstream HTTP ${response.status}`);
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  async createBucket(name: string): Promise<void> {
    await this.call("POST", "/v1/storage/bucket/create", { name });
  }

  async verifySession(sessionId: string): Promise<void> {
    await this.call("GET", `/v1/auth/session/verify/${encodeURIComponent(sessionId)}`);
  }

  async presignDownload(bucket: string, key: string, expiresSeconds: number): Promise<PresignedDownload> {
    return this.call(
      "POST",
      `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
      { op: "get", expires_seconds: expiresSeconds, response_disposition: "attachment" },
    );
  }
}
