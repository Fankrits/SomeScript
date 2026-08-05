"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Loader2, FileArchive } from "lucide-react";
import { updateTemplate } from "@/app/dashboard/templates/actions";
import { TEMPLATE_CATEGORIES } from "@/lib/template-categories";

interface EditTemplateDialogProps {
  template: {
    id: string;
    name: string;
    description: string;
    category: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTemplateDialog({ template, open, onOpenChange }: EditTemplateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (
        !droppedFile.name.endsWith(".zip") &&
        droppedFile.type !== "application/zip" &&
        droppedFile.type !== "application/x-zip-compressed"
      ) {
        setError("Please drop a valid .zip file");
        return;
      }
      setError(null);
      setFile(droppedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("templateId", template.id);
    if (file) {
      formData.set("file", file);
    }

    const result = await updateTemplate(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-border bg-card">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit LaTeX Template</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Update template details or re-upload the .zip project files.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-medium">
                Template Name
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={template.name}
                required
                className="bg-background"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="category" className="text-xs font-medium">
                Category
              </Label>
              <select
                id="category"
                name="category"
                defaultValue={template.category}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description" className="text-xs font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={template.description}
                rows={3}
                className="bg-background resize-none"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-xs font-medium">Update Template ZIP File (Optional)</Label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                  isDragging
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-border hover:border-primary/50 bg-background/50"
                }`}
              >
                <input
                  type="file"
                  accept=".zip"
                  id="edit-zip-upload"
                  className="hidden"
                  onChange={(e) => {
                    setError(null);
                    setFile(e.target.files?.[0] || null);
                  }}
                />
                <label
                  htmlFor="edit-zip-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${
                      isDragging
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-primary"
                    }`}
                  >
                    <FileArchive className="h-4 w-4" />
                  </div>
                  {file ? (
                    <span className="text-sm font-medium text-foreground truncate max-w-[280px]">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  ) : (
                    <>
                      <span className="text-xs font-medium text-foreground">
                        {isDragging
                          ? "Drop your new .zip file here"
                          : "Click or drag to replace .zip file"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Leave empty to keep existing files
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
