"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Upload,
  Loader2,
  FileArchive,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Eye,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { publishTemplate } from "@/app/dashboard/templates/actions";
import { TEMPLATE_CATEGORIES } from "@/lib/template-categories";

const TemplatePdfViewer = dynamic(
  () => import("@/components/template-pdf-viewer"),
  { ssr: false }
);

type Step = "form" | "compiling" | "preview";

interface FormValues {
  name: string;
  description: string;
  category: string;
}

export function PublishTemplateView() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");

  // Step 1: form
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>({
    name: "",
    description: "",
    category: "General",
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Step 2: compiling
  const [compileLog, setCompileLog] = useState<string | null>(null);
  const [compileFailed, setCompileFailed] = useState(false);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Step 3: preview
  const [stagingId, setStagingId] = useState<string | null>(null);

  // Step 3 → publish
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    setStep("form");
    setFile(null);
    setFormValues({ name: "", description: "", category: "General" });
    setFormError(null);
    setCompileLog(null);
    setCompileFailed(false);
    setStagingId(null);
    setElapsed(0);
    setPublishing(false);
    setPublishError(null);
    if (elapsedRef.current) clearInterval(elapsedRef.current);
  }, []);

  // ── drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (
      !dropped.name.endsWith(".zip") &&
      dropped.type !== "application/zip" &&
      dropped.type !== "application/x-zip-compressed"
    ) {
      setFormError("Please drop a valid .zip file");
      return;
    }
    setFormError(null);
    setFile(dropped);
  };

  // ── Step 1 → 2: compile & preview ─────────────────────────────────────────
  const handleCompileAndPreview = async () => {
    if (!file) return;
    if (!formValues.name.trim()) {
      setFormError("Template name is required before previewing");
      return;
    }
    setFormError(null);
    setCompileLog(null);
    setCompileFailed(false);
    setElapsed(0);
    setStep("compiling");

    elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/template/preview", { method: "POST", body: fd });
      const data = await res.json();

      if (elapsedRef.current) clearInterval(elapsedRef.current);

      if (!data.ok) {
        setCompileLog(data.log || "Compilation failed.");
        setCompileFailed(true);
        return;
      }

      setStagingId(data.tempId);
      setStep("preview");
    } catch (err: any) {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      setCompileLog(err.message || "Network error while compiling.");
      setCompileFailed(true);
    }
  };

  // ── Step 3: publish ────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!file) return;
    setPublishing(true);
    setPublishError(null);

    const fd = new FormData();
    fd.append("name", formValues.name);
    fd.append("description", formValues.description);
    fd.append("category", formValues.category);
    fd.append("file", file);

    const result = await publishTemplate(fd);
    setPublishing(false);

    if (result.error) {
      setPublishError(result.error);
    } else if (result.templateId) {
      router.push(`/dashboard/templates/${result.templateId}`);
    } else {
      router.push("/dashboard/templates");
    }
  };

  useEffect(() => {
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  const previewPdfUrl = stagingId ? `/api/template/pdf/staging:${stagingId}` : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.04),transparent_45%)] pointer-events-none" />

      {/* Navigation Header */}
      <header className="border-b border-border py-4 px-6 sm:px-8 flex items-center justify-between bg-card/60 backdrop-blur-xs z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/templates"
            className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <h1 className="text-sm font-semibold text-foreground hidden sm:block">
            Publish LaTeX Template
          </h1>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 sm:gap-4">
          <StepBadge index={1} label="Details & File" active={step === "form"} done={step !== "form"} />
          <StepDivider done={step !== "form"} />
          <StepBadge index={2} label="Compiling" active={step === "compiling"} done={step === "preview"} />
          <StepDivider done={step === "preview"} />
          <StepBadge index={3} label="PDF Preview" active={step === "preview"} done={false} />
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0 z-10 relative">
        {/* ── STEP 1: Form Page ──────────────────────────────────────────────── */}
        {step === "form" && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center">
            <div className="w-full max-w-3xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">Template Details</h2>
                <p className="text-xs sm:text-sm text-muted-foreground font-light mt-1">
                  Upload your LaTeX template archive (.zip) containing main.tex and supporting assets.
                </p>
              </div>

              {formError && (
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="page-tmpl-name" className="text-xs font-semibold text-foreground">
                    Template Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="page-tmpl-name"
                    placeholder="e.g. IEEE Conference Paper Template"
                    value={formValues.name}
                    onChange={(e) => setFormValues((v) => ({ ...v, name: e.target.value }))}
                    className="bg-background h-10"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="page-tmpl-category" className="text-xs font-semibold text-foreground">
                    Category
                  </Label>
                  <select
                    id="page-tmpl-category"
                    value={formValues.category}
                    onChange={(e) => setFormValues((v) => ({ ...v, category: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="page-tmpl-desc" className="text-xs font-semibold text-foreground">
                    Description
                  </Label>
                  <Textarea
                    id="page-tmpl-desc"
                    placeholder="Briefly describe what this template is for, key features, and included LaTeX packages..."
                    rows={4}
                    value={formValues.description}
                    onChange={(e) => setFormValues((v) => ({ ...v, description: e.target.value }))}
                    className="bg-background resize-none"
                  />
                </div>

                {/* Drop Zone */}
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-foreground">
                    Template Archive (.zip) <span className="text-destructive">*</span>
                  </Label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none ${
                      isDragging
                        ? "border-primary bg-primary/10 scale-[1.005]"
                        : file
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:border-primary/50 bg-background/50"
                    }`}
                    onClick={() => document.getElementById("page-zip-upload-input")?.click()}
                  >
                    <input
                      type="file"
                      accept=".zip"
                      id="page-zip-upload-input"
                      className="hidden"
                      onChange={(e) => {
                        setFormError(null);
                        setFile(e.target.files?.[0] || null);
                      }}
                    />
                    <div
                      className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                        file
                          ? "bg-primary/15 text-primary"
                          : isDragging
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-primary"
                      }`}
                    >
                      {file ? <CheckCircle2 className="h-6 w-6" /> : <FileArchive className="h-6 w-6" />}
                    </div>
                    {file ? (
                      <div>
                        <p className="text-sm font-semibold text-foreground truncate max-w-[400px] mx-auto">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(file.size / 1024).toFixed(1)} KB — Click or drag to replace archive
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {isDragging ? "Drop your .zip file here" : "Click to upload or drag & drop .zip archive"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Archive should include main.tex, figures, and style files (.cls, .sty)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/templates">Cancel</Link>
                  </Button>
                  <Button
                    onClick={handleCompileAndPreview}
                    disabled={!file || !formValues.name.trim()}
                    className="gap-2 cursor-pointer"
                  >
                    Next Step
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Compiling Page ─────────────────────────────────────────── */}
        {step === "compiling" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
            <div className="w-full max-w-xl bg-card border border-border rounded-xl p-8 shadow-xs flex flex-col items-center">
              {!compileFailed ? (
                <>
                  <div className="relative mb-6">
                    <div className="h-20 w-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-mono font-semibold text-foreground">{elapsed}s</span>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Compiling LaTeX Source</h3>
                  <p className="text-xs text-muted-foreground mt-2 max-w-md">
                    {elapsed < 10
                      ? "Unpacking archive and invoking Tectonic engine..."
                      : elapsed < 30
                      ? "Fetching TeX Live dependencies and compiling PDF..."
                      : "Finalizing PDF rendering..."}
                  </p>
                </>
              ) : (
                <>
                  <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Compilation Failed</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Tectonic encountered errors while processing your template.
                  </p>
                  {compileLog && (
                    <div className="w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/60 p-4 text-left mb-6">
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
                        {compileLog}
                      </pre>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button variant="outline" asChild>
                      <Link href="/dashboard/templates">Cancel</Link>
                    </Button>
                    <Button onClick={() => setStep("form")} className="gap-2">
                      <RotateCcw className="h-4 w-4" />
                      Back & Fix Source
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Preview Page ──────────────────────────────────────────── */}
        {step === "preview" && previewPdfUrl && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 h-full w-full">
            {/* Left: PDF Preview Box (Full Panel Size) */}
            <div className="flex-1 bg-card flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-border h-full w-full min-h-[350px]">
              <TemplatePdfViewer pdfUrl={previewPdfUrl} templateName={formValues.name} />
            </div>

            {/* Right: Sidebar Control & Metadata Panel */}
            <div className="w-full lg:w-80 bg-card p-6 flex flex-col justify-between overflow-y-auto shrink-0 space-y-6">
              <div className="space-y-6">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="h-3.5 w-3.5" />
                    Preview Mode
                  </span>
                  <h2 className="text-lg font-bold text-foreground mt-3 break-words">
                    {formValues.name}
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    Category: <span className="text-foreground">{formValues.category}</span>
                  </p>
                </div>

                {formValues.description && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Description
                    </Label>
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap bg-background/50 p-3 rounded-lg border border-border">
                      {formValues.description}
                    </p>
                  </div>
                )}

                {file && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Archive File
                    </Label>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-background/50 border border-border text-xs">
                      <FileArchive className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate text-foreground font-medium">{file.name}</span>
                    </div>
                  </div>
                )}

                {publishError && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {publishError}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-border space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep("form")}
                  disabled={publishing}
                >
                  Edit Details & File
                </Button>
                <Button
                  className="w-full gap-2 cursor-pointer"
                  onClick={handlePublish}
                  disabled={publishing}
                >
                  {publishing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publishing Template...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Publish Template
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepBadge({
  index,
  label,
  active,
  done,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
          done
            ? "bg-primary text-primary-foreground"
            : active
            ? "bg-primary/15 text-primary border-2 border-primary"
            : "bg-muted text-muted-foreground border-2 border-border"
        }`}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </div>
      <span
        className={`text-xs font-medium hidden md:inline ${
          active ? "text-primary font-semibold" : done ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepDivider({ done }: { done: boolean }) {
  return <div className={`h-0.5 w-4 sm:w-8 rounded transition-all ${done ? "bg-primary" : "bg-border"}`} />;
}
