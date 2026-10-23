"use client";

function pageIndices(start, pageCount, spreadMode) {
  if (!spreadMode) return [start].filter((index) => index >= 0 && index < pageCount);
  return [start, start + 1].filter((index) => index >= 0 && index < pageCount);
}

function TurnPages({ start, pageCount, spreadMode, zoom, renderPage }) {
  return (
    <div className={`pages-wrap page-turn-pages${spreadMode ? " turn-spread" : ""}`} style={{ zoom }}>
      {pageIndices(start, pageCount, spreadMode).map((pageIndex) => renderPage(pageIndex))}
    </div>
  );
}

export default function PageTurn({
  pages,
  renderPage,
  spreadMode,
  currentPage,
  zoom,
  turn,
  onTurnComplete,
}) {
  return (
    <div className="page-turn-host">
      <div className="page-turn-layer">
        <TurnPages
          start={turn ? turn.target : currentPage}
          pageCount={pages.length}
          spreadMode={spreadMode}
          zoom={zoom}
          renderPage={renderPage}
        />
      </div>
      {turn && (
        <div
          key={turn.id}
          className={`page-flip-sheet ${turn.direction}${spreadMode ? " spread-turn" : ""}`}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) onTurnComplete();
          }}
        >
          <div className="page-flip-face page-flip-front">
            <TurnPages
              start={turn.from}
              pageCount={pages.length}
              spreadMode={spreadMode}
              zoom={zoom}
              renderPage={renderPage}
            />
          </div>
          <div className="page-flip-face page-flip-back">
            <TurnPages
              start={turn.target}
              pageCount={pages.length}
              spreadMode={spreadMode}
              zoom={zoom}
              renderPage={renderPage}
            />
          </div>
        </div>
      )}
    </div>
  );
}
