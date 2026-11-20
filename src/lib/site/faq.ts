/**
 * Hỏi đáp hiển thị trên trang và (ở Task 2) cũng là nguồn của JSON-LD FAQPage: dùng chung một nguồn để văn bản
 * hiển thị và dữ liệu có cấu trúc luôn giống hệt nhau. Chỉ văn bản thuần, không HTML.
 */
export interface Faq { q: string; a: string }

export const HOME_FAQ: Faq[] = [
  {
    q: 'Is mdprev free?',
    a: 'Yes. There is no paid plan and no account. The editor and the skill inspector run in your browser, and nothing you open is uploaded.',
  },
  {
    q: 'How do I export Markdown to PDF or Word?',
    a: 'Open the editor, press Export and choose PDF (it opens your browser’s print dialog; pick “Save as PDF”), PDF with contents, or Word (.docx). HTML, EPUB, LaTeX (.tex), TextPack and a slide-deck PDF are there too. The file is made on your device.',
  },
  {
    q: 'Can I share a document with a password?',
    a: 'Yes. Export → Share with password… makes a link encrypted on your device with AES-GCM; the password is not in the link and no server keeps a copy. An expiry date is optional and soft: it is checked on the reader’s clock, and anyone who already opened or copied the text keeps it.',
  },
  {
    q: 'Does it work offline?',
    a: 'Writing and preview do, once the page has loaded and you have installed it as an app. Reading a skill from a GitHub link needs the network.',
  },
  {
    q: 'What is an agent skill?',
    a: 'A folder with a SKILL.md file (instructions for an AI agent) and optional scripts and reference files. Agents read the short description of every skill at startup and load the rest only when a task needs it.',
  },
  {
    q: 'Can mdprev tell me a skill is safe?',
    a: 'No. It points at things worth reading, using fixed rules. A clean report does not mean a script is safe, and a flag does not mean it is harmful. Read what it flags.',
  },
  {
    q: 'Are the token numbers exact?',
    a: 'No. They are estimates from character count (about four characters per token). Real counts depend on the model.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. There is nothing to sign in to, and nothing you open is uploaded.',
  },
];

export const INSPECTOR_FAQ: Faq[] = [
  {
    q: 'What exactly does it check?',
    a: 'The SKILL.md frontmatter against the published specification, the estimated token cost at three levels, files that the instructions mention but the folder does not contain, and scripts matched against a fixed list of risky patterns.',
  },
  {
    q: 'Does it run the scripts?',
    a: 'Never. It only reads text.',
  },
  {
    q: 'Does it work with private repositories?',
    a: 'Not from a link. Download the repository as a zip and open the zip in the inspector instead.',
  },
  {
    q: 'Can I fix a skill here?',
    a: 'Yes. “Edit a copy” opens every file in the editor, with the checks beside it and a diff against the original. Download your changes as a zip. mdprev never writes back to GitHub.',
  },
  {
    q: 'Where do the files go?',
    a: 'Nowhere. For a GitHub link, your browser fetches the files straight from GitHub. For a zip or a folder, they are read locally. Nothing is sent to mdprev.',
  },
];
