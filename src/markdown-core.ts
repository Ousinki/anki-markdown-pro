import mark from "markdown-it-mark";
import alerts from "markdown-it-github-alerts";
import { createMarkdownExit } from "markdown-exit";

export const md = createMarkdownExit({ html: true });
md.use(mark as never);
md.use(alerts as never);

// Allow safe inline/block HTML tags, strip anything else
const ALLOWED_HTML = /^<\/?(font|kbd|img|a|b|i|em|strong|br|code|mark|s|del|sup|sub|span|hr|table|thead|tbody|tr|th|td|abbr)(\s[^>]*)?>$/i;
const sanitize = (html: string) => (ALLOWED_HTML.test(html.trim()) ? html : "");
md.renderer.rules.html_inline = (tokens, idx) => sanitize(tokens[idx].content);
md.renderer.rules.html_block = (tokens, idx) => sanitize(tokens[idx].content);

/**
 * Render text through markdown while preserving LaTeX math.
 * Strategy: extract math blocks into a stash with unique placeholders,
 * run markdown on the remaining text, then restore native MathJax delimiters.
 * Uses \(...\) for inline and \[...\] for display math — these are what
 * MathJax.typesetPromise() actually processes at runtime.
 */
export function renderWithLatex(text: string): string {
  const stash: string[] = [];
  const token = (i: number) => `\u0002ANKI_MATH_${i}\u0003`;

  // 1. Block math $$...$$ (greedy-protect first so $$ isn't split by inline rule)
  let t = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const i = stash.length;
    stash.push(`\\[${math.trim()}\\]`);
    return token(i);
  });

  // 2. Inline math $...$ (single dollar, not adjacent to another $)
  t = t.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (_, math) => {
    const i = stash.length;
    stash.push(`\\(${math.trim()}\\)`);
    return token(i);
  });

  // Convert [Text]{Tooltip} into HTML <abbr> tags
  t = t.replace(/\[([^\]]+)\]\{([^\}]+)\}/g, (_, textVal, titleVal) => {
    return `<abbr data-title="${titleVal.trim()}">${textVal}</abbr>`;
  });

  // 3. Run markdown on safe text
  let html = md.render(t);

  // 4. Restore native MathJax delimiters (placeholders survive markdown untouched)
  html = html.replace(/\u0002ANKI_MATH_(\d+)\u0003/g, (_, i) => stash[parseInt(i)]);

  return html;
}

// Automatically adjust tooltip placement on hover to prevent clipping near screen boundaries
if (typeof document !== "undefined") {
  document.addEventListener("mouseover", (e) => {
    try {
      const target = (e.target as HTMLElement).closest?.("abbr[data-title]") as HTMLElement;
      if (!target) return;

      const container = target.closest(".anki-md-preview") || target.closest(".anki-md-wrapper") || document.body;
      const rect = target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const text = target.getAttribute("data-title") || "";
      // Estimate tooltip width (padding + character count * approx font width)
      const estimatedWidth = Math.min(200, 24 + text.length * 7.5);
      const halfWidth = estimatedWidth / 2;

      const center = rect.left + rect.width / 2;
      const leftEdge = center - halfWidth;
      const rightEdge = center + halfWidth;

      // Add a safety padding margin of 12px from the container boundaries
      const minLeft = containerRect.left + 12;
      const maxRight = containerRect.right - 12;

      let shift = 0;
      if (leftEdge < minLeft) {
        shift = minLeft - leftEdge;
      } else if (rightEdge > maxRight) {
        shift = maxRight - rightEdge;
      }

      target.style.setProperty("--tooltip-shift", `${shift}px`);
    } catch (err) {
      // Quietly catch layout read errors
    }
  });
}
