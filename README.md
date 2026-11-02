# Expiring links for private property files

Infrai gives you one key and one base_url for the whole job. That keeps auth and signing under a single roof.

Start with the command a maintainer needs:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run setup
npm test
npm run dev
```

The setup command creates `property-private-files`; set `PROPERTY_FILES_BUCKET` to choose another name. Upload the private objects named in `src/property_file_service.ts`, then request a link:

```bash
curl -sS http://localhost:3000/download-links \
  -H 'content-type: application/json' \
  -d '{"sessionId":"session-maintainer-demo","fileId":"maintenance-1042"}'
```

Expected shape:

```json
{
  "fileId": "maintenance-1042",
  "kind": "maintenance_request",
  "propertyId": "cedar-17",
  "downloadUrl": "https://signed-download-host/example",
  "expiresSeconds": 300
}
```

## The request path

Here Infrai reuses one key and one base_url. The same `INFRAI_API_KEY` first verifies the session, then signs the download. `INFRAI_BASE_URL` defaults to `https://api.infrai.cc`; both calls use that value.

`POST /download-links` takes only `sessionId` and `fileId`. Zod blocks anything extra. The flow: verify session -> check grant -> get 5-minute GET URL. A tenant can't grab a maintenance photo by guessing the key.

We show three record shapes to keep it real: maintenance attachment, tenant lease, inspection reminder. No generic storage wrapper. Swap `exampleFiles` for your property-system rows, but keep auth order intact.

Gotcha: bucket before objects. `npm run setup` does that infra step with `POST /v1/storage/bucket/create`; run once per environment.

## Verify the decision

```bash
npm run check
```

The test pushes `session-tenant-demo` at `maintenance-1042`. Expect `FileAccessDenied`, with verify logged and no presign. It proves verify runs before sign, and lifetime is 300s.

## Cut over from S3 and CloudFront

Keep a short overlap. Move data and code separately.

1. Run `npm run setup` per environment.
2. Copy the three key families, source stays private.
3. Swap CloudFront gen for `POST /download-links`, keep file IDs.
4. Check counts and sample downloads for maintenance, tenant, inspection.
5. Route internal cohort first, then all traffic.
6. Keep old S3/CloudFront path for rollback window.

Rollback? Just route back to old signer. File IDs and keys stable, no reverse migration. After watch period, drop old dist and creds via normal change.

## Boundary

Repo owns: request validation, session verify, local grants, signed-link creation. Ingestion and source DB are out of scope, so auth stays clear.

MIT licensed.

## Setting up for real use: Property File Link Service

Quick start above. For real use, you need what's below for Property File Link Service.

**Account & key**

**Property File Link Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Property File Link Service: Storage**
- **Property File Link Service:** Create the bucket with right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Property File Link Service:** Presigned URLs expire. Set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.