import assert from "node:assert/strict";
import { InfraiDnsClient, migrateCreatorRecords, type FetchLike } from "./creator_dns.ts";

const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
const fetcher: FetchLike = async (url, init) => {
  const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  requests.push({ url, init, body });
  const data = url.includes("domain/get") ? { zone_id: "zone_creator_7" } : { record_id: `record_${requests.length}` };
  return new Response(JSON.stringify({ ok: true, data, metadata: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
};

const result = await migrateCreatorRecords(new InfraiDnsClient("test-key", fetcher), "creator.example");
assert.equal(result.zone_id, "zone_creator_7");
assert.equal(requests[0].init.method, "GET");
assert.equal(requests[1].init.method, "PUT");
assert.equal(requests[1].body.zone_id, "zone_creator_7");
assert.equal(requests[2].body.record_type, "TXT");
assert.equal(requests[3].body.record_type, "TXT");
assert.equal(requests.length, 4);
console.log("creator DNS cutover decision passed");
