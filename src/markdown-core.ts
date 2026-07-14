import mark from "markdown-it-mark";
import alerts from "markdown-it-github-alerts";
import { createMarkdownExit } from "markdown-exit";

export const md = createMarkdownExit({ html: true });
md.use(mark as never);
md.use(alerts as never);

// Allow safe inline/block HTML tags, strip anything else
const ALLOWED_TAGS = new Set([
  "font", "kbd", "img", "a", "b", "i", "em", "strong", "br", "code", "mark",
  "s", "del", "sup", "sub", "span", "hr", "table", "thead", "tbody", "tr",
  "th", "td", "abbr", "svg", "circle", "path", "polygon", "rect"
]);

const sanitize = (html: string): string => {
  if (typeof document === "undefined") return html;
  try {
    const temp = document.createElement("template");
    temp.innerHTML = html;
    
    const sanitizeNode = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          el.parentNode?.removeChild(el);
          return;
        }
        
        // Remove unsafe event handlers, except onclick on replay-buttons
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) {
            const isReplayBtn = tag === "a" && el.classList.contains("replay-button");
            if (!isReplayBtn) {
              el.removeAttribute(attr.name);
            }
          }
        }
        
        const children = Array.from(el.childNodes);
        for (const child of children) {
          sanitizeNode(child);
        }
      }
    };
    
    const children = Array.from(temp.content.childNodes);
    for (const child of children) {
      sanitizeNode(child);
    }
    return temp.innerHTML;
  } catch (e) {
    return html;
  }
};

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

  // Convert <audio ... class="anki-md-click-play"></audio> to [audio:...] inline placeholders BEFORE markdown render.
  // This prevents Markdown-It from treating <audio> as an HTML block and splitting the paragraph.
  t = t.replace(/<audio\s+([^>]*?class="anki-md-click-play"[^>]*?)(?:\/>|>(?:<\/audio>)?)/gi, (match, attrs) => {
    const srcMatch = attrs.match(/src="([^"]+)"/i);
    if (!srcMatch) return match;
    return `[audio:${srcMatch[1]}]`;
  });

  // 3. Run markdown on safe text
  let html = md.render(t);

  // Convert [audio:filename.mp3] (both legacy and placeholders) into inline replay buttons
  html = html.replace(/\[audio:([^\]]+)\]/g, (_, filename) => {
    const escFilename = filename.replace(/'/g, "\\'");
    return `<a class="replay-button sound" href="#" data-filename="${escFilename}" onclick="event.preventDefault(); (globalThis.playPreviewAudio || window.playPreviewAudio)(event, this, '${escFilename}');">
  <svg class="play-button" viewBox="0 0 24 24">
    <path class="speaker-body" d="M11 5L6 9H2v6h4l5 4V5z" />
    <path class="wave-1" d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path class="wave-2" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
</a>`;
  });

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
