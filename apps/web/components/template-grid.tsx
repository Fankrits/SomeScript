"use client";

import React, { useState, useMemo } from "react";
import { Search, Sparkles, FileText, User, Tag, Trash2, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UseTemplateDialog } from "@/components/use-template-dialog";
import { deleteTemplate } from "@/app/dashboard/templates/actions";
import { TEMPLATE_CATEGORIES } from "@/lib/template-categories";
import Link from "next/link";

export interface TemplateItem {
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

interface TemplateGridProps {
  templates: TemplateItem[];
  currentUserId: string;
}

const CATEGORIES = ["All", ...TEMPLATE_CATEGORIES];


export function TemplateGrid({ templates, currentUserId }: TemplateGridProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchesSearch =
        search.trim() === "" ||
        tpl.name.toLowerCase().includes(search.toLowerCase()) ||
        tpl.description.toLowerCase().includes(search.toLowerCase()) ||
        tpl.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory =
        selectedCategory === "All" || tpl.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [templates, search, selectedCategory]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this template?")) return;

    setDeletingId(id);
    await deleteTemplate(id);
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Search & Category Filter Header */}
      <div className="flex flex-col gap-4">
        {/* Search Bar */}
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates by name, keywords, or category..."
            className="pl-10 h-10 w-full bg-card border-border shadow-xs rounded-lg text-sm"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-0.5 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Templates */}
      {filteredTemplates.length === 0 ? (
        <div className="h-[360px] rounded-xl border border-dashed border-border bg-card/40 flex flex-col items-center justify-center text-center p-8 max-w-xl mx-auto my-8 shadow-xs">
          <div className="h-12 w-12 rounded-lg bg-secondary/60 border border-border flex items-center justify-center text-primary mb-3">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No templates found</h3>
          <p className="text-xs text-muted-foreground max-w-xs font-light mt-1 mb-4">
            {search || selectedCategory !== "All"
              ? "Try adjusting your search criteria or category filter."
              : "No public templates available yet. Be the first to publish one!"}
          </p>
          {(search || selectedCategory !== "All") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedCategory("All");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-200"
            >
              <Link
                href={`/dashboard/templates/${tpl.id}`}
                className="relative block aspect-[16/10] w-full shrink-0 overflow-hidden border-b border-border bg-muted/40"
              >
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                  <FileText className="h-10 w-10" />
                </div>
                <img
                  src={`/api/template/thumbnail/${tpl.id}`}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </Link>

              <div className="flex flex-1 flex-col justify-between p-5">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px] uppercase font-semibold px-2 py-0.5 tracking-wider bg-secondary/80">
                      {tpl.category}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono bg-muted/40 px-2 py-0.5 rounded-full border border-border/50">
                      Used {tpl.usageCount.toLocaleString()} {tpl.usageCount === 1 ? "time" : "times"}
                    </span>
                  </div>

                  <div>
                    <Link
                      href={`/dashboard/templates/${tpl.id}`}
                      className="font-semibold text-base text-foreground group-hover:text-primary transition-colors line-clamp-1 hover:underline"
                    >
                      {tpl.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {tpl.description || "No description provided."}
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground truncate max-w-[170px]">
                    {tpl.authorAvatarUrl ? (
                      <img
                        src={tpl.authorAvatarUrl}
                        alt={tpl.authorName || "Author"}
                        className="h-5 w-5 rounded-full object-cover shrink-0 border border-border"
                      />
                    ) : (
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium text-foreground/80">{tpl.authorName || "Community"}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/templates/${tpl.id}`}
                      className="inline-flex items-center justify-center rounded-md text-xs font-medium h-8 px-2.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Preview
                    </Link>
                    {tpl.authorId === currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(tpl.id, e)}
                        disabled={deletingId === tpl.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-1 shadow-2xs"
                      onClick={() => {
                        setSelectedTemplate(tpl);
                        setUseDialogOpen(true);
                      }}
                    >
                      Use
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog for creating project from template */}
      <UseTemplateDialog
        template={selectedTemplate}
        open={useDialogOpen}
        onOpenChange={setUseDialogOpen}
      />
    </div>
  );
}
