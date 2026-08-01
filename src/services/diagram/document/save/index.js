import { serializeDiagram } from "../../../../domain/diagram/serialization.js";
import client from "../../../api/client/index.js";

async function sha256(text) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = new TextEncoder().encode(text);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function saveDiagramDocumentService(
  projectId,
  diagramId,
  document,
) {
  const payload = serializeDiagram(document);
  const ticketResult = await client.mutations.requestDiagramUpload({
    projectId,
    diagramId,
    action: "UPLOAD",
    contentType: "application/json",
  });

  if (ticketResult.errors?.length || !ticketResult.data?.url) {
    throw new Error(
      ticketResult.errors?.map((item) => item.message).join("; ") ||
        "No se pudo preparar la subida del diagrama.",
    );
  }

  const response = await fetch(ticketResult.data.url, {
    method: "PUT",
    headers: {
      "Content-Type":
        ticketResult.data.contentType || "application/json",
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(
      `El almacenamiento rechazó el guardado del diagrama (${response.status}).`,
    );
  }

  return {
    storageKey: ticketResult.data.key,
    documentBytes: new TextEncoder().encode(payload).byteLength,
    documentChecksum: await sha256(payload),
    lastSavedAt: new Date().toISOString(),
  };
}

export default saveDiagramDocumentService;
