/**
 * Danh sách guide: nguồn của /guides/ và của llms.txt / llms-full.txt. `short` là bản văn bản thuần của hộp "Short answer"
 * trên từng guide (để llms-full.txt có câu trả lời ngắn mà không phải đọc lại HTML).
 */
export interface Guide { path: string; title: string; date: string; text: string; short: string }

export const GUIDES: Guide[] = [
  {
    path: '/guides/publish-a-markdown-vault-as-a-static-site/', title: 'Publish a Markdown vault as a static site, free', date: '2026-11-17',
    text: 'A folder of notes with [[wikilinks]] becomes a website with backlinks and link previews, built in the browser. Measured on 50 notes, with the limits.',
    short: 'In the editor, choose Open → Open folder as vault… (or Open zip as vault…), then Export site…. You get a zip with one HTML page per note, an index, backlinks and link previews; broken links are listed before you export. Unzip it and open it from disk, or upload the folder to any static host. It is free and needs no account. mdprev does not host the site for you.',
  },
  {
    path: '/guides/share-a-markdown-document-with-a-password/', title: 'Share a Markdown document with a password', date: '2026-11-17',
    text: 'A link that only opens with a password: encrypted on your device with AES-GCM, no server. Why its expiry is soft, and how long the link gets.',
    short: 'In the editor, choose Export → Share with password…, type a password of at least 8 characters and press Copy link. The document is encrypted on your device and carried inside the link; the password is not. Send the password another way. An expiry date is optional and soft: anyone who already opened or copied the text keeps it.',
  },
  {
    path: '/guides/install-a-skill-in-claude-code/', title: 'How to install an agent skill in Claude Code', date: '2026-11-16',
    text: 'Copy the folder, check it loaded, see what it costs. Run step by step on Claude Code 2.1.323, with the numbers from that run.',
    short: 'Copy the skill’s folder into ~/.claude/skills/ to use it in every project, or into .claude/skills/ inside one project. The folder name must match the name in its SKILL.md. Then start a new session and ask Claude for the skill by name.',
  },
  {
    path: '/guides/what-is-inside-a-skill-md/', title: 'What is inside a SKILL.md', date: '2026-11-13',
    text: 'The frontmatter fields, the three loading levels and the optional folders of an agent skill, from the Agent Skills specification.',
    short: 'A skill is a folder whose only required file is SKILL.md: YAML frontmatter with a name and a description, then Markdown instructions. scripts/, references/ and assets/ are optional. Agents load it in three levels: the name and description at startup, the whole SKILL.md when a task matches, and other files only when the instructions point to them.',
  },
  {
    path: '/guides/how-much-context-does-a-skill-cost/', title: 'How much context does an agent skill cost?', date: '2026-11-13',
    text: 'Every installed skill puts its name and description in context at startup. Measured on 20 public skills, and how to keep it small.',
    short: 'About 120 estimated tokens per skill, in every session, used or not. Measured on 20 public skills, the name and description cost from about 55 to about 270 tokens each, and about 2.4k together. The whole SKILL.md is paid only when the skill triggers.',
  },
  {
    path: '/guides/markdown-to-pdf-word-and-slides/', title: 'From Markdown to PDF, Word and slides in your browser', date: '2026-11-17',
    text: 'Write once, export as PDF, Word, HTML, EPUB, LaTeX, TextPack or a slide deck. What each format keeps, how slides are cut, and what never leaves your device.',
    short: 'Open the editor, write or paste Markdown, press Export and choose PDF (the print dialog, then “Save as PDF”), Word (.docx), HTML, EPUB, LaTeX (.tex), TextPack or a slide-deck PDF. Everything is made on your device; nothing is uploaded and there is no account.',
  },
];
