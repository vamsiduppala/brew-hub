"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, SlidersHorizontal, Search, RotateCcw, HelpCircle, RefreshCw } from "lucide-react";
import IdeaCard, { IdeaCardData, IdeaCardSkeleton } from "@/components/IdeaCard";

type CategoryContentProps = {
  category: {
    slug: string;
    name: string;
    description: string;
    icon: string;
    subreddits: string[];
  };
  initialIdeas: IdeaCardData[];
};

export default function CategoryContent({ category, initialIdeas }: CategoryContentProps) {
  const [allIdeas, setAllIdeas] = useState<IdeaCardData[]>(initialIdeas);
  const [ideas, setIdeas] = useState<IdeaCardData[]>(initialIdeas);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string[]>([]);
  const [selectedMomentum, setSelectedMomentum] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"score" | "difficulty" | "title">("score");
  const [isPending, startTransition] = useTransition();
  const [isLocalLoading, setIsLocalLoading] = useState(false);

  // WebView Context Detection
  const [isInReddit, setIsInReddit] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.parent !== window) {
      setIsInReddit(true);
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const { refreshCategory } = await import("@/utils/data");
      const freshIdeas = await refreshCategory(category.slug);
      setAllIdeas(freshIdeas);
    } catch (err: any) {
      setRefreshError(err.message || "An error occurred during refresh.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter & Sort Logic
  useEffect(() => {
    setIsLocalLoading(true);
    const timer = setTimeout(() => {
      startTransition(() => {
        let filtered = [...allIdeas];

        // Search text filter
        if (searchQuery.trim() !== "") {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (idea) =>
              idea.title.toLowerCase().includes(query) ||
              idea.tagline.toLowerCase().includes(query) ||
              idea.tags.some((tag) => tag.toLowerCase().includes(query))
          );
        }

        // Difficulty filter
        if (selectedDifficulty.length > 0) {
          filtered = filtered.filter((idea) => selectedDifficulty.includes(idea.difficulty));
        }

        // Momentum filter
        if (selectedMomentum.length > 0) {
          filtered = filtered.filter((idea) => selectedMomentum.includes(idea.momentum));
        }

        // Sorting
        filtered.sort((a, b) => {
          if (sortBy === "score") {
            return b.momentumScore - a.momentumScore;
          }
          if (sortBy === "title") {
            return a.title.localeCompare(b.title);
          }
          if (sortBy === "difficulty") {
            const difficulties = { "Beginner": 1, "Intermediate": 2, "Advanced": 3 };
            return difficulties[a.difficulty] - difficulties[b.difficulty];
          }
          return 0;
        });

        setIdeas(filtered);
        setIsLocalLoading(false);
      });
    }, 250); // Small delay to highlight the premium skeleton shimmers

    return () => clearTimeout(timer);
  }, [searchQuery, selectedDifficulty, selectedMomentum, sortBy, allIdeas]);

  const toggleDifficulty = (difficulty: string) => {
    setSelectedDifficulty((prev) =>
      prev.includes(difficulty) ? prev.filter((d) => d !== difficulty) : [...prev, difficulty]
    );
  };

  const toggleMomentum = (momentum: string) => {
    setSelectedMomentum((prev) =>
      prev.includes(momentum) ? prev.filter((m) => m !== momentum) : [...prev, momentum]
    );
  };

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedDifficulty([]);
    setSelectedMomentum([]);
    setSortBy("score");
  };

  return (
    <div className="space-y-8">
      {/* Back button & Header */}
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to categories</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{category.name}</h1>
            <p className="text-muted text-sm sm:text-base max-w-2xl leading-relaxed">
              {category.description}
            </p>
            {/* Seed subreddits sources */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
              <span className="font-semibold">Analyzed sources:</span>
              {category.subreddits.map((sub) => (
                <span
                  key={sub}
                  className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border/40 font-mono"
                >
                  r/{sub}
                </span>
              ))}
            </div>
          </div>

          {isInReddit && (
            <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0 pt-1">
              <button
                disabled={isRefreshing}
                onClick={handleRefresh}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-primary bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>{isRefreshing ? "Refreshing..." : "Refresh from Reddit"}</span>
              </button>
              {refreshError && (
                <span className="text-[10px] text-destructive max-w-[200px] text-left font-medium">
                  {refreshError}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Control panel (Search & Filters) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left column: Filter options */}
        <aside className="lg:col-span-1 space-y-6 lg:sticky lg:top-24 h-fit">
          <div className="p-5 rounded-2xl border border-border bg-card/60 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-bold flex items-center gap-2 text-sm">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                <span>Filters</span>
              </span>
              {(selectedDifficulty.length > 0 || selectedMomentum.length > 0 || searchQuery !== "") && (
                <button
                  onClick={resetFilters}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Query tags or names..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-background/50 focus:border-primary focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Difficulty Filter */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Difficulty</label>
              <div className="flex flex-col gap-2">
                {["Beginner", "Intermediate", "Advanced"].map((dif) => {
                  const active = selectedDifficulty.includes(dif);
                  return (
                    <button
                      key={dif}
                      onClick={() => toggleDifficulty(dif)}
                      className={`w-full text-left text-xs font-medium px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background/40 hover:bg-secondary border-border/80 text-foreground/80"
                      }`}
                    >
                      {dif}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Momentum Filter */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Momentum</label>
              <div className="flex flex-col gap-2">
                {["Emerging", "Heating Up", "Hot", "Crowded"].map((mom) => {
                  const active = selectedMomentum.includes(mom);
                  return (
                    <button
                      key={mom}
                      onClick={() => toggleMomentum(mom)}
                      className={`w-full text-left text-xs font-medium px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background/40 hover:bg-secondary border-border/80 text-foreground/80"
                      }`}
                    >
                      {mom}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sorting Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-border bg-background/40 focus:outline-none focus:border-primary"
              >
                <option value="score">Momentum Score</option>
                <option value="difficulty">Difficulty Level</option>
                <option value="title">Alphabetical (A-Z)</option>
              </select>
            </div>
          </div>
        </aside>

        {/* Right column: Cards grid */}
        <main className="lg:col-span-3">
          {isLocalLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <IdeaCardSkeleton key={i} />
              ))}
            </div>
          ) : ideas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {ideas.map((idea, idx) => (
                <IdeaCard key={idea.id} data={idea} index={idx} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 p-8 rounded-2xl border border-dashed border-border bg-card/20 max-w-md mx-auto space-y-4">
              <HelpCircle className="w-12 h-12 text-muted mx-auto" />
              <h3 className="font-extrabold text-lg">No ideas match your filters</h3>
              <p className="text-xs text-muted leading-relaxed">
                Try loosening your filters, removing search terms, or restoring defaults to browse other ideas in this category.
              </p>
              <button
                onClick={resetFilters}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs transition-opacity hover:opacity-90 cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
