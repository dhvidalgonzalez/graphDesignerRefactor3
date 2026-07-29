export default function SymbolIcon({ type, size = 28 }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg className="symbol-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {type === "ElmTr2" && <><circle cx="16" cy="12" r="5" {...common} /><circle cx="16" cy="20" r="5" {...common} /><path d="M16 3v4M16 25v4" {...common} /></>}
      {type === "ElmTr3" && <><circle cx="16" cy="10" r="5" {...common} /><circle cx="12" cy="20" r="5" {...common} /><circle cx="20" cy="20" r="5" {...common} /><path d="M16 2v3M12 25v4M20 25v4" {...common} /></>}
      {type === "ElmTerm" && <><path d="M4 16h24" {...common} /><circle cx="16" cy="16" r="1.8" fill="currentColor" /></>}
      {type === "ElmCoup" && <><path d="M16 3v9M16 20v9M16 12l5 5" {...common} /><circle cx="16" cy="12" r="1.5" fill="currentColor" /><circle cx="16" cy="20" r="1.5" fill="currentColor" /></>}
      {type === "ElmLod" && <><path d="M16 3v10" {...common} /><path d="M9 13h14l-7 13z" {...common} /></>}
      {type === "ElmSym" && <><path d="M16 3v8" {...common} /><circle cx="16" cy="18" r="7" {...common} /><path d="M11 18c2-4 4 4 6 0s4 4 5 0" {...common} /></>}
      {type === "ElmShnt" && <><path d="M16 3v11M9 14h14M10 19h12M12 24h8" {...common} /></>}
      {type === "ElmGenstat" && <><path d="M16 3v8" {...common} /><path d="M10 11h12v14H10z" {...common} /><path d="M16 14l4 7h-8z" {...common} /></>}
      {type === "GraphicRectangle" && <rect x="5" y="9" width="22" height="14" rx="1" {...common} />}
      {type === "GraphicSquare" && <rect x="8" y="8" width="16" height="16" rx="1" {...common} />}
      {type === "GraphicCircle" && <circle cx="16" cy="16" r="8" {...common} />}
      {type === "GraphicText" && <><path d="M7 8h18M16 8v17M11 25h10" {...common} /></>}
    </svg>
  );
}
