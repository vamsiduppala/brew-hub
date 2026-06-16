import { Devvit } from "@devvit/public-api";

// 1. Register App Settings so moderators can save their Gemini API Key
Devvit.addSettings([
  {
    type: "string",
    name: "gemini_api_key",
    label: "Google Gemini API Key",
    defaultValue: "",
  }
]);

// 2. Add MenuItem to easily post the Brew Ideas Hub inside subreddits
Devvit.addMenuItem({
  location: "subreddit",
  label: "Submit Brew Ideas Hub",
  onPress: async (event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit();
    await (context.reddit as any).submitCustomPost({
      title: "Brew: Startup & Product Idea Hub (Reddit + Gemini)",
      subredditName: subreddit.name,
      entry: "default",
    });
    context.ui.showToast("Submitted Brew custom post successfully!");
  }
});

// 3. Configure the Custom Post Web View mounting and Redis message bridge
Devvit.addCustomPostType({
  name: "Brew Ideas Hub",
  render: (context) => {
    const [webviewOpen, setWebviewOpen] = context.useState(false);
    
    // Connect Web View communication hook
    const { mount, postMessage } = context.useWebView({
      url: "index.html",
      onMessage: async (message) => {
        const msg = message as any;
        
        if (msg.type === "GET_IDEAS") {
          const category = msg.category;
          // Retrieve from Reddit's built-in Redis Key-Value Store
          const cachedIdeas = await context.kvStore.get(`brew-category-${category}`);
          let ideas: any[] = [];
          if (cachedIdeas) {
            try {
              const parsed = JSON.parse(cachedIdeas);
              ideas = Array.isArray(parsed) ? parsed : (parsed.ideas || []);
            } catch (e) {
              console.error("Failed to parse cached ideas:", e);
            }
          }
          
          if (ideas.length === 0) {
            const mockIdeas = await import("./data/mock-ideas.json");
            ideas = mockIdeas.default.filter((i: any) => i.category === category);
          }
          
          postMessage({
            type: "IDEAS_RESPONSE",
            category,
            ideas
          });
        }

        if (msg.type === "GET_ALL_IDEAS") {
          const categories = await import("./data/categories.json");
          let allIdeas: any[] = [];
          for (const cat of categories.default) {
            const cachedIdeas = await context.kvStore.get(`brew-category-${cat.slug}`);
            if (cachedIdeas) {
              try {
                const parsed = JSON.parse(cachedIdeas);
                const list = Array.isArray(parsed) ? parsed : (parsed.ideas || []);
                allIdeas.push(...list);
              } catch (e) {}
            }
          }
          
          if (allIdeas.length === 0) {
            const mockIdeas = await import("./data/mock-ideas.json");
            allIdeas = mockIdeas.default;
          }
          
          postMessage({
            type: "ALL_IDEAS_RESPONSE",
            ideas: allIdeas
          });
        }

        if (msg.type === "REFRESH_CATEGORY") {
          const category = msg.category;
          const apiKey = await context.settings.get("gemini_api_key");
          if (!apiKey) {
            postMessage({
              type: "REFRESH_ERROR",
              category,
              error: "Gemini API key is not configured. Please set it in App Settings."
            });
            return;
          }

          const categories = await import("./data/categories.json");
          const cat = categories.default.find((c: any) => c.slug === category);
          if (!cat) {
            postMessage({
              type: "REFRESH_ERROR",
              category,
              error: "Category not found."
            });
            return;
          }

          console.log(`Natively crawling r/ subreddits for category: ${cat.name}`);
          let rawThreads: any[] = [];
          
          for (const sub of cat.subreddits) {
            try {
              const posts = await context.reddit.getHotPosts({
                subredditName: sub,
                limit: 4
              }).all();
              
              for (const post of posts) {
                rawThreads.push({
                  title: post.title,
                  text: post.selftext ? post.selftext.substring(0, 800) : "",
                  score: post.score,
                  subreddit: sub,
                  url: post.url
                });
              }
            } catch (err) {
              console.error(`Failed to crawl r/${sub}:`, err);
            }
          }

          if (rawThreads.length === 0) {
            postMessage({
              type: "REFRESH_ERROR",
              category,
              error: `Could not fetch any threads from subreddits: ${cat.subreddits.join(", ")}`
            });
            return;
          }

          const prompt = (
            "Generate 6 distinct, startable Idea Cards based on these raw Reddit threads. "
            "Each card must conform strictly to the Pydantic schema structure. "
            "Do not frame things as complaints. Capture 'the tea' in a fun, encouraging tone.\n\n"
            `Input Threads:\n${JSON.stringify(rawThreads)}`
          );

          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
              {
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
              }
            );

            if (response.ok) {
              const result = await response.json();
              const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                const parsed = JSON.parse(text);
                const ideasList = parsed.ideas || parsed;
                await context.kvStore.put(`brew-category-${category}`, JSON.stringify(ideasList));
                postMessage({
                  type: "IDEAS_RESPONSE",
                  category,
                  ideas: ideasList
                });
                return;
              }
            }
            postMessage({
              type: "REFRESH_ERROR",
              category,
              error: "Failed to parse Gemini API response."
            });
          } catch (err: any) {
            console.error(`Failed to refresh ideas for ${cat.name} via Gemini:`, err);
            postMessage({
              type: "REFRESH_ERROR",
              category,
              error: err.message || "An error occurred while calling Gemini."
            });
          }
        }
      }
    });

    if (!webviewOpen) {
      return (
        <vstack height="100%" width="100%" alignment="middle center" gap="medium" padding="large" backgroundColor="#0a0a0a">
          <text size="xlarge" weight="bold" color="#d97706">Brew: Startup Idea Hub</text>
          <text size="medium" color="#ededed" alignment="center">
            Tap below to explore high-momentum business and product concepts decoded by Gemini from live discussions in this subreddit.
          </text>
          <button onPress={() => setWebviewOpen(true)}>Open Dashboard</button>
        </vstack>
      );
    }
    
    return (
      <vstack height="100%" width="100%" grow>
        {mount()}
      </vstack>
    );
  }
});

// 4. Configure Scheduler job to fetch threads natively and update Gemini decodings
Devvit.addSchedulerJob({
  name: "refresh_ideas",
  onRun: async (event, context) => {
    const apiKey = await context.settings.get("gemini_api_key");
    if (!apiKey) {
      console.log("Gemini API key is not configured in settings. Skipping refresh.");
      return;
    }

    // Dynamic import to read category subreddits
    const categories = await import("./data/categories.json");
    
    for (const cat of categories.default) {
      console.log(`Natively crawling r/ subreddits for category: ${cat.name}`);
      let rawThreads: any[] = [];
      
      // Fetch hot threads natively from the specified subreddits (no keys needed!)
      for (const sub of cat.subreddits) {
        try {
          const posts = await context.reddit.getHotPosts({
            subredditName: sub,
            limit: 4
          }).all();
          
          for (const post of posts) {
            rawThreads.push({
              title: post.title,
              text: post.selftext ? post.selftext.substring(0, 800) : "",
              score: post.score,
              subreddit: sub,
              url: post.url
            });
          }
        } catch (err) {
          console.error(`Failed to crawl r/${sub}:`, err);
        }
      }

      if (rawThreads.length === 0) continue;

      // Compile prompt for Gemini API
      const prompt = (
        "Generate 6 distinct, startable Idea Cards based on these raw Reddit threads. "
        "Each card must conform strictly to the Pydantic schema structure. "
        "Do not frame things as complaints. Capture 'the tea' in a fun, encouraging tone.\n\n"
        f"Input Threads:\n{JSON.stringify(rawThreads)}"
      );

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                // Configure structured JSON schema expectations matching our card type
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
          }
        );

        if (response.ok) {
          const result = await response.json();
          const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            try {
              const parsed = JSON.parse(text);
              const ideasList = parsed.ideas || parsed;
              await context.kvStore.put(`brew-category-${cat.slug}`, JSON.stringify(ideasList));
              console.log(`Updated ideas for ${cat.name} in Redis.`);
            } catch (e) {
              console.error(`Failed to parse/save ideas for ${cat.name}:`, e);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to refresh ideas for ${cat.name} via Gemini:`, err);
      }
    }
  }
});

// 5. Trigger daily scheduler installation hook
Devvit.addTrigger({
  event: "AppInstall",
  onEvent: async (event, context) => {
    await context.scheduler.runDaily({
      name: "refresh_ideas",
      time: "08:00"
    });
    console.log("Successfully scheduled daily refresh job at 08:00 AM.");
  }
});

export default Devvit;
