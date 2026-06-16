const fs = require("fs");
const path = require("path");

// Simple, dependency-free dotenv parser
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        // Remove quotes if present
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("[Crawler Error] GEMINI_API_KEY is not defined in .env file.");
  process.exit(1);
}

const DB_PATH = path.resolve(__dirname, "../src/data/db.json");
const CATEGORIES_PATH = path.resolve(__dirname, "../src/data/categories.json");

// Helper to decode HTML entities in RSS XML
function decodeHTMLEntities(str) {
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
function stripHTML(html) {
  let clean = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  clean = clean.replace(/<[^>]*?>/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();
  return decodeHTMLEntities(clean);
}

// Regex-based RSS entry parser
function parseRedditRSS(xmlText) {
  const entries = [];
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
async function crawlCategoryRSS(cat) {
  const rawThreads = [];
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
      } else {
        console.warn(`  [Warning] Failed to fetch r/${sub} RSS: HTTP ${response.status}`);
      }
    } catch (err) {
      console.error(`  [Error] Failed to crawl RSS for r/${sub}:`, err);
    }
  }
  return rawThreads;
}

// Generate ideas using Gemini API
async function generateIdeas(slug, rawThreads) {
  const prompt =
    "Generate 6 distinct, startable Idea Cards based on these raw Reddit threads. " +
    "Each card must conform strictly to the Pydantic schema structure. " +
    "Do not frame things as complaints. Capture 'the tea' in a fun, encouraging tone.\n\n" +
    `Input Threads:\n${JSON.stringify(rawThreads)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
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

// Update db.json with new category ideas
function updateDatabase(categorySlug, newIdeas) {
  let dbData = [];
  if (fs.existsSync(DB_PATH)) {
    try {
      dbData = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch (e) {
      console.warn("[Warning] db.json was malformed. Re-initializing.");
      dbData = [];
    }
  }

  if (!Array.isArray(dbData)) {
    dbData = [];
  }

  // Remove existing ideas for this category, then add the new ones
  const filtered = dbData.filter(idea => idea.category !== categorySlug);
  const updated = [...filtered, ...newIdeas];

  fs.writeFileSync(DB_PATH, JSON.stringify(updated, null, 2), "utf8");
}

// Run crawler for a single category index
async function runCrawlingCycle(index) {
  if (!fs.existsSync(CATEGORIES_PATH)) {
    console.error(`Categories config file not found at ${CATEGORIES_PATH}`);
    return;
  }
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf8"));
  
  if (categories.length === 0) return;
  const targetIdx = index % categories.length;
  const cat = categories[targetIdx];

  console.log(`[Crawler] Round-robin polling category (${targetIdx + 1}/${categories.length}): ${cat.name}`);
  
  try {
    const threads = await crawlCategoryRSS(cat);
    if (threads.length === 0) {
      console.log(`  No new RSS threads crawled for r/${cat.subreddits.join(", r/")}`);
      return;
    }
    
    console.log(`  Fetched ${threads.length} RSS entries. Contacting Gemini...`);
    const newIdeas = await generateIdeas(cat.slug, threads);
    if (newIdeas && newIdeas.length > 0) {
      updateDatabase(cat.slug, newIdeas);
      console.log(`  Success! Database updated with ${newIdeas.length} fresh ideas for ${cat.name}.`);
    } else {
      console.log(`  Gemini returned 0 ideas for ${cat.name}.`);
    }
  } catch (err) {
    console.error(`  [Crawler Error] Failed to refresh category ${cat.name}:`, err.message || err);
  }
}

// Expose internal trigger for manual category scrapes (used by Next.js API routes)
async function triggerCategoryRefresh(categorySlug) {
  if (!fs.existsSync(CATEGORIES_PATH)) {
    throw new Error("Categories config missing.");
  }
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf8"));
  const cat = categories.find(c => c.slug === categorySlug);
  if (!cat) {
    throw new Error(`Category ${categorySlug} not found.`);
  }

  console.log(`[On-Demand Scrape] Crawling category RSS: ${cat.name}`);
  const threads = await crawlCategoryRSS(cat);
  if (threads.length === 0) {
    throw new Error(`No posts could be fetched from subreddits: ${cat.subreddits.join(", ")}`);
  }

  const newIdeas = await generateIdeas(cat.slug, threads);
  if (newIdeas && newIdeas.length > 0) {
    updateDatabase(cat.slug, newIdeas);
    return newIdeas;
  }
  throw new Error("Gemini did not return any ideas.");
}

// Daemon main loop
let currentIndex = 0;
async function startDaemon() {
  console.log("[Crawler Daemon] Starting RSS crawler service...");
  
  // Run first cycle immediately
  await runCrawlingCycle(currentIndex++);
  
  // Set interval to poll every 60 seconds
  setInterval(async () => {
    await runCrawlingCycle(currentIndex++);
  }, 60000);
}

// If run directly (not required as a module)
if (require.main === module) {
  startDaemon();
}

module.exports = {
  triggerCategoryRefresh
};
