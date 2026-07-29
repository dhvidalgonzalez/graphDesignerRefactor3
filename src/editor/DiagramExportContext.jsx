import { createContext, useCallback, useContext, useMemo, useRef } from "react";

const DiagramExportContext = createContext(null);

export function DiagramExportProvider({ children }) {
  const exporterRef = useRef(null);

  const registerExporter = useCallback((exporter) => {
    exporterRef.current = exporter;
    return () => {
      if (exporterRef.current === exporter) exporterRef.current = null;
    };
  }, []);

  const capture = useCallback(async (options) => {
    if (!exporterRef.current) {
      throw new Error("El canvas todavía no está listo para exportar.");
    }
    return exporterRef.current(options);
  }, []);

  const value = useMemo(() => ({ registerExporter, capture }), [capture, registerExporter]);
  return (
    <DiagramExportContext.Provider value={value}>
      {children}
    </DiagramExportContext.Provider>
  );
}

export function useDiagramExport() {
  const context = useContext(DiagramExportContext);
  if (!context) throw new Error("useDiagramExport debe usarse dentro de DiagramExportProvider.");
  return context;
}
