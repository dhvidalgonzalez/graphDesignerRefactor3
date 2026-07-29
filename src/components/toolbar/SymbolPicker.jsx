import { useEffect, useRef, useState } from "react";
import { listSymbolsByCategory } from "../../domain/catalog/symbolCatalog.js";
import { shallowEqual, useEditorActions, useEditorSelector } from "../../editor/EditorContext.jsx";
import SymbolIcon from "./SymbolIcon.jsx";

const groups = listSymbolsByCategory();

export default function SymbolPicker() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const data = useEditorSelector((state) => ({ viewport: state.viewport, nodeCount: Object.keys(state.document.nodes).length }), shallowEqual);
  const actions = useEditorActions();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const addSymbol = (type) => {
    const canvasWidth = Math.max(500, window.innerWidth - 310);
    const offset = (data.nodeCount % 5) * 3;
    actions.addNode(type, {
      x: (canvasWidth * 0.5 - data.viewport.x) / data.viewport.scale + offset,
      y: ((window.innerHeight - 130) * 0.48 - data.viewport.y) / data.viewport.scale + offset,
    });
    setOpen(false);
  };

  return (
    <div className="symbol-picker" ref={rootRef}>
      <button className={`tool-button tool-button--library ${open ? "tool-button--active" : ""}`} onClick={() => setOpen((value) => !value)} title="Insertar componente">
        <span className="grid-glyph">▦</span>
        <span>Componentes</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="symbol-popover">
          <div className="popover-title"><strong>Biblioteca de símbolos</strong><span>{Object.values(groups).flat().length} símbolos</span></div>
          {Object.entries(groups).map(([category, symbols]) => (
            <section className="symbol-category" key={category}>
              <span>{category}</span>
              <div className="symbol-grid">
                {symbols.map((symbol) => (
                  <button key={symbol.type} onClick={() => addSymbol(symbol.type)} title={`Insertar ${symbol.displayName}`}>
                    <SymbolIcon type={symbol.type} />
                    <small>{symbol.shortLabel}</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
