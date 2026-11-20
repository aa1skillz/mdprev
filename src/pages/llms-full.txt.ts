import type { APIRoute } from 'astro';
import { HOME_FAQ, INSPECTOR_FAQ } from '../lib/site/faq';
import { GUIDES } from '../lib/site/guides';
import { absUrl } from '../lib/url';

/** llms-full.txt: tất cả hỏi đáp và câu trả lời ngắn của các guide trong một file văn bản thuần, sinh từ cùng nguồn với các trang. */
export const GET: APIRoute = ({ site }) => {
  const u = (p: string) => absUrl(p, site);
  const faq = (items: { q: string; a: string }[]) => items.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n');
  const body = `# mdprev: full text

> A free, private Markdown editor and an inspector for agent skills. Site: ${u('/')}. Shorter map: ${u('/llms.txt')}.

## What it is

The editor (${u('/app/')}) writes Markdown with a live preview, and exports PDF, Word (.docx), HTML, EPUB, LaTeX, TextPack and slides. It makes password-protected share links (AES-GCM, key from PBKDF2-SHA256 with 600,000 rounds, on the device; expiry is soft, checked on the reader's clock), exports a folder of Markdown notes with [[wikilinks]] as a static site with backlinks and link previews, and has Style Check, authorship marks and document themes. It does not host, sync, collaborate or use AI. Feature list with dated prices of paid alternatives: ${u('/features/')}. The skill inspector (${u('/skill-inspector/')}) reads an agent skill from a GitHub link, a zip or a folder: it checks the SKILL.md frontmatter against the published Agent Skills specification, estimates the token cost at three levels (name and description, the whole SKILL.md, every file), lists files the instructions mention but the folder lacks, and matches scripts against a fixed list of risky patterns. It never runs a script. Nothing is uploaded; there is no account and no analytics. Token counts are estimates (characters divided by four), not exact counts for any model.

## Common questions

${faq(HOME_FAQ)}

## About the skill inspector

${faq(INSPECTOR_FAQ)}

## Guides, with the short answer of each

${GUIDES.map((g) => `### ${g.title}\n\n${u(g.path)} (${g.date})\n\n${g.short}`).join('\n\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
