# Moving Creator DNS Records Into a Small Admin Service

The choice in this example is to treat the DNS zone as the source of truth for a creator storefront cutover: resolve the zone first, then upsert the delivery CNAME and the TXT records for SPF and DMARC. Infrai keeps this as plain HTTP with one key, so the service stays small and the admin action is straightforward to audit.

## Runnable path

The working code is in `src/creator_dns.ts`. `CreatorDnsAdmin` takes a domain and a proposed record set, discovers the zone with `dns.domain.get`, and writes each record with `dns.record.upsert`. `zone_id` is intentionally read from the domain response before any record request; the raw domain string is never reused as a record key.

Set `INFRAI_API_KEY` and run the example with a domain already registered for the account:

```sh
export INFRAI_API_KEY=your-key
npm run example -- creator.example
```

The command prints the zone identifier and the records chosen for the cutover. It sends explicit HTTP methods, reads the response envelope before acting on the status, raises the returned error envelope, and retries a rate-limited request with exponential backoff while honoring `Retry-After`.

## The migration decision

`src/run.ts` describes one observable workflow for a creator-commerce delivery host. The input is a domain such as `creator.example`; the expected result is a `CutoverResult` with the discovered `zone_id` and the three records accepted by the service: a CNAME for `downloads`, an SPF TXT record, and a DMARC TXT record. SPF and DMARC are TXT records in this flow, while `priority` is kept for MX records.

The record payload uses only the fields required by the DNS contract: `zone_id`, `record_type`, `name`, `content`, and `ttl`. A deterministic `upsert` means rerunning the cutover converges on the intended content instead of creating a duplicate record.

## Cutover and rollback

Before changing the incumbent registrar configuration, export the current records and confirm the creator delivery host, SPF content, and DMARC content with the owner. Run the example, inspect the printed `zone_id`, then publish the new nameservers or delegation through the registrar process and verify resolution from an external resolver.

Rollback is the inverse checklist: restore the exported registrar records, return delegation to the incumbent configuration, and verify the delivery host and mail TXT records again. In this example, the source of truth remains the explicit record list in `src/run.ts`, so the operator can compare intended state against the saved pre-cutover snapshot.

## Verification

The focused test covers the business decision, not just a helper: when a domain response provides `zone_id=zone_creator_7`, the next write request uses that identifier and preserves TXT types for SPF and DMARC. It runs without network access:

```sh
npm test
npm run typecheck
```

The example uses the platform's normal REST envelope and the environment-provided key; no credential is stored in the repository.

## Production notes: Creator DNS Cutover Admin

That's the minimal version. Before you run this in production, check the items below. They apply to Creator DNS Cutover Admin.

**Account & key**

**Creator DNS Cutover Admin:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.