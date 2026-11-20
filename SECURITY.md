# Security

## Reporting a vulnerability

Please report security issues privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue for an unfixed problem.

## Security model

mdprev is a static site. Documents, share links and skills are processed in your browser; there is no server-side code that receives them. Because of that, the main risks are cross-site scripting through rendered content, unsafe links or images in shared documents, and weak handling of untrusted input (links, zips, GitHub imports).

## Self-review, 2026-11-20

This is a **self-run, targeted review**, not a third-party audit and not a guarantee that no bug exists. It followed the approach of Cloudflare's open-source [security-audit skill](https://github.com/cloudflare/security-audit-skill) (hypothesise, then try to disprove with a test), but it was a focused pass by one reviewer, not the skill's full multi-agent workflow. Cloudflare did not review or endorse this project.

**Scope:** the Markdown render pipeline, link and image handling, share links (`#d=` and password-protected `#e=`), Mermaid and KaTeX, the vault static-site export, zip and GitHub import in the skill inspector, the content security policy, and dependencies (`pnpm audit`).

**Result:** 0 confirmed vulnerabilities, 1 low-severity dependency advisory (fixed), 2 observations.

| Area | Checked | Outcome |
|---|---|---|
| Links in rendered Markdown | `javascript:`, `data:`, `vbscript:`, mixed case, leading spaces, entity-encoded tab | Only `http`, `https`, `mailto` and relative links survive. Others become `#` |
| Raw HTML in Markdown | `<script>`, `<img onerror>`, `<iframe>`, `<svg onload>`, inline handlers | Dropped. Nothing executed in a real browser run on the live site |
| External images in shared documents | `https://` and protocol-relative `//` images | Blocked until the reader allows them. No request reached the test host |
| Share confirmation | Opening a `#d=` link | Asks before replacing the text on screen |
| Password share links | AES-GCM, PBKDF2-SHA256, header bound as additional data, iteration bounds, payload and decompression size limits | No weakness found. Expiry is soft by design (it depends on the reader's clock) |
| KaTeX | `\href`, `\url`, `\includegraphics` with `trust: false` | Rendered as literal red text, no links or images produced |
| Mermaid | `securityLevel: strict`, hostile node labels and `click` directives | Final diagram contains no scripts or handlers (see observation 1) |
| Content security policy | Response headers on the live site | `script-src 'self'` plus hashes, no `unsafe-inline` or `unsafe-eval` for scripts, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `nosniff`, `no-referrer` |
| Vault static-site export | Hostile titles and file names | Escaped. In-page previews use `textContent` |
| Zip import | Path traversal (`..`, absolute paths), zip bombs | Paths are rejected and unpacked size is capped. Nothing is written to disk |
| Dependencies | `pnpm audit` | 1 low advisory in a transitive `katex` copy that mdprev does not call; pinned to a patched version |

**Observations**
1. With a hostile Mermaid label (`<img onerror=…>`), the browser logged one CSP-blocked inline-handler attempt while the diagram rendered. The final diagram had no handlers and nothing ran. The most likely source is Mermaid's temporary render container before it sanitises the output; this was not traced to a specific line. The strict content security policy is what makes it harmless, so it should not be loosened.
2. A link written as `JaVa&#x09;ScRiPt:` is kept as a relative link whose text contains `%09`. Browsers do not treat that as a `javascript:` URL; the test suite pins this behaviour.

**Regression tests:** `tests/security-render.test.ts`, `tests/studio-guard.test.ts`, `tests/studio-share.test.ts` and `tests/vault-site.test.ts` cover the cases above.

**Not covered:** a line-by-line review of the service worker, third-party dependency internals beyond `pnpm audit`, and testing on real mobile devices.

Findings are tied to the source state at the time of review. This section will be extended, not rewritten, after later reviews.
