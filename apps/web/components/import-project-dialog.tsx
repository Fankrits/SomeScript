"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importProject } from "@/app/dashboard/actions";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ImportProjectDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      // Auto-populate project name if empty
      const nameInput = document.getElementById("import-name") as HTMLInputElement;
      if (nameInput && !nameInput.value) {
        // Strip .zip extension
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        nameInput.value = baseName;
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await importProject(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Project imported successfully!");
        setOpen(false);
        setFileName("");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to import project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-border hover:bg-secondary text-foreground font-medium gap-1.5 rounded-md shadow-sm">
          <Upload className="h-4 w-4" /> Import ZIP
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border text-foreground rounded-xl shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">Import LaTeX Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="import-file" className="text-muted-foreground text-sm font-medium">ZIP File</Label>
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="import-file"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-secondary/40 border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground font-medium">
                    {fileName ? fileName : "Click to upload a project .zip"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    ZIP file containing your LaTeX source documents
                  </p>
                </div>
                <input
                  id="import-file"
                  name="file"
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleFileChange}
                  required
                />
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-name" className="text-muted-foreground text-sm font-medium">Project Name</Label>
            <Input
              id="import-name"
              name="name"
              placeholder="e.g., Imported Physics Report"
              required
              className="bg-background border-border focus-visible:ring-primary rounded-md text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
