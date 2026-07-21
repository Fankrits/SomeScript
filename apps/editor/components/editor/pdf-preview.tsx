"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Hand, Loader2, Minus, MousePointer, Plus, Search } from "lucide-react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { DocumentManagerPluginPackage, useActiveDocument, useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage, useScroll } from "@embedpdf/plugin-scroll/react";
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ZoomGestureWrapper, ZoomMode, ZoomPluginPackage, useZoom } from "@embedpdf/plugin-zoom/react";
import { PanPluginPackage, usePan } from "@embedpdf/plugin-pan/react";
import { SearchLayer, SearchPluginPackage, useSearch } from "@embedpdf/plugin-search/react";
import { SelectionLayer, SelectionPluginPackage, useSelectionCapability } from "@embedpdf/plugin-selection/react";
import { GlobalPointerProvider, InteractionManagerPluginPackage, PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const pdfPlugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: 1 }),
  createPluginRegistration(PanPluginPackage),
  createPluginRegistration(SearchPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
];


// One `synctex view` result box, in PDF points from the page's top-left:
// (x, y) visual box origin, (h, v) box left edge / baseline, W x H box size.
interface SynctexViewRecord {
  page: number;
  x: number;
  y: number;
  h: number;
  v: number;
  W: number;
  H: number;
}
// `view` answers with records, `edit` with an input/line pair — one endpoint, both shapes.
type SynctexQuery = (
  query: Record<string, unknown>
) => Promise<{ records?: SynctexViewRecord[]; input?: string; line?: number } | null>;

interface HeadlessPdfViewerProps {
  pdfUrl: string | null;
  synctexQuery: SynctexQuery;
  selectedPath: string;
  pdfSyncRequest: { line: number; frac: number; nonce: number } | null;
  onSelectLine: (filePath: string, line: number) => void;
}

const HeadlessPdfViewer = ({
  pdfUrl,
  synctexQuery,
  selectedPath,
  pdfSyncRequest,
  onSelectLine,
}: HeadlessPdfViewerProps) => {
  const docManagerCap = useDocumentManagerCapability();
  const { activeDocumentId, activeDocument } = useActiveDocument();
  const lastLoadedUrlRef = useRef<string | null>(null);
  const currentDocIdRef = useRef<string>("");
  const [currentDocId, setCurrentDocId] = useState<string>("");

  // Load document once pdfUrl is available
  useEffect(() => {
    if (pdfUrl && docManagerCap && docManagerCap.provides && lastLoadedUrlRef.current !== pdfUrl) {
      lastLoadedUrlRef.current = pdfUrl;
      const newDocId = `doc-${Date.now()}`;
      
      currentDocIdRef.current = newDocId;
      setCurrentDocId(newDocId);
      docManagerCap.provides.openDocumentUrl({
        url: pdfUrl,
        autoActivate: true,
        documentId: newDocId,
      });
    }
  }, [pdfUrl, docManagerCap]);

  if (!pdfUrl) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground p-4 text-center">
        Click Compile to generate PDF
      </div>
    );
  }

  if (!activeDocumentId || activeDocumentId !== currentDocId || !activeDocument || activeDocument.status !== "loaded") {
    return (
      <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground p-4 text-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Loading document...</span>
      </div>
    );
  }

  return (
    <HeadlessPdfViewerInner
      documentId={activeDocumentId}
      synctexQuery={synctexQuery}
      selectedPath={selectedPath}
      pdfSyncRequest={pdfSyncRequest}
      onSelectLine={onSelectLine}
    />
  );
};

interface HeadlessPdfViewerInnerProps {
  documentId: string;
  synctexQuery: SynctexQuery;
  selectedPath: string;
  pdfSyncRequest: { line: number; frac: number; nonce: number } | null;
  onSelectLine: (filePath: string, line: number) => void;
}

const HeadlessPdfViewerInner = ({
  documentId,
  synctexQuery,
  selectedPath,
  pdfSyncRequest,
  onSelectLine,
}: HeadlessPdfViewerInnerProps) => {
  const scrollHook = useScroll(documentId);
  const zoomHook = useZoom(documentId);
  const panHook = usePan(documentId);
  const searchHook = useSearch(documentId);
  const selectionCap = useSelectionCapability();

  // Highlight box (PDF points from page top-left) flashed on the target line after a forward sync.
  // nonce keys the flash element so a re-sync remounts it and the CSS animation restarts —
  // otherwise re-syncing the same line renders an identical element whose finished
  // animation (forwards => opacity 0) never replays, and the highlight seems to "not show".
  const [syncHighlight, setSyncHighlight] = useState<{ page: number; y: number; h: number; nonce: number } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forward SyncTeX (`synctex view`): scroll the PDF to the editor line ONLY on an
  // explicit double-click (pdfSyncRequest), never on plain cursor movement.
  const lastSyncNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!pdfSyncRequest || !selectedPath || !scrollHook?.provides) return;
    // One-shot per double-click. scrollHook.provides changes identity on every manual
    // scroll, which re-runs this effect; without the nonce guard it would re-scroll to
    // the sync target each time and the preview would feel stuck.
    if (pdfSyncRequest.nonce === lastSyncNonceRef.current) return;
    lastSyncNonceRef.current = pdfSyncRequest.nonce;
    const scroll = scrollHook.provides;

    let cancelled = false;
    (async () => {
      const data = await synctexQuery({ type: "view", texRelativePath: selectedPath, line: pdfSyncRequest.line });
      const records: SynctexViewRecord[] = data?.records ?? [];
      if (cancelled || records.length === 0) return;

      // A wrapped paragraph is one source line typeset across several PDF lines (one
      // record per box); interpolate by the click's fraction within the source line
      // across the records' baseline range to land on the right typeset line.
      const page = records[0].page;
      const baselines = records.filter((r) => r.page === page).map((r) => r.v);
      const minV = Math.min(...baselines);
      const maxV = Math.max(...baselines);
      const targetY = minV + (maxV - minV) * Math.min(1, Math.max(0, pdfSyncRequest.frac ?? 0));
      try {
        // Coordinates are already PDF points from the top-left, as pageCoordinates expects.
        // behavior "instant": the plugin's default smooth scroll is silently cancelled by
        // Chromium on any competing scroll/input, leaving the viewport unmoved on long
        // jumps — the highlight then lands off-screen. Instant is deterministic (and what
        // Overleaf does for sync jumps).
        scroll.scrollToPage({
          pageNumber: page,
          pageCoordinates: { x: records[0].h, y: targetY },
          alignY: 50,
          behavior: "instant",
        });
      } catch (e) {
        console.warn("Failed to scroll to page:", e);
      }
      // Flash a highlight on the synced line, then fade it out.
      setSyncHighlight({ page, y: targetY, h: records[0].H, nonce: pdfSyncRequest.nonce });
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setSyncHighlight(null), 2200);
    })();
    return () => { cancelled = true; };
  }, [pdfSyncRequest, selectedPath, synctexQuery, scrollHook?.provides]);

  useEffect(() => () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
  }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Initialize zoom to 100% when a new document ID is loaded to trigger layout calculation
  useEffect(() => {
    const provides = zoomHook?.provides;
    if (provides) {
      const t = setTimeout(() => {
        try {
          provides.requestZoom(1);
        } catch (e) {
          console.warn("Failed to initialize zoom level:", e);
        }
      }, 80);
      return () => clearTimeout(t);
    }
  }, [documentId, zoomHook?.provides]);

  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!selectionCap.provides) return;
    selectionCap.provides.getSelectedText(documentId).wait((textArray) => {
      if (textArray && textArray.length > 0) {
        navigator.clipboard.writeText(textArray.join("\n"))
          .then(() => {
            setIsCopied(true);
            setTimeout(() => {
              selectionCap.provides?.clear(documentId);
              setIsCopied(false);
            }, 1200);
          })
          .catch((err) => {
            console.error("Failed to copy PDF selection to clipboard:", err);
            selectionCap.provides?.clear(documentId);
          });
      } else {
        selectionCap.provides?.clear(documentId);
      }
    }, () => {
      selectionCap.provides?.clear(documentId);
    });
    setContextMenu(null);
  }, [selectionCap.provides, documentId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCopy = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c";
      if (isCopy) {
        const state = selectionCap.provides?.getState(documentId);
        const hasSelection = state?.selection !== null && state?.selection !== undefined;
        if (hasSelection) {
          const activeEl = document.activeElement;
          const isEditing = activeEl && (
            activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.closest(".cm-editor") !== null
          );
          if (!isEditing) {
            e.preventDefault();
            handleCopy();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCopy, selectionCap.provides, documentId]);

  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);

  const currentPage = scrollHook?.state?.currentPage ?? 1;
  const totalPages = scrollHook?.state?.totalPages ?? 1;

  const currentZoom = Math.round((zoomHook?.state?.currentZoomLevel ?? 1) * 100);
  const isPanning = panHook?.isPanning ?? false;

  const searchState = searchHook?.state;
  const activeSearchResultIndex = searchState?.activeResultIndex ?? 0;
  const totalSearchResults = searchState?.total ?? 0;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearchQuery(val);
    if (searchHook?.provides) {
      if (val.trim()) {
        searchHook.provides.searchAllPages(val);
      } else {
        searchHook.provides.stopSearch();
      }
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchHook?.provides && totalSearchResults > 0) {
      if (e.shiftKey) {
        searchHook.provides.previousResult();
      } else {
        searchHook.provides.nextResult();
      }
    }
  };



  return (
    <div className="w-full h-full flex flex-col min-w-0 bg-muted/5 relative overflow-hidden select-none">
      {/* Aligned Branded Custom Toolbar */}
      <div className="flex items-center justify-between px-3 border-b bg-muted/10 h-11 w-full shrink-0 gap-2">
        <div className="flex items-center gap-1 shrink-0 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          {/* Pointer Tool */}
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("h-7 w-7 rounded-md transition-all duration-150", !isPanning ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => {
              if (isPanning) panHook?.provides?.disablePan();
            }}
            title="Text Select Pointer"
          >
            <MousePointer className="size-3.5" />
          </Button>

          {/* Pan Tool */}
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn("h-7 w-7 rounded-md transition-all duration-150", isPanning ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => {
              if (!isPanning) panHook?.provides?.enablePan();
            }}
            title="Pan Hand Tool"
          >
            <Hand className="size-3.5" />
          </Button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 shrink-0 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomHook?.provides?.zoomOut()}
            disabled={!zoomHook?.provides}
            title="Zoom Out"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Minus className="size-3.5" />
          </Button>

          <Button
            variant="ghost"
            className="h-7 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-md transition-all whitespace-nowrap"
            onClick={() => zoomHook?.provides?.requestZoom(ZoomMode.FitWidth)}
            title="Fit to Width"
          >
            {currentZoom}%
          </Button>

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => zoomHook?.provides?.zoomIn()}
            disabled={!zoomHook?.provides}
            title="Zoom In"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {/* Search controls (moved to the right) */}
        <div className="flex items-center gap-1.5 max-w-[200px] sm:max-w-[280px] justify-end">
          {showSearchInput ? (
            <div className="flex items-center border rounded-md bg-background px-2 h-7 gap-1">
              <Search className="size-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find in document..."
                value={localSearchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                className="text-[11px] outline-none border-none bg-transparent w-24 sm:w-36 font-sans"
                autoFocus
              />
              {totalSearchResults > 0 && (
                <span className="text-[9px] font-mono text-muted-foreground shrink-0 select-none">
                  {activeSearchResultIndex + 1}/{totalSearchResults}
                </span>
              )}
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowSearchInput(true)}
              title="Search document"
            >
              <Search className="size-3.5 text-muted-foreground" />
            </Button>
          )}
          {showSearchInput && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setShowSearchInput(false);
                setLocalSearchQuery("");
                searchHook?.provides?.stopSearch();
              }}
              title="Close search"
            >
              <Plus className="size-3.5 rotate-45 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Headless Rendering Container */}
      <div
        className="flex-1 bg-muted/15 relative overflow-hidden"
        onContextMenu={(e) => {
          const state = selectionCap.provides?.getState(documentId);
          const hasSelection = state?.selection !== null && state?.selection !== undefined;
          if (!isPanning && hasSelection) {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY });
          }
        }}
        onClick={() => setContextMenu(null)}
      >
        {/* Floating Page Navigation */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-1 bg-background/90 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-border/80 shadow-lg select-none">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => scrollHook?.provides?.scrollToPage({ pageNumber: currentPage - 1 })}
            disabled={currentPage <= 1}
            title="Previous Page"
            className="h-6 w-6 rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-[10px] font-semibold text-foreground px-2 whitespace-nowrap min-w-[36px] text-center font-mono">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => scrollHook?.provides?.scrollToPage({ pageNumber: currentPage + 1 })}
            disabled={currentPage >= totalPages}
            title="Next Page"
            className="h-6 w-6 rounded-full hover:bg-muted"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>

        {/* Right-click copy context menu */}
        {contextMenu && (
          <div
            className="fixed z-[9999] min-w-[120px] bg-popover border border-border rounded-md shadow-lg py-1 text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              onPointerDown={(e) => {
                e.preventDefault();
                handleCopy();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
              Copy
              <kbd className="ml-auto text-[9px] text-muted-foreground font-mono">⌘C</kbd>
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors text-muted-foreground"
              onPointerDown={(e) => {
                e.preventDefault();
                selectionCap.provides?.clear(documentId);
                setContextMenu(null);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              Deselect
            </button>
          </div>
        )}
        <Viewport
          documentId={documentId}
          className="w-full h-full overflow-auto"
        >
          <GlobalPointerProvider documentId={documentId} className="w-full h-full">
            <ZoomGestureWrapper documentId={documentId} className="w-full min-h-full">
              <Scroller
                documentId={documentId}
                renderPage={({ pageIndex, width, height }) => {
                  const handleDoubleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    // Reverse SyncTeX (`synctex edit`) wants PDF points from the page's
                    // top-left. The page renders at `zoom` css px per pt, so divide it out.
                    const zoom = zoomHook?.state?.currentZoomLevel ?? 1;
                    const data = await synctexQuery({
                      type: "edit",
                      page: pageIndex + 1,
                      x: (e.clientX - rect.left) / zoom,
                      y: (e.clientY - rect.top) / zoom,
                    });
                    if (data?.input && data.line) {
                      onSelectLine(data.input, data.line);
                    }
                  };

                  return (
                    <div
                      key={pageIndex}
                      style={{ width: "100%", display: "flex", justifyContent: "center", paddingTop: pageIndex === 0 ? "16px" : "8px", paddingBottom: "8px" }}
                    >
                      <div
                        style={{ width, height, position: "relative", display: "block", flexShrink: 0 }}
                        className="shadow-md bg-background border border-border/40 rounded-sm overflow-hidden"
                        onDoubleClick={handleDoubleClick}
                      >
                        {syncHighlight && syncHighlight.page === pageIndex + 1 && (() => {
                          // SyncTeX is line-granular: a record boxes some fragment of the source
                          // line, not the clicked word, so a box-accurate highlight often lands on
                          // the wrong word. Highlight the full-width line band instead (à la
                          // Overleaf): vertical position from the record, horizontal spans the page.
                          const zoom = zoomHook?.state?.currentZoomLevel ?? 1; // pt -> css px
                          // Band spans ~3 text lines, centered on the target line, to absorb
                          // SyncTeX's line-level (not word-level) imprecision.
                          const lineH = Math.max(syncHighlight.h * zoom, zoom * 11);
                          return (
                            <div
                              key={syncHighlight.nonce}
                              className="synctex-flash"
                              style={{
                                position: "absolute",
                                left: 6,
                                right: 6,
                                top: Math.max(0, (syncHighlight.y - syncHighlight.h) * zoom - lineH),
                                height: lineH * 3,
                                pointerEvents: "none",
                                zIndex: 30,
                              }}
                            />
                          );
                        })()}
                        <PagePointerProvider
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ width: "100%", height: "100%", position: "relative", display: "block", flexShrink: 0 }}
                        >
                          <RenderLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ width: "100%", height: "100%", display: "block", userSelect: "none", pointerEvents: "none" }}
                          draggable={false}
                        />
                        <SearchLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                        />
                        {!isPanning && (
                          <SelectionLayer
                            documentId={documentId}
                            pageIndex={pageIndex}
                            textStyle={{ background: "rgba(59, 130, 246, 0.35)" }}
                            selectionMenu={(({ menuWrapperProps, placement }) => {
                              return (
                                <div
                                  {...menuWrapperProps}
                                  className="z-50"
                                  style={{
                                    ...menuWrapperProps.style,
                                    pointerEvents: "auto",
                                  }}
                                >
                                  <div
                                    className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center shrink-0"
                                    style={{
                                      ...(placement.suggestTop
                                        ? { bottom: "100%", marginBottom: "6px" }
                                        : { top: "100%", marginTop: "6px" }),
                                    }}
                                  >
                                    <button
                                      className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-popover text-popover-foreground border border-border rounded-md shadow-md hover:bg-accent transition-colors",
                                        isCopied && "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                      )}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!isCopied) handleCopy();
                                      }}
                                    >
                                      {isCopied ? (
                                        <>
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="11"
                                            height="11"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="size-3 text-green-500"
                                          >
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                          Copied!
                                        </>
                                      ) : (
                                        <>
                                          <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="11"
                                            height="11"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="size-3"
                                          >
                                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                          </svg>
                                          Copy
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          />
                        )}
                      </PagePointerProvider>
                      </div>
                    </div>
                  );
                }}
              />
            </ZoomGestureWrapper>
          </GlobalPointerProvider>
        </Viewport>
      </div>
    </div>
  );
};

// Default export so page.tsx can pull the whole PDF stack (embedpdf + the ~3.5MB
// pdfium.wasm the engine fetches) in a lazy chunk instead of the initial bundle.
export default function PdfPreview(props: HeadlessPdfViewerProps) {
  const { engine, isLoading, error } = usePdfiumEngine();

  if (!engine) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground">
        {isLoading || !error ? "Loading PDF Engine..." : "Failed to load PDF Engine"}
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <EmbedPDF plugins={pdfPlugins} engine={engine} config={{}}>
        <HeadlessPdfViewer {...props} />
      </EmbedPDF>
    </div>
  );
}
