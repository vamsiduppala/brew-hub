# ☕️ Brew — Reddit + Gemini Powered Startup Idea Hub

**Brew** is a high-craft web application designed for builders, creators, and side-hustlers who want to start something but don't know what. It monitors 14 startup and business spaces on Reddit, collects live discussions, and utilizes Gemini to decode them into actionable, structured **Idea Cards** detailing what the product is, the community debates ("the tea"), market timing, active builders, and checkable execution steps. 

This is an **idea hub, not a pain hub** — it focuses strictly on opportunities and momentum rather than complaints.

---

## 🌟 Core Features

- **Dynamic Category Explorer**: An animated grid of 14 categories (Freelancer Economy, AI & Automation, E-commerce, Dev Tools, etc.) with live idea counter badges.
- **Micro-Interactions & 3D Tilt**: Cards and buttons feature subtle 3D tilt effects, hover sheens, and layouts optimized with Framer Motion.
- **Dynamic Search, Sort, & Filter**: Search cards in real-time, sort by momentum score or difficulty, and filter by experience level.
- **The Tea (Community Debate)**: Learn what builders and customers on the ground are arguing about, formatted as dynamic discourse posts.
- **Checkable Startup Steps**: Save your progress directly in your browser with persistent, checkable getting started checklists.
- **Shortlist Bookmarks**: Save concepts to a personal shortlist synced dynamically across views.
- **Dark/Light Mode**: Transition between a premium dark coffee theme and a clean light cream layout.

---

## 🏗️ System Architecture

Brew is designed with two compatible deployment architectures:

### 1. Native Reddit Devvit App (Recommended)
Runs entirely inside the Reddit ecosystem as an interactive custom post.
- **No API Keys Required**: Fetches subreddit threads natively using the Devvit SDK client, bypassing standard OAuth limitations and rate limits.
- **Native Scheduler**: Automatically refreshes ideas daily using Devvit's serverless Scheduler API.
- **Redis KV Store**: Decoded ideas are saved inside Reddit's native Key-Value store and queried by the frontend WebView.
- **Static Next.js Webview**: The Next.js frontend is compiled into a static site and hosted inside Reddit's iframe container.

### 2. Standalone Next.js Site + Python Scraper
- **Python Fetcher**: Crawls subreddits using PRAW (with a public JSON fallback).
- **Gemini Decoder**: Calls Gemini using the `google-genai` SDK and Pydantic validation schemas.
- **Next.js static site**: Serves categories from cached JSON files locally.

---

## 🚀 Getting Started

### 1. Requirements

- **Node.js** (v18 or higher)
- **Python** (3.11 or higher)

### 2. Install Dependencies

Install the frontend npm packages and Devvit bindings:
```bash
npm install
```

Install the Python pipeline requirements (if using standalone mode):
```bash
py -m pip install -r pipeline/requirements.txt
```

---

## 🛠️ Devvit Deployment (Reddit Integration)

To deploy Brew directly onto Reddit as a Custom Post Web App:

1. **Configure devvit.json**: Our `devvit.json` is pre-configured to use Next.js's static export folder `/out`.
2. **Build the static frontend**:
   ```bash
   npm run build
   ```
3. **Log in to Reddit Developer CLI**:
   ```bash
   npx devvit login
   ```
4. **Register and upload your app**:
   ```bash
   npx devvit register brewideas
   npx devvit upload
   ```
5. **Playtest inside your sub**:
   Create an interactive custom post in your test subreddit:
   ```bash
   npx devvit playtest <your_subreddit_name>
   ```

When moderators install the app, the background trigger schedules a daily crawler that queries threads natively and refreshes the dashboard with zero server dependencies!

---

## 🛠️ Local Commands (Standalone Mode)

### Run the Standalone Development Server
```bash
npm run dev
```

### Run Python Scraper & Gemini Decoder
Crawl Reddit and rewrite static JSON files locally:
```bash
npm run refresh
```

### Run Gemini Simulation Generator (No Reddit Keys needed)
Populate all categories with 6 Gemini-synthesized ideas based on typical subreddit topics:
```bash
npm run refresh:dry
```
