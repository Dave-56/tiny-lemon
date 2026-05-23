# Tiny Lemon Content Workflow

Tiny Lemon uses repo-based Markdown publishing for public guides. This keeps SEO/AEO content reviewable, versioned, and deployable through the same GitHub and Vercel flow as the app.

## Why this structure

Google's AI Overviews and AI Mode still depend on normal Search fundamentals: crawlable pages, indexable text, useful content, internal links, page experience, and structured data that matches the visible page. OpenAI's ChatGPT Search depends on allowing `OAI-SearchBot` to access public pages.

For Tiny Lemon, that means the rendered guide pages matter more than a special folder name or AI-only file. The content system should make each article easy to crawl, quote, cite, and connect back to the product.

## Current setup

- Public guide content lives in `content/blog/*.md`.
- Template files start with `_` and are ignored by the blog loader.
- The public index is `/blog`, labeled as `Guides` in the UI.
- Individual posts render at `/blog/<slug>`.
- `/sitemap.xml` includes all published Markdown posts automatically.
- `public/robots.txt` allows normal crawlers, `OAI-SearchBot`, and `GPTBot`.
- Blog posts emit `BlogPosting` JSON-LD from their frontmatter.

## Frontmatter

Every post should include:

```md
---
title: Clear search-friendly title
slug: lowercase-hyphenated-url-slug
date: YYYY-MM-DD
updated: YYYY-MM-DD
category: Shopify product photography
targetQueries: primary query, related query, buying-intent query
excerpt: One or two sentences for search snippets and social previews.
---
```

`targetQueries` is an internal planning field. It helps us write for real merchant questions, but it is not displayed publicly.

## Publishing workflow

1. Drop the raw draft, source links, and target query into the Codex thread.
2. Convert the draft into the structure in `content/blog/_template.md`.
3. Clean encoding issues, unsupported claims, missing citations, weak CTAs, and broken internal links.
4. Add or update the Markdown file in `content/blog`.
5. Run `npm run typecheck`.
6. Run `npm run build`.
7. Commit only the content-system changes.
8. Push to GitHub so Vercel deploys the update.

## Article quality checklist

- The first 2-3 paragraphs directly answer the target query.
- Each H2 maps to a real merchant sub-question.
- Claims about conversion, costs, return rates, platform policies, or benchmarks cite a source.
- The article includes a practical workflow, not just explanation.
- The article states limitations honestly.
- Tiny Lemon is mentioned naturally where it helps the reader solve the problem.
- Related Tiny Lemon guides or product pages are linked internally.
- The FAQ uses natural-language questions that a merchant might ask Google, ChatGPT, Claude, or Perplexity.

## What not to do

- Do not create AI-only duplicate Markdown pages for Google. Google says special AI files or special schema are not required for AI Overviews or AI Mode.
- Do not stuff long-tail keyword variants into the article.
- Do not publish unsupported statistics just because they sound persuasive.
- Do not make every guide a sales page. The goal is to become the cited source first; conversion comes from useful trust.
