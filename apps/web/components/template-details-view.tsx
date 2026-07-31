"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Sparkles, Pencil, Trash2, ArrowUpRight, Calendar, Layers, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UseTemplateDialog } from "@/components/use-template-dialog";
import { EditTemplateDialog } from "@/components/edit-template-dialog";
import { deleteTemplate } from "@/app/dashboard/templates/actions";
import { format } from "date-fns";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const TemplatePdfViewer = dynamic(() => import("@/components/template-pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
      <p className="text-sm font-medium text-foreground">Initializing PDF Preview Engine...</p>
    </div>
  ),
});

export interface TemplateDetails {
  id: string;
  name: string;
  description: string;
  category: string;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  usageCount: number;
  createdAt: Date;
}

interface TemplateDetailsViewProps {
  template: TemplateDetails;
  currentUserId: string;
}

export function TemplateDetailsView({ template, currentUserId }: TemplateDetailsViewProps) {
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = template.authorId === currentUserId;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    setDeleting(true);
    const res = await deleteTemplate(template.id);
    if (res.success) {
      window.location.href = "/dashboard/templates";
    } else {
      alert(res.error || "Failed to delete template");
      setDeleting(false);
    }
  };

  const pdfUrl = `/api/template/pdf/${template.id}`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Bar */}
      <div className="border-b border-border py-3 px-6 flex items-center justify-between bg-card/60 backdrop-blur-xs z-10 shrink-0">
        <Link
          href="/dashboard/templates"
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Templates
        </Link>

        <div className="flex items-center gap-2">
          {isOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer"
                onClick={() => setEditDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/20 cursor-pointer"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </>
          )}

          <Button
            size="sm"
            className="gap-1.5 shadow-xs cursor-pointer"
            onClick={() => setUseDialogOpen(true)}
          >
            Use Template
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: PDF Preview Box (Full Panel Size) */}
        <div className="flex-1 bg-card flex flex-col overflow-hidden border-b lg:border-b-0 lg:border-r border-border h-full w-full">
          <TemplatePdfViewer pdfUrl={pdfUrl} templateName={template.name} />
        </div>

        {/* Right: Sidebar Meta Panel */}
        <div className="w-full lg:w-96 bg-card p-6 flex flex-col justify-between overflow-y-auto shrink-0 space-y-6">
          <div className="space-y-6">
            <div>
              <Badge variant="secondary" className="text-[10px] uppercase font-semibold px-2 py-0.5 tracking-wider mb-2">
                {template.category}
              </Badge>
              <h1 className="text-2xl font-bold text-foreground tracking-tight leading-snug">
                {template.name}
              </h1>
            </div>

            {/* Author Block with Clerk Avatar */}
            <div className="p-3.5 rounded-xl border border-border bg-secondary/30 flex items-center gap-3">
              {template.authorAvatarUrl ? (
                <img
                  src={template.authorAvatarUrl}
                  alt={template.authorName || "Author"}
                  className="h-10 w-10 rounded-full object-cover border border-border shadow-2xs"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground border border-border">
                  <User className="h-5 w-5" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-muted-foreground font-light">Created by</span>
                <span className="text-sm font-semibold text-foreground truncate">
                  {template.authorName || "Community Member"}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-border bg-background flex flex-col">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Usage
                </span>
                <span className="text-lg font-bold text-foreground mt-1">
                  {template.usageCount.toLocaleString()} {template.usageCount === 1 ? "time" : "times"}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-border bg-background flex flex-col">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Published
                </span>
                <span className="text-sm font-semibold text-foreground mt-1.5 truncate">
                  {format(new Date(template.createdAt), "MMM d, yyyy")}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</h3>
              <p className="text-sm text-foreground/90 leading-relaxed font-light whitespace-pre-wrap">
                {template.description || "No detailed description provided for this template."}
              </p>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-border space-y-2">
            <Button
              className="w-full gap-2 shadow-xs cursor-pointer h-10"
              onClick={() => setUseDialogOpen(true)}
            >
              Use Template in Workspace
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <UseTemplateDialog
        template={template}
        open={useDialogOpen}
        onOpenChange={setUseDialogOpen}
      />

      {isOwner && (
        <EditTemplateDialog
          template={template}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      )}
    </div>
  );
}
