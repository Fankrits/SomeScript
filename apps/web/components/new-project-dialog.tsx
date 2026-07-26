"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject } from "@/app/dashboard/actions";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Plus, Loader2 } from "lucide-react";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await createProject(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/95 text-primary-foreground font-medium gap-1.5 rounded-md shadow-md shadow-primary/10">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground rounded-xl shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">Create LaTeX Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-muted-foreground text-sm font-medium">Project Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., Physics Lab Report"
              required
              className="bg-background border-border focus-visible:ring-primary rounded-md text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              {error.includes("Upgrade") && <UpgradeDialog />}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-border hover:bg-secondary bg-card text-foreground rounded-md"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary hover:bg-primary/95 text-primary-foreground rounded-md"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
