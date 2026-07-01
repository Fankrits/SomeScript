import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Files,
  FileText,
  RefreshCw,
  Regex,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  text: string;
  matchIndex: number;
}

interface SearchPanelProps {
  selectedPath: string | null;
  onSelectMatch: (filePath: string, line: number) => void;
  onReplaceAll: (replaceText: string, searchState: { query: string; options: any }) => void;
}

export interface SearchPanelHandle {
  focusSearch: () => void;
  setSearchValue: (val: string) => void;
}

export const SearchPanel = forwardRef<SearchPanelHandle, SearchPanelProps>(
  ({ selectedPath, onSelectMatch, onReplaceAll }, ref) => {
    const [query, setQuery] = useState("");
    const [replaceText, setReplaceText] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Options
    const [matchCase, setMatchCase] = useState(false);
    const [matchWholeWord, setMatchWholeWord] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [searchScope, setSearchScope] = useState<"all" | "current">("all");

    // Line Range Filter
    const [startLine, setStartLine] = useState<string>("");
    const [endLine, setEndLine] = useState<string>("");

    // Results from server
    const [results, setResults] = useState<SearchResult[]>([]);
    const [resultsByFile, setResultsByFile] = useState<Record<string, { name: string; matches: SearchResult[] }>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
      setSearchValue: (val: string) => {
        setQuery(val);
      },
    }));

    const fetchResults = async () => {
      if (!query) {
        setResults([]);
        setResultsByFile({});
        return;
      }
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          query,
          matchCase: String(matchCase),
          matchWholeWord: String(matchWholeWord),
          useRegex: String(useRegex),
          scope: searchScope,
          selectedPath: selectedPath || "",
          startLine: startLine,
          endLine: endLine,
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        if (data.results) {
          setResults(data.results);
          setResultsByFile(data.resultsByFile || {});
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce/Trigger search on option change or typing
    useEffect(() => {
      const timer = setTimeout(() => {
        fetchResults();
      }, 300);
      return () => clearTimeout(timer);
    }, [query, matchCase, matchWholeWord, useRegex, searchScope, selectedPath, startLine, endLine]);

    const toggleFileExpand = (fileId: string) => {
      setExpandedFiles((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
    };

    const handleCollapseAll = () => {
      const collapsed: Record<string, boolean> = {};
      Object.keys(resultsByFile).forEach((id) => {
        collapsed[id] = false;
      });
      setExpandedFiles(collapsed);
    };

    const handleExpandAll = () => {
      setExpandedFiles({});
    };

    return (
      <div className="flex flex-col h-full bg-background select-none">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-[10px] text-muted-foreground tracking-wider uppercase">
              Code Search
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
              title="Clear Search"
              onClick={() => setQuery("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
              title="Refresh"
              onClick={fetchResults}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="p-3 space-y-2 border-b border-border bg-background/50">
          <div className="flex items-center gap-1 mb-2">
            <button
              type="button"
              onClick={() => setSearchScope("current")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer border",
                searchScope === "current"
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "text-muted-foreground hover:bg-muted border-transparent"
              )}
            >
              <FileText className="w-3 h-3" />
              Current File
            </button>
            <button
              type="button"
              onClick={() => setSearchScope("all")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer border",
                searchScope === "all"
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "text-muted-foreground hover:bg-muted border-transparent"
              )}
            >
              <Files className="w-3 h-3" />
              All Files
            </button>
          </div>

          <div className="relative group">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded px-2 py-1.5 pr-20 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground text-foreground"
            />
            <div className="absolute right-1 top-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setMatchCase(!matchCase)}
                className={cn(
                  "p-1 rounded text-xs transition-colors cursor-pointer",
                  matchCase
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                title="Match Case"
              >
                <CaseSensitive className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMatchWholeWord(!matchWholeWord)}
                className={cn(
                  "p-1 rounded text-xs transition-colors cursor-pointer",
                  matchWholeWord
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                title="Match Whole Word"
              >
                <WholeWord className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setUseRegex(!useRegex)}
                className={cn(
                  "p-1 rounded text-xs transition-colors cursor-pointer",
                  useRegex
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                title="Use Regular Expression"
              >
                <Regex className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {searchScope === "current" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex-1 flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded px-2 py-1">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/50 min-w-[32px]">
                  From
                </span>
                <input
                  type="number"
                  placeholder="..."
                  value={startLine}
                  onChange={(e) => setStartLine(e.target.value)}
                  className="w-full bg-transparent border-none text-[10px] focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                />
              </div>
              <div className="flex-1 flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded px-2 py-1">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/50 min-w-[20px]">
                  To
                </span>
                <input
                  type="number"
                  placeholder="..."
                  value={endLine}
                  onChange={(e) => setEndLine(e.target.value)}
                  className="w-full bg-transparent border-none text-[10px] focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                />
              </div>
              {(startLine || endLine) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartLine("");
                    setEndLine("");
                  }}
                  className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
                  title="Clear Line Range"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <div className="relative group">
            <input
              type="text"
              placeholder="Replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded px-2 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground text-foreground"
            />
            <button
              type="button"
              onClick={() => onReplaceAll(replaceText, { query, options: { matchCase, matchWholeWord, useRegex, scope: searchScope } })}
              className="absolute right-1 top-1 p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
              title="Replace All"
              disabled={results.length === 0}
            >
              <ReplaceAll className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 min-h-[20px]">
            {query && results.length > 0 && (
              <>
                <span>
                  {results.length} results in{" "}
                  {Object.keys(resultsByFile).length}{" "}
                  {Object.keys(resultsByFile).length === 1 ? "file" : "files"}
                </span>
                <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Collapse All"
                    onClick={handleCollapseAll}
                  >
                    <ChevronsDownUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Expand All"
                    onClick={handleExpandAll}
                  >
                    <ChevronsUpDown className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {Object.entries(resultsByFile).map(([fileId, { name, matches }]) => (
            <div key={fileId} className="group/file">
              <button
                type="button"
                onClick={() => toggleFileExpand(fileId)}
                className="flex items-center gap-1 px-2 py-1 hover:bg-muted/50 cursor-pointer transition-colors w-full text-left"
              >
                {expandedFiles[fileId] === false ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                <span className="text-xs font-medium truncate flex-1 text-foreground">
                  {name}
                </span>
                <span className="text-[10px] bg-muted px-1.5 rounded-full text-muted-foreground group-hover/file:bg-primary/20 group-hover/file:text-primary transition-colors">
                  {matches.length}
                </span>
              </button>

              {expandedFiles[fileId] !== false && (
                <div className="ml-4 space-y-0.5 my-1">
                  {matches.map((match, i) => (
                    <button
                      type="button"
                      key={`${match.fileId}-${match.line}-${i}`}
                      onClick={() => onSelectMatch(match.fileId, match.line)}
                      className="flex items-center px-2 py-0.5 hover:bg-muted cursor-pointer group/item transition-colors w-full text-left"
                    >
                      <span className="text-[10px] text-muted-foreground w-6 tabular-nums">
                        {match.line}
                      </span>
                      <span className="text-xs text-foreground/80 truncate w-full overflow-hidden italic">
                        {match.text.trim()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {query && results.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground mb-2 opacity-20" />
              <p className="text-xs text-muted-foreground">
                No results found for "{query}"
              </p>
            </div>
          )}

          {!query && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/40 mt-10">
              <Search className="w-12 h-12 mb-4" />
              <p className="text-xs uppercase tracking-widest font-semibold italic">
                Search the codebase
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SearchPanel.displayName = "SearchPanel";
