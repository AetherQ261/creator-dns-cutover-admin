import { InfraiDnsClient, migrateCreatorRecords } from "./creator_dns.ts";

const domain = process.argv[2];
const key = process.env.INFRAI_API_KEY;
if (!domain || !key) {
  console.error("Usage: INFRAI_API_KEY=... npm run example -- creator.example");
  process.exit(1);
}

const result = await migrateCreatorRecords(new InfraiDnsClient(key), domain);
console.log(JSON.stringify(result, null, 2));
