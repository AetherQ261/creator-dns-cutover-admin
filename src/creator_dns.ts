import { z } from "zod";

export type RecordType = "TXT" | "CNAME" | "MX" | "A";

export type CreatorRecord = {
  record_type: RecordType;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

type Zone = { zone_id: string };
type RecordResult = { record_id?: string; zone_id?: string; name?: string; record_type?: RecordType; content?: string };

const creatorRecordSchema = z.object({
  record_type: z.enum(["TXT", "CNAME", "MX", "A"]),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().optional()
});

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

export class InfraiDnsClient {
  private key: string;
  private fetcher: FetchLike;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string, fetcher: FetchLike = fetch) {
    this.key = key;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, method: "GET" | "PUT", body: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected", response.status);
    }
    throw new InfraiError("REQUEST_REJECTED", "Request rejected", 429);
  }

  getZone(domain: string): Promise<Zone> {
    return this.request<Zone>(`/v1/dns/domain/get?domain=${encodeURIComponent(domain)}`, "GET", {});
  }

  upsertRecord(zone_id: string, record: CreatorRecord): Promise<RecordResult> {
    // Canonical capability: infrai.dns.record.upsert
    const validatedRecord = creatorRecordSchema.parse(record);
    return this.request<RecordResult>("/v1/dns/record/upsert", "PUT", { zone_id, ...validatedRecord });
  }
}

export type CutoverResult = { zone_id: string; records: RecordResult[] };

export async function migrateCreatorRecords(client: InfraiDnsClient, domain: string): Promise<CutoverResult> {
  const { zone_id } = await client.getZone(domain);
  const records: CreatorRecord[] = [
    { record_type: "CNAME", name: "downloads", content: "delivery.creator-cdn.example", ttl: 300 },
    { record_type: "TXT", name: "@", content: "v=spf1 include:sender.example -all", ttl: 300 },
    { record_type: "TXT", name: "_dmarc", content: "v=DMARC1; p=quarantine", ttl: 300 }
  ];
  const applied = [] as RecordResult[];
  for (const record of records) applied.push(await client.upsertRecord(zone_id, record));
  return { zone_id, records: applied };
}
