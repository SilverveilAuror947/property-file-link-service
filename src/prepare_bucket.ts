import { InfraiClient } from "./infrai_client";

const bucket = process.env.PROPERTY_FILES_BUCKET ?? "property-private-files";
await InfraiClient.fromEnvironment().createBucket(bucket);
console.log(`Bucket ready: ${bucket}`);
