"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Hand,
  Loader2,
  Minus,
  MousePointer,
  Plus,
  Search,
} from "lucide-react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  DocumentManagerPluginPackage,
  useActiveDocument,
  useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage, useScroll } from "@embedpdf/plugin-scroll/react";
import { RenderLayer, RenderPluginPackage } from "@embedpdf/plugin-render/react";
import {
  ZoomGestureWrapper,
  ZoomMode,
  ZoomPluginPackage,
  useZoom,
} from "@embedpdf/plugin-zoom/react";
import { PanPluginPackage, usePan } from "@embedpdf/plugin-pan/react";
import { SearchLayer, SearchPluginPackage, useSearch } from "@embedpdf/plugin-search/react";
import { SelectionLayer, SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import { Button } from "@/components/ui/button";

const pdfPlugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  // Must be an automatic mode, not a fixed number. The zoom plugin gates the
  // viewport while a document loads and only releases that gate once it can
  // compute a zoom against non-zero viewport metrics. Its retry path runs on
  // viewport resize but bails out for fixed numeric levels, so a fixed level
  // leaves the viewport gated forever whenever the element measures 0x0 on the
  // first pass — the Viewport then renders no children and the page stays blank.
  createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitWidth }),
  createPluginRegistration(PanPluginPackage),
  createPluginRegistration(SearchPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
];

interface TemplatePdfViewerProps {
  pdfUrl: string;
  templateName?: string;
}

function TemplatePdfViewerContent({ pdfUrl, templateName }: TemplatePdfViewerProps) {
  const docManagerCap = useDocumentManagerCapability();
  const { activeDocumentId, activeDocument } = useActiveDocument();
  const lastLoadedUrlRef = useRef<string | null>(null);
  const currentDocIdRef = useRef<string>("");
  const [currentDocId, setCurrentDocId] = useState<string>("");

  useEffect(() => {
    if (pdfUrl && docManagerCap && docManagerCap.provides && lastLoadedUrlRef.current !== pdfUrl) {
      lastLoadedUrlRef.current = pdfUrl;
      const previousDocId = currentDocIdRef.current;
      const newDocId = `doc-${Date.now()}`;

      // embedpdf's WASM worker requires an absolute URL — relative URLs have no
      // base in a Worker context and will silently fail to fetch.
      const absoluteUrl = pdfUrl.startsWith("http") ? pdfUrl : `${window.location.origin}${pdfUrl}`;

      currentDocIdRef.current = newDocId;
      setCurrentDocId(newDocId);
      docManagerCap.provides.openDocumentUrl({
        url: absoluteUrl,
        autoActivate: true,
        documentId: newDocId,
      });

      if (previousDocId) {
        docManagerCap.provides.closeDocument(previousDocId);
      }
    }
  }, [pdfUrl, docManagerCap]);

  const [isTimedOut, setIsTimedOut] = useState(false);

  useEffect(() => {
    setIsTimedOut(false);
    const timer = setTimeout(() => {
      if (!activeDocument || activeDocument.status !== "loaded") {
        setIsTimedOut(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
    // Tracks activeDocument?.status deliberately, not the whole object: embedpdf's
    // useActiveDocument() isn't confirmed stable across renders, and depending on
    // the whole object risks resetting this 10s timeout on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, activeDocument?.status]);

  if (activeDocument && activeDocument.status === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
        <p className="text-sm font-medium text-foreground">PDF preview currently unavailable</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md break-words">
          {activeDocument.error || "The template is compiling or could not generate a preview PDF."}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsTimedOut(false);
            lastLoadedUrlRef.current = null;
            if (docManagerCap?.provides) {
              const newDocId = `doc-${Date.now()}`;
              currentDocIdRef.current = newDocId;
              setCurrentDocId(newDocId);
              const base = pdfUrl.startsWith("http")
                ? pdfUrl
                : `${window.location.origin}${pdfUrl}`;
              docManagerCap.provides.openDocumentUrl({
                url: `${base}?t=${Date.now()}`,
                autoActivate: true,
                documentId: newDocId,
              });
            }
          }}
        >
          Reload Preview
        </Button>
      </div>
    );
  }

  if (
    !activeDocumentId ||
    activeDocumentId !== currentDocId ||
    !activeDocument ||
    activeDocument.status !== "loaded"
  ) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-foreground">
          {isTimedOut ? "Compiling LaTeX Template Source..." : "Rendering PDF Preview..."}
        </p>
        {isTimedOut && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setIsTimedOut(false);
              lastLoadedUrlRef.current = null;
              if (docManagerCap?.provides) {
                const newDocId = `doc-${Date.now()}`;
                currentDocIdRef.current = newDocId;
                setCurrentDocId(newDocId);
                const base = pdfUrl.startsWith("http")
                  ? pdfUrl
                  : `${window.location.origin}${pdfUrl}`;
                docManagerCap.provides.openDocumentUrl({
                  url: `${base}?t=${Date.now()}`,
                  autoActivate: true,
                  documentId: newDocId,
                });
              }
            }}
          >
            Retry Preview
          </Button>
        )}
      </div>
    );
  }

  return (
    <TemplatePdfViewerInner
      documentId={activeDocumentId}
      pdfUrl={pdfUrl}
      templateName={templateName}
    />
  );
}

function TemplatePdfViewerInner({
  documentId,
  pdfUrl,
  templateName,
}: {
  documentId: string;
  pdfUrl: string;
  templateName?: string;
}) {
  const scrollHook = useScroll(documentId);
  const zoomHook = useZoom(documentId);
  const panHook = usePan(documentId);
  const searchHook = useSearch(documentId);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const totalPages = scrollHook?.state?.totalPages ?? 1;
  const currentPage = scrollHook?.state?.currentPage ?? 1;
  const currentZoom = Math.round((zoomHook?.state?.currentZoomLevel ?? 1) * 100);
  const isPanning = panHook?.isPanning ?? false;

  const searchState = searchHook?.state;
  const activeSearchResultIndex = searchState?.activeResultIndex ?? 0;
  const totalSearchResults = searchState?.total ?? 0;

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchHook?.provides) {
      if (val.trim()) {
        searchHook.provides.searchAllPages(val);
      } else {
        searchHook.provides.stopSearch();
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-w-0 bg-muted/5 relative overflow-hidden select-none">
      {/* Aligned Branded Custom Toolbar (Identical to Editor) */}
      <div className="flex items-center justify-between px-3 border-b bg-muted/10 h-11 w-full shrink-0 gap-2 z-20">
        {/* Pointer / Pan Tools */}
        <div className="flex items-center gap-1 shrink-0 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 rounded-md transition-all duration-150 ${
              !isPanning
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              if (isPanning) panHook?.provides?.disablePan();
            }}
            title="Text Select Pointer"
          >
            <MousePointer className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 rounded-md transition-all duration-150 ${
              isPanning
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              if (!isPanning) panHook?.provides?.enablePan();
            }}
            title="Pan Hand Tool"
          >
            <Hand className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 shrink-0 bg-muted/40 p-0.5 rounded-lg border border-border/40">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => zoomHook?.provides?.zoomOut()}
            disabled={!zoomHook?.provides}
            title="Zoom Out"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            className="h-7 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-md transition-all whitespace-nowrap cursor-pointer"
            onClick={() => zoomHook?.provides?.requestZoom(ZoomMode.FitWidth)}
            title="Fit to Width"
          >
            {currentZoom}%
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => zoomHook?.provides?.zoomIn()}
            disabled={!zoomHook?.provides}
            title="Zoom In"
            className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Search & Download */}
        <div className="flex items-center gap-1.5 max-w-[200px] sm:max-w-[280px] justify-end">
          {showSearch ? (
            <div className="flex items-center border border-border/40 rounded-md bg-background px-2 h-7 gap-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find in document..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="text-[11px] outline-none border-none bg-transparent w-24 sm:w-36 font-sans text-foreground"
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
              size="icon"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setShowSearch(true)}
              title="Search document"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          )}
          {showSearch && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowSearch(false);
                handleSearchChange("");
              }}
              title="Close search"
            >
              <Plus className="h-3.5 w-3.5 rotate-45" />
            </Button>
          )}

          <a
            href={pdfUrl}
            download={`${templateName || "template"}.pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* EmbedPDF Canvas & Scroll Area */}
      <div className="flex-1 relative overflow-hidden">
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

        <Viewport documentId={documentId} className="w-full h-full overflow-auto">
          <GlobalPointerProvider documentId={documentId} className="w-full h-full">
            <ZoomGestureWrapper documentId={documentId} className="w-full min-h-full">
              <Scroller
                documentId={documentId}
                renderPage={({ pageIndex, width, height }) => (
                  <div
                    key={pageIndex}
                    style={{
                      width: `${width}px`,
                      height: `${height}px`,
                    }}
                    className="relative my-4 mx-auto shadow-xl rounded-xs bg-white border border-border overflow-hidden"
                  >
                    <PagePointerProvider
                      documentId={documentId}
                      pageIndex={pageIndex}
                      style={{
                        width: "100%",
                        height: "100%",
                        position: "relative",
                        display: "block",
                      }}
                    >
                      <RenderLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "block",
                          userSelect: "none",
                        }}
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
                        />
                      )}
                    </PagePointerProvider>
                  </div>
                )}
              />
            </ZoomGestureWrapper>
          </GlobalPointerProvider>
        </Viewport>
      </div>
    </div>
  );
}

export default function TemplatePdfViewer(props: TemplatePdfViewerProps) {
  const { engine, isLoading, error } = usePdfiumEngine({
    // Absolute, for the same reason the document URL below is: the engine fetches
    // this from inside its Worker, where a root-relative path has no base to
    // resolve against and fails silently, leaving the document stuck at "loading".
    wasmUrl: `${window.location.origin}/pdfium.wasm`,
    fontFallback: null,
  });

  if (!engine) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
        {isLoading || !error ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm font-medium text-foreground">Loading EmbedPDF Engine...</p>
          </>
        ) : (
          <p className="text-sm font-medium text-destructive">
            Failed to initialize EmbedPDF Engine
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden relative min-h-[500px]">
      <EmbedPDF plugins={pdfPlugins} engine={engine} config={{}}>
        <TemplatePdfViewerContent {...props} />
      </EmbedPDF>
    </div>
  );
}
