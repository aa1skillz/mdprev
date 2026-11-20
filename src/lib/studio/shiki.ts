/** Shiki nạp lười cho trang /preview/: engine JS (không wasm), chỉ vài ngôn ngữ, theme biến CSS như bản build. */
import type { Element } from 'hast';
import type { HighlighterCore } from 'shiki/core';

const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  shell: () => import('shiki/langs/shellscript.mjs'),
  bash: () => import('shiki/langs/shellscript.mjs'),
  sh: () => import('shiki/langs/shellscript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  ts: () => import('shiki/langs/typescript.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  js: () => import('shiki/langs/javascript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  py: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  md: () => import('shiki/langs/markdown.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  dockerfile: () => import('shiki/langs/docker.mjs'),
};
const ALIAS: Record<string, string> = { shell: 'shellscript', bash: 'shellscript', sh: 'shellscript', ts: 'typescript', js: 'javascript', py: 'python', md: 'markdown', dockerfile: 'docker' };

let hl: Promise<HighlighterCore> | undefined;
const loaded = new Set<string>();
async function get(): Promise<HighlighterCore> {
  hl ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, { createCssVariablesTheme }] = await Promise.all([import('shiki/core'), import('shiki/engine/javascript'), import('shiki/core')]);
    const theme = createCssVariablesTheme({ name: 'cris', variablePrefix: '--shiki-', variableDefaults: {}, fontStyle: true });
    return createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() });
  })();
  return hl;
}

export async function highlightBlocks(blocks: { lang: string; code: string }[]): Promise<(Element | undefined)[]> {
  if (!blocks.length) return [];
  const h = await get();
  const out: (Element | undefined)[] = [];
  for (const b of blocks) {
    const load = Object.hasOwn(LOADERS, b.lang) ? LOADERS[b.lang] : undefined; // hasOwn: fence như ```constructor không được trỏ vào Object.prototype
    let lang = 'text';
    let shown = ['text', 'txt', 'plain', 'plaintext', 'ansi'].includes(b.lang) ? b.lang : 'plaintext';
    if (load) {
      lang = (Object.hasOwn(ALIAS, b.lang) ? ALIAS[b.lang] : undefined) ?? b.lang;
      shown = b.lang;
      if (!loaded.has(lang)) { await h.loadLanguage((await load()).default as never); loaded.add(lang); }
    }
    const root = h.codeToHast(b.code, { lang, theme: 'cris' });
    const pre = root.children[0] as Element;
    pre.properties = { className: ['astro-code', 'cris'], style: 'background-color:var(--shiki-background);color:var(--shiki-foreground); overflow-x: auto;', tabindex: 0, dataLanguage: shown };
    out.push(pre);
  }
  return out;
}
