import { url } from '../lib/url';

/**
 * Thẻ chào của khách chưa có tài liệu nào. Một nguồn markup cho hai nơi: dựng tĩnh trong khung của `/` và `/app/`
 * (HomeFacade.astro, không JS) và render trong editor thật (MarkdownStudio), nên hai bên khớp từng điểm ảnh và không giật khi
 * editor lên. Nút mang `data-wact` (start | open | sample); ai chứa thẻ tự bắt sự kiện (HomeStudio ở khung tĩnh, MarkdownStudio
 * ở editor). "Inspect a skill" là liên kết thường. Tiêu đề là `<p>`, không phải h1..h6: trang không được có thêm tiêu đề thật.
 */
export default function WelcomeCard() {
  return (
    <div class="welcome" data-welcome role="group" aria-label="Welcome to mdprev">
      <svg class="wc-art" viewBox="0 0 760 780" aria-hidden="true" focusable="false">
        <g class="wc-l0"><rect x="40" y="640" width="680" height="140" class="wc-floor" /><polygon points="150,640 640,640 770,780 290,780" class="wc-light" /><path d="M40 640H720" /></g>
        <g class="wc-l1"><path d="M40 780V362A340 340 0 0 1 720 362V780" /></g>
        <g class="wc-l2"><path d="M68 780V364A312 312 0 0 1 692 364V780" opacity=".7" /></g>
        <g class="wc-l3"><path d="M96 780V366A284 284 0 0 1 664 366V780" opacity=".45" /><circle class="wc-ring" cx="100" cy="122" r="66" /><circle class="wc-sun" cx="53" cy="75" r="8" /></g>
      </svg>
      <div class="wc-stack">
        <div class="wc-card">
          <p class="wc-lbl">A quiet Markdown workspace</p>
          <p class="wc-title">Write. Preview.<br />Inspect.</p>
          <p class="wc-lead">Your text stays in your browser. Start typing, or choose:</p>
          <div class="wc-btns">
            <button type="button" class="wc-b wc-go" data-wact="start"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Start writing</button>
            <button type="button" class="wc-b" data-wact="open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2 2h9v9.5h-17z" /></svg>Open file</button>
            <a class="wc-b" href={url('/app/inspect/')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M9 12h6" /></svg>Inspect a skill</a>
          </div>
          <ul class="wc-pts">
            <li><b><i>I</i>Skill Inspector</b>Read and preview SKILL.md files.</li>
            <li><b><i>II</i>Present</b>Turn Markdown into slides.</li>
            <li><b><i>III</i>Private</b>Nothing is uploaded.</li>
          </ul>
          <p class="wc-hint"><span class="wc-keys">Type any key or press Esc to start · </span><button type="button" class="wc-alt" data-wact="sample">or try a sample</button></p>
        </div>
      </div>
    </div>
  );
}
