import { IdeaCardData } from "@/components/IdeaCard";
import categories from "@/data/categories.json";

// Helper to read database directly on server-side (used during build/SSR)
function getServerIdeas(): IdeaCardData[] {
  if (typeof window === "undefined") {
    const fs = require("fs");
    const path = require("path");
    const dbPath = path.resolve(process.cwd(), "src/data/db.json");
    if (fs.existsSync(dbPath)) {
      try {
        return JSON.parse(fs.readFileSync(dbPath, "utf8"));
      } catch (e) {
        console.error("Failed to parse db.json on server:", e);
      }
    }
  }
  return [];
}

export async function getIdeasForCategory(slug: string): Promise<IdeaCardData[]> {
  if (typeof window === "undefined") {
    const all = getServerIdeas();
    return all.filter((idea) => idea.category === slug);
  }

  try {
    const response = await fetch(`/api/ideas?category=${slug}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Failed to fetch ideas for category ${slug}:`, error);
  }
  return [];
}

export async function refreshCategory(slug: string): Promise<IdeaCardData[]> {
  const response = await fetch("/api/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: slug })
  });

  if (response.ok) {
    return await response.json();
  } else {
    const errData = await response.json();
    throw new Error(errData.error || "Failed to refresh category.");
  }
}

export async function getAllIdeas(): Promise<IdeaCardData[]> {
  if (typeof window === "undefined") {
    return getServerIdeas();
  }

  try {
    const response = await fetch("/api/ideas");
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error("Failed to fetch all ideas:", error);
  }
  return [];
}

export async function getIdeaById(id: string): Promise<IdeaCardData | null> {
  const all = await getAllIdeas();
  return all.find((idea) => idea.id === id) || null;
}

export async function getTrendingIdeas(): Promise<IdeaCardData[]> {
  const all = await getAllIdeas();
  return [...all].sort((a, b) => b.momentumScore - a.momentumScore).slice(0, 3);
}

export async function getCategoryIdeaCounts(): Promise<Record<string, number>> {
  const all = await getAllIdeas();
  const counts: Record<string, number> = {};
  for (const cat of categories) {
    counts[cat.slug] = all.filter((i) => i.category === cat.slug).length;
  }
  return counts;
}
