import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "src/data/db.json");
const CATEGORIES_PATH = path.resolve(process.cwd(), "src/data/categories.json");

// Helper to decode HTML entities in RSS XML
function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

// Helper to strip HTML tags
function stripHTML(html: string): string {
  let clean = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  clean = clean.replace(/<[^>]*?>/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();
  return decodeHTMLEntities(clean);
}

// Regex-based RSS entry parser
function parseRedditRSS(xmlText: string): any[] {
  const entries: any[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryContent = match[1];
    const titleMatch = entryContent.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? decodeHTMLEntities(titleMatch[1]) : "";
    
    const linkMatch = entryContent.match(/<link href="([^"]*?)"/);
    const url = linkMatch ? linkMatch[1] : "";
    
    const contentMatch = entryContent.match(/<content[^>]*?>([\s\S]*?)<\/content>/);
    const rawContent = contentMatch ? contentMatch[1] : "";
    const text = stripHTML(rawContent).substring(0, 1000);
    
    entries.push({ title, url, text });
  }
  return entries;
}

// Crawl RSS feeds for subreddits in a category
async function crawlCategoryRSS(cat: any) {
  const rawThreads: any[] = [];
  for (const sub of cat.subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/new/.rss`;
      const response = await fetch(url, {
        headers: { "User-Agent": "brew-ideas-hub/1.0" }
      });
      
      if (response.ok) {
        const xmlText = await response.text();
        const parsed = parseRedditRSS(xmlText).slice(0, 10);
        for (const t of parsed) {
          rawThreads.push({
            title: t.title,
            text: t.text,
            subreddit: sub,
            url: t.url,
            score: 1
          });
        }
      }
    } catch (err) {
      console.error(`Failed to crawl RSS for r/${sub}:`, err);
    }
  }
  return rawThreads;
}

// Generate ideas using Gemini API
async function generateIdeas(slug: string, rawThreads: any[], apiKey: string) {
  const prompt =
    "Generate 6 distinct, startable Idea Cards based on these raw Reddit threads. " +
    "Each card must conform strictly to the Pydantic schema structure. " +
    "Do not frame things as complaints. Capture 'the tea' in a fun, encouraging tone.\n\n" +
    `Input Threads:\n${JSON.stringify(rawThreads)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            ideas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  category: { type: "string" },
                  title: { type: "string" },
                  tagline: { type: "string" },
                  whatItIs: { type: "string" },
                  momentum: { type: "string" },
                  momentumScore: { type: "number" },
                  momentumWhy: { type: "string" },
                  difficulty: { type: "string" },
                  whyNow: { type: "string" },
                  theTea: { type: "string" },
                  whoIsDoingIt: { type: "string" },
                  gettingStarted: { type: "array", items: { type: "string" } },
                  tags: { type: "array", items: { type: "string" } },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        url: { type: "string" },
                        subreddit: { type: "string" },
                        upvotes: { type: "number" },
                        numComments: { type: "number" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })
  });

  if (response.ok) {
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      return parsed.ideas || parsed;
    }
  } else {
    const errText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
  }
  return null;
}

// Update db.json
function updateDatabase(categorySlug: string, newIdeas: any[]) {
  let dbData: any[] = [];
  if (fs.existsSync(DB_PATH)) {
    try {
      dbData = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch (e) {
      dbData = [];
    }
  }

  if (!Array.isArray(dbData)) {
    dbData = [];
  }

  const filtered = dbData.filter(idea => idea.category !== categorySlug);
  const updated = [...filtered, ...newIdeas];

  fs.writeFileSync(DB_PATH, JSON.stringify(updated, null, 2), "utf8");
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not defined in .env" }, { status: 500 });
  }

  try {
    const { category } = await request.json();
    if (!category) {
      return NextResponse.json({ error: "Missing category parameter." }, { status: 400 });
    }

    if (!fs.existsSync(CATEGORIES_PATH)) {
      return NextResponse.json({ error: "Categories configuration missing." }, { status: 500 });
    }

    const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf8"));
    const cat = categories.find((c: any) => c.slug === category);
    if (!cat) {
      return NextResponse.json({ error: `Category ${category} not found.` }, { status: 404 });
    }

    console.log(`[API Refresh] Triggering crawl for category: ${cat.name}`);
    const threads = await crawlCategoryRSS(cat);
    if (threads.length === 0) {
      return NextResponse.json({ error: "Could not fetch any posts from subreddits." }, { status: 502 });
    }

    console.log(`[API Refresh] Crawled ${threads.length} threads. Generating ideas via Gemini...`);
    const newIdeas = await generateIdeas(category, threads, apiKey);

    if (newIdeas && newIdeas.length > 0) {
      updateDatabase(category, newIdeas);
      return NextResponse.json(newIdeas);
    }

    return NextResponse.json({ error: "Failed to generate ideas from Gemini." }, { status: 502 });
  } catch (err: any) {
    console.error("Failed to perform category refresh:", err);
    return NextResponse.json({ error: err.message || "An error occurred." }, { status: 500 });
  }
}
