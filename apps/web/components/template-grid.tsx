"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, FileText, User, Trash2, ArrowUpRight, Bookmark, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UseTemplateDialog } from "@/components/use-template-dialog";
import {
  deleteTemplate,
  toggleBookmark as toggleBookmarkAction,
} from "@/app/dashboard/templates/actions";
import { TEMPLATE_CATEGORIES } from "@/lib/template-categories";
import Link from "next/link";
import Image from "next/image";

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
  initialBookmarkedIds?: string[];
}

const CATEGORIES = ["All", ...TEMPLATE_CATEGORIES];

export function TemplateGrid({
  templates,
  currentUserId,
  initialBookmarkedIds = [],
}: TemplateGridProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activeTab, setActiveTab] = useState<"all" | "saved" | "my">("all");
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(
    () => new Set(initialBookmarkedIds),
  );
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [useDialogOpen, setUseDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setBookmarkedIds(new Set(initialBookmarkedIds));
  }, [initialBookmarkedIds]);

  const toggleBookmark = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic UI update
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

    // Save to Database
    const res = await toggleBookmarkAction(id);
    if (res.error) {
      // Revert if error
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  };

  const myTemplatesCount = useMemo(() => {
    return templates.filter((tpl) => tpl.authorId === currentUserId).length;
  }, [templates, currentUserId]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchesTab =
        activeTab === "all"
          ? true
          : activeTab === "saved"
            ? bookmarkedIds.has(tpl.id)
            : activeTab === "my"
              ? tpl.authorId === currentUserId
              : true;

      const matchesSearch =
        search.trim() === "" ||
        tpl.name.toLowerCase().includes(search.toLowerCase()) ||
        tpl.description.toLowerCase().includes(search.toLowerCase()) ||
        tpl.category.toLowerCase().includes(search.toLowerCase());

      const matchesCategory = selectedCategory === "All" || tpl.category === selectedCategory;

      return matchesTab && matchesSearch && matchesCategory;
    });
  }, [templates, activeTab, bookmarkedIds, currentUserId, search, selectedCategory]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this template?")) return;

    setDeletingId(id);
    await deleteTemplate(id);
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar: Main Tabs & Search / Category Filters */}
      <div className="flex flex-col gap-4">
        {/* Main Section Tabs (All, Saved, My Published) */}
        <div className="flex items-center gap-1.5 border-b border-border/80 pb-3">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-secondary text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            All Templates
            <span className="text-[10px] font-mono opacity-70 bg-muted/60 px-1.5 py-0.2 rounded-md">
              {templates.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("saved")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "saved"
                ? "bg-secondary text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
            }`}
          >
            <Bookmark className="h-3.5 w-3.5 fill-current" />
            Saved
            <span className="text-[10px] font-mono opacity-70 bg-muted/60 px-1.5 py-0.2 rounded-md">
              {bookmarkedIds.size}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("my")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "my"
                ? "bg-secondary text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            My Published
            <span className="text-[10px] font-mono opacity-70 bg-muted/60 px-1.5 py-0.2 rounded-md">
              {myTemplatesCount}
            </span>
          </button>
        </div>

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
            {activeTab === "saved" ? (
              <Bookmark className="h-6 w-6" />
            ) : activeTab === "my" ? (
              <User className="h-6 w-6" />
            ) : (
              <FileText className="h-6 w-6" />
            )}
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {activeTab === "saved"
              ? "No saved templates"
              : activeTab === "my"
                ? "No published templates"
                : "No templates found"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs font-light mt-1 mb-4">
            {activeTab === "saved"
              ? "You haven't bookmarked any templates yet. Click the bookmark icon on any template card to save it for quick access."
              : activeTab === "my"
                ? "You haven't published any LaTeX templates yet. Share your designs with the community!"
                : search || selectedCategory !== "All"
                  ? "Try adjusting your search criteria or category filter."
                  : "No templates available in this section."}
          </p>

          {activeTab === "my" ? (
            <Button asChild size="sm">
              <Link href="/dashboard/templates/new">Publish Template</Link>
            </Button>
          ) : search || selectedCategory !== "All" || activeTab !== "all" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedCategory("All");
                setActiveTab("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => {
            const isBookmarked = bookmarkedIds.has(tpl.id);

            return (
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
                  <Image
                    src={`/api/template/thumbnail/${tpl.id}`}
                    alt=""
                    fill
                    loading="lazy"
                    className="object-cover object-top"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </Link>

                {/* Card Body */}
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase font-semibold px-2 py-0.5 tracking-wider bg-secondary/80"
                      >
                        {tpl.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-medium">
                        Used {tpl.usageCount.toLocaleString()}{" "}
                        {tpl.usageCount === 1 ? "time" : "times"}
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

                  {/* Card Footer: Author + Actions */}
                  <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground truncate max-w-[150px]">
                      {tpl.authorAvatarUrl ? (
                        <img
                          src={tpl.authorAvatarUrl}
                          alt={tpl.authorName || "Author"}
                          className="h-5 w-5 rounded-full object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium text-foreground/80">
                        {tpl.authorName
                          ? tpl.authorName.includes("@")
                            ? tpl.authorName.split("@")[0]
                            : tpl.authorName
                          : "Community"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Bookmark Toggle Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title={isBookmarked ? "Remove bookmark" : "Bookmark template"}
                        onClick={(e) => toggleBookmark(tpl.id, e)}
                      >
                        <Bookmark
                          className={`h-4 w-4 transition-all ${
                            isBookmarked ? "fill-primary text-primary" : "text-muted-foreground"
                          }`}
                        />
                      </Button>

                      {/* Delete Button (Owner only) */}
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

                      {/* Use Template Button */}
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
            );
          })}
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
