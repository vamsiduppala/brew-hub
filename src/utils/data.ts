import { IdeaCardData } from "@/components/IdeaCard";
import categories from "@/data/categories.json";
import mockIdeas from "@/data/mock-ideas.json";

let categoryCallbacks: Record<string, (ideas: IdeaCardData[]) => void> = {};
let allIdeasCallback: ((ideas: IdeaCardData[]) => void) | null = null;

// Listen for message events sent by the parent Reddit Devvit app container
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data) {
      if (data.type === "IDEAS_RESPONSE") {
        const category = data.category;
        if (categoryCallbacks[category]) {
          categoryCallbacks[category](data.ideas);
        }
      }
      if (data.type === "ALL_IDEAS_RESPONSE") {
        if (allIdeasCallback) {
          allIdeasCallback(data.ideas);
        }
      }
    }
  });
}

export async function getIdeasForCategory(slug: string): Promise<IdeaCardData[]> {
  // Check if running inside Reddit WebView iframe
  if (typeof window !== "undefined" && window.parent !== window) {
    return new Promise((resolve) => {
      categoryCallbacks[slug] = (ideas) => {
        resolve(ideas);
      };
      window.parent.postMessage({ type: "GET_IDEAS", category: slug }, "*");
    });
  }

  // Standalone mode: load statically
  try {
    const module = await import(`@/data/${slug}.json`);
    return module.default as IdeaCardData[];
  } catch (error) {
    // Fallback to mock data filtered by category
    return (mockIdeas as IdeaCardData[]).filter(
      (idea) => idea.category === slug
    );
  }
}

export async function getAllIdeas(): Promise<IdeaCardData[]> {
  // Check if running inside Reddit WebView iframe
  if (typeof window !== "undefined" && window.parent !== window) {
    return new Promise((resolve) => {
      allIdeasCallback = (ideas) => {
        resolve(ideas);
      };
      window.parent.postMessage({ type: "GET_ALL_IDEAS" }, "*");
    });
  }

  let allIdeas: IdeaCardData[] = [...(mockIdeas as IdeaCardData[])];
  
  for (const cat of categories) {
    try {
      const module = await import(`@/data/${cat.slug}.json`);
      if (module && module.default) {
        // Remove mock items for this category to avoid duplicates, then add real ones
        allIdeas = [
          ...allIdeas.filter((i) => i.category !== cat.slug),
          ...(module.default as IdeaCardData[]),
        ];
      }
    } catch (e) {
      // JSON file doesn't exist yet, ignore and keep mock items
    }
  }
  
  return allIdeas;
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
  if (typeof window !== "undefined" && window.parent !== window) {
    const all = await getAllIdeas();
    const counts: Record<string, number> = {};
    for (const cat of categories) {
      counts[cat.slug] = all.filter((i) => i.category === cat.slug).length;
    }
    return counts;
  }

  const counts: Record<string, number> = {};
  
  for (const cat of categories) {
    counts[cat.slug] = (mockIdeas as IdeaCardData[]).filter(
      (idea) => idea.category === cat.slug
    ).length;
  }

  for (const cat of categories) {
    try {
      const module = await import(`@/data/${cat.slug}.json`);
      if (module && module.default) {
        counts[cat.slug] = (module.default as IdeaCardData[]).length;
      }
    } catch (e) {
      // file does not exist, keep mock count
    }
  }

  return counts;
}
