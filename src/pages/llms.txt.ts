import type { APIRoute } from 'astro';
import { GUIDES } from '../lib/site/guides';
import { absUrl } from '../lib/url';

/** llms.txt (llmstxt.org): bản đồ ngắn của site cho mô hình ngôn ngữ. Sinh từ cùng nguồn với trang và sitemap. */
export const GET: APIRoute = ({ site }) => {
  const u = (p: string) => absUrl(p, site);
  const body = `# mdprev

> A free, private Markdown editor and an inspector for agent skills (SKILL.md folders). It runs in the browser: nothing you open is uploaded, there is no account and no analytics.

mdprev does two things. The editor writes Markdown with a live preview and exports PDF, Word (.docx), HTML, EPUB, LaTeX, TextPack and slides. It also makes password-protected share links (encrypted on the device; expiry is soft), turns a folder of notes with [[wikilinks]] into a static site, and has Style Check, authorship marks and document themes. It does not host, sync, collaborate or use AI. The skill inspector reads an agent skill from a GitHub link, a zip or a folder and reports the specification check, the estimated token cost at three levels and the scripts worth reading. It never runs a script. Token counts are estimates (characters divided by four).

## Tools

- [Markdown editor](${u('/app/')}): write, preview, share a link (optionally with a password), export PDF, Word, HTML, EPUB, LaTeX, TextPack and slides, publish a vault as a static site
- [Features](${u('/features/')}): what paid editors charge for that is free here, with dated prices, and what mdprev does not do
- [Skill inspector](${u('/skill-inspector/')}): what it checks, a real report for 20 public skills, and its limits

## Guides

${GUIDES.map((g) => `- [${g.title}](${u(g.path)}): ${g.text}`).join('\n')}

## Optional

- [Privacy](${u('/privacy/')}): exactly what is stored, and where
- [Full text for models](${u('/llms-full.txt')}): the questions and the short answers of every guide in one file
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
