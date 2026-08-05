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
import { Loader2, ArrowRight } from "lucide-react";
import { useTemplate } from "@/app/dashboard/templates/actions";

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  authorName: string | null;
  usageCount: number;
}

interface UseTemplateDialogProps {
  template: TemplateItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UseTemplateDialog({ template, open, onOpenChange }: UseTemplateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  React.useEffect(() => {
    if (template) {
      setProjectName(template.name);
    }
  }, [template]);

  if (!template) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // eslint-disable-next-line react-hooks/rules-of-hooks -- useTemplate is a "use server" action (app/dashboard/templates/actions.ts), not a React hook; the rule only flags it because of the use* name
    const result = await useTemplate(template.id, projectName);

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else if (result.redirectUrl) {
      window.location.href = result.redirectUrl;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] border-border bg-card">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create Project from Template</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Create a new document using{" "}
              <span className="font-semibold text-foreground">{template.name}</span>.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {error}
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectName" className="text-xs font-medium">
                Project Name
              </Label>
              <Input
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Document"
                required
                className="bg-background"
              />
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
                  Creating Project...
                </>
              ) : (
                <>
                  Create & Open Editor
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
