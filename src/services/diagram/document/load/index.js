import client from "../../../api/client/index.js";
import { parseAndMigrateDiagram } from "../../../../domain/diagram/migrateDiagram.js";

export async function loadDiagramDocumentService(projectId, diagramId) {
  const ticketResult = await client.queries.requestDiagramDownload({
    projectId,
    diagramId,
    action: "DOWNLOAD",
  });

  if (ticketResult.errors?.length || !ticketResult.data?.url) {
    throw new Error(
      ticketResult.errors?.map((item) => item.message).join("; ") ||
        "No se pudo preparar la descarga del diagrama.",
    );
  }

  const response = await fetch(ticketResult.data.url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `No fue posible descargar el diagrama desde el almacenamiento (${response.status}).`,
    );
  }

  return parseAndMigrateDiagram(await response.text());
}

export default loadDiagramDocumentService;
