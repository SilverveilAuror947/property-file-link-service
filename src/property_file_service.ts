import { z } from "zod";
import type { PropertyFileApi } from "./infrai_client";

export const downloadRequestSchema = z.object({
  sessionId: z.string().min(1),
  fileId: z.string().min(1),
}).strict();

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;
export type PropertyFileKind = "maintenance_request" | "tenant_document" | "inspection_reminder";

export type PropertyFile = {
  id: string;
  kind: PropertyFileKind;
  propertyId: string;
  objectKey: string;
  allowedSessions: readonly string[];
};

export class FileAccessDenied extends Error {}
export class FileRecordNotFound extends Error {}

export class PropertyFileService {
  private readonly api: PropertyFileApi;
  private readonly bucket: string;
  private readonly files: readonly PropertyFile[];
  private readonly expiresSeconds: number;

  constructor(
    api: PropertyFileApi,
    bucket: string,
    files: readonly PropertyFile[],
    expiresSeconds = 300,
  ) {
    this.api = api;
    this.bucket = bucket;
    this.files = files;
    this.expiresSeconds = expiresSeconds;
  }

  async issueDownload(input: DownloadRequest) {
    await this.api.verifySession(input.sessionId);

    const file = this.files.find((candidate) => candidate.id === input.fileId);
    if (!file) throw new FileRecordNotFound("Property file was not found");
    if (!file.allowedSessions.includes(input.sessionId)) {
      throw new FileAccessDenied("This session cannot access the requested property file");
    }

    const signed = await this.api.presignDownload(this.bucket, file.objectKey, this.expiresSeconds);
    return {
      fileId: file.id,
      kind: file.kind,
      propertyId: file.propertyId,
      downloadUrl: signed.url,
      expiresSeconds: this.expiresSeconds,
    };
  }
}

export const exampleFiles: readonly PropertyFile[] = [
  {
    id: "maintenance-1042",
    kind: "maintenance_request",
    propertyId: "cedar-17",
    objectKey: "cedar-17/maintenance/1042/leak-photo.jpg",
    allowedSessions: ["session-maintainer-demo"],
  },
  {
    id: "lease-2026-04",
    kind: "tenant_document",
    propertyId: "cedar-17",
    objectKey: "cedar-17/tenants/lease-2026-04.pdf",
    allowedSessions: ["session-tenant-demo"],
  },
  {
    id: "inspection-2026-09",
    kind: "inspection_reminder",
    propertyId: "cedar-17",
    objectKey: "cedar-17/inspections/2026-09/reminder.pdf",
    allowedSessions: ["session-maintainer-demo"],
  },
];
