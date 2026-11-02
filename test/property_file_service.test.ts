import assert from "node:assert/strict";
import test from "node:test";
import type { PresignedDownload, PropertyFileApi } from "../src/infrai_client";
import { FileAccessDenied, PropertyFileService, type PropertyFile } from "../src/property_file_service";

class RecordingApi implements PropertyFileApi {
  readonly calls: string[] = [];

  async verifySession(sessionId: string): Promise<void> {
    this.calls.push(`verify:${sessionId}`);
  }

  async presignDownload(_bucket: string, key: string): Promise<PresignedDownload> {
    this.calls.push(`presign:${key}`);
    return { url: "https://download.example/signed-maintenance-photo" };
  }
}

const file: PropertyFile = {
  id: "maintenance-1042",
  kind: "maintenance_request",
  propertyId: "cedar-17",
  objectKey: "cedar-17/maintenance/1042/leak-photo.jpg",
  allowedSessions: ["session-maintainer-demo"],
};

test("issues a five-minute link only after session verification and local access approval", async () => {
  const api = new RecordingApi();
  const service = new PropertyFileService(api, "property-private-files", [file]);

  const result = await service.issueDownload({
    sessionId: "session-maintainer-demo",
    fileId: "maintenance-1042",
  });

  assert.deepEqual(api.calls, [
    "verify:session-maintainer-demo",
    "presign:cedar-17/maintenance/1042/leak-photo.jpg",
  ]);
  assert.equal(result.kind, "maintenance_request");
  assert.equal(result.expiresSeconds, 300);
});

test("denies a valid session that has no grant and never signs the object", async () => {
  const api = new RecordingApi();
  const service = new PropertyFileService(api, "property-private-files", [file]);

  await assert.rejects(
    service.issueDownload({ sessionId: "session-tenant-demo", fileId: "maintenance-1042" }),
    FileAccessDenied,
  );
  assert.deepEqual(api.calls, ["verify:session-tenant-demo"]);
});
