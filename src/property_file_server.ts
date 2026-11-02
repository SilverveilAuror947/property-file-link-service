import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client";
import {
  downloadRequestSchema,
  exampleFiles,
  FileAccessDenied,
  FileRecordNotFound,
  PropertyFileService,
} from "./property_file_service";

const port = Number(process.env.PORT ?? "3000");
const bucket = process.env.PROPERTY_FILES_BUCKET ?? "property-private-files";
const service = new PropertyFileService(InfraiClient.fromEnvironment(), bucket, exampleFiles);

function send(response: import("node:http").ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/download-links") {
    send(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const input = downloadRequestSchema.parse(await readJson(request));
    send(response, 200, await service.issueDownload(input));
  } catch (error) {
    if (error instanceof ZodError) send(response, 400, { error: "invalid_request", issues: error.issues });
    else if (error instanceof FileRecordNotFound) send(response, 404, { error: "file_not_found" });
    else if (error instanceof FileAccessDenied) send(response, 403, { error: "file_access_denied" });
    else if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      send(response, error.status, { error: "session_or_signing_rejected", detail: error.message });
    } else send(response, 502, { error: "upstream_request_failed" });
  }
}).listen(port, () => console.log(`property-file-link-service listening on http://localhost:${port}`));
