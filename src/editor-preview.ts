/**
 * Lightweight Markdown + LaTeX renderer for editor live preview.
 * Does NOT include Shiki code highlighting (too heavy for editor context).
 * Uses the same renderWithLatex logic as render.ts but outputs \(...\) / \[...\]
 * which MathJax in the editor WebView can process.
 */
import { renderWithLatex } from "./markdown-core";

export function renderPreview(text: string): string {
  try {
    let html = renderWithLatex(text);
    // Replace [sound:filename.mp3] with a beautiful theme-matching play button
    html = html.replace(/\[sound:([^\]]+)\]/g, (_, filename) => {
      // Escape single quotes in filenames to avoid JS breakage
      const escFilename = filename.replace(/'/g, "\\'");
      return `<a class="replay-button sound" href="#" data-filename="${escFilename}" onclick="event.preventDefault(); (globalThis.playPreviewAudio || window.playPreviewAudio)(event, this, '${escFilename}');">
  <svg class="play-button" viewBox="0 0 24 24">
    <path class="speaker-body" d="M11 5L6 9H2v6h4l5 4V5z" />
    <path class="wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path class="wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
</a>`;
    });
    return html;
  } catch (err: any) {
    return `<div style="color: red; background: #fee; border: 1px solid red; padding: 10px; z-index: 9999;">Error in renderPreview: ${String(err.stack || err.message || err)}</div>`;
  }
}
