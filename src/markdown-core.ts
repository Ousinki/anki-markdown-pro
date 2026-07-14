import mark from "markdown-it-mark";
import alerts from "markdown-it-github-alerts";
import { createMarkdownExit } from "markdown-exit";

export const md = createMarkdownExit({ html: true });
md.use(mark as never);
md.use(alerts as never);

// Allow safe inline/block HTML tags, strip anything else
const ALLOWED_HTML = /^<\/?(font|kbd|img|a|b|i|em|strong|br|code|mark|s|del|sup|sub|span|hr|table|thead|tbody|tr|th|td)(\s[^>]*)?>$/i;
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

  // 3. Run markdown on safe text
  let html = md.render(t);

  // 4. Restore native MathJax delimiters (placeholders survive markdown untouched)
  html = html.replace(/\u0002ANKI_MATH_(\d+)\u0003/g, (_, i) => stash[parseInt(i)]);

  return html;
}
