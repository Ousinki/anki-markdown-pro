/**
 * Lightweight Markdown + LaTeX renderer for editor live preview.
 * Does NOT include Shiki code highlighting (too heavy for editor context).
 * Uses the same renderWithLatex logic as render.ts but outputs \(...\) / \[...\]
 * which MathJax in the editor WebView can process.
 */
import { renderWithLatex } from "./markdown-core";

export function renderPreview(text: string): string {
  try {
    return renderWithLatex(text);
  } catch (err: any) {
    return `<div style="color: red; background: #fee; border: 1px solid red; padding: 10px; z-index: 9999;">Error in renderPreview: ${String(err.stack || err.message || err)}</div>`;
  }
}
