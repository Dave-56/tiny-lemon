import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { marked } from "marked";

const BLOG_DIR = join(process.cwd(), "content", "blog");

export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body: string;
  bodyHtml: string;
};

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  const [, fm, body] = match;
  const frontmatter: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: body.trim() };
}

function getMarkdownFiles(): { name: string; path: string }[] {
  try {
    const files = readdirSync(BLOG_DIR, { withFileTypes: true });
    return files
      .filter((f) => f.isFile() && f.name.endsWith(".md"))
      .map((f) => ({ name: f.name, path: join(BLOG_DIR, f.name) }));
  } catch {
    return [];
  }
}

function fileSlugFromName(name: string): string {
  return name.replace(/\.md$/, "");
}

export function getBlogSlugs(): string[] {
  const files = getMarkdownFiles();
  const slugs: string[] = [];
  for (const { name, path: filePath } of files) {
    const raw = readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);
    slugs.push(frontmatter.slug || fileSlugFromName(name));
  }
  return slugs.filter(Boolean);
}

export function getBlogPost(slug: string): BlogPost | null {
  if (!slug || slug === "blog") return null;
  const files = getMarkdownFiles();
  for (const { name, path: filePath } of files) {
    const raw = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const fileSlug = frontmatter.slug || fileSlugFromName(name);
    if (fileSlug !== slug) continue;
    return {
      slug: fileSlug,
      title: frontmatter.title || "Post",
      date: frontmatter.date || "",
      excerpt: frontmatter.excerpt || "",
      body,
      bodyHtml: marked.parse(body, { async: false }) as string,
    };
  }
  return null;
}

/** List all posts (for index); sort by date desc */
export function getBlogPosts(): BlogPost[] {
  const slugs = getBlogSlugs();
  const posts: BlogPost[] = [];
  for (const s of slugs) {
    const post = getBlogPost(s);
    if (post) posts.push(post);
  }
  posts.sort((a, b) => (b.date > a.date ? 1 : -1));
  return posts;
}
