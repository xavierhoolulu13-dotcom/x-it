/**
 * In-page extraction helpers. The functions in ELEMENTS_SCRIPT run inside the
 * browser, so they must not reference anything from the Node scope.
 */

export const ELEMENTS_SCRIPT = String.raw`
(() => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    return rect.top < window.innerHeight * 3 && rect.bottom > -window.innerHeight * 2;
  };

  const selectorFor = (el, index) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const name = el.getAttribute('name');
    if (name) return el.tagName.toLowerCase() + '[name="' + name.replace(/"/g, '\\"') + '"]';
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) return '[data-testid="' + testId.replace(/"/g, '\\"') + '"]';
    const aria = el.getAttribute('aria-label');
    if (aria) return el.tagName.toLowerCase() + '[aria-label="' + aria.replace(/"/g, '\\"') + '"]';
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return el.tagName.toLowerCase() + '[placeholder="' + placeholder.replace(/"/g, '\\"') + '"]';
    const href = el.getAttribute('href');
    if (href && el.tagName === 'A') return 'a[href="' + href.replace(/"/g, '\\"') + '"]';
    return el.tagName.toLowerCase() + ':nth-of-type(' + index + ')';
  };

  const nodes = Array.from(
    document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [onclick]')
  ).filter(isVisible);

  const seen = new Set();
  const out = [];

  for (const el of nodes) {
    if (out.length >= 120) break;
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const key = el.tagName + '|' + text + '|' + Math.round(rect.top) + '|' + Math.round(rect.left);
    if (seen.has(key)) continue;
    seen.add(key);

    const index = out.length + 1;
    out.push({
      index,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || undefined) || undefined,
      text,
      selector: selectorFor(el, index),
      href: el.getAttribute('href') || undefined,
      name: el.getAttribute('name') || undefined,
      box: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    });
  }
  return out;
})()
`;

export const PAGE_TEXT_SCRIPT = String.raw`
(() => {
  const main = document.querySelector('main') || document.querySelector('article') || document.body;
  return (main?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
})()
`;

export const PAGE_HTML_SCRIPT = String.raw`document.documentElement.outerHTML`;

export const PAGE_LINKS_SCRIPT = String.raw`
(() => {
  const seen = new Set();
  const links = [];
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    const href = a.href;
    const text = (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const key = href + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ href, text });
    if (links.length >= 200) break;
  }
  return links;
})()
`;

/** Minimal HTML → Markdown conversion for readable page capture. */
export function htmlToMarkdown(html: string): string {
  let out = html;

  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<(script|style|noscript|svg|canvas)[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<head[\s\S]*?<\/head>/gi, "");

  out = out.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, text: string) => {
    return `\n${"#".repeat(Number(level))} ${strip(text)}\n`;
  });
  out = out.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
    const label = strip(text);
    return label ? `[${label}](${href})` : href;
  });
  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, text: string) => `\n- ${strip(text)}`);
  out = out.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, text: string) => `**${strip(text)}**`);
  out = out.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, text: string) => `_${strip(text)}_`);
  out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, text: string) => `\`${strip(text)}\``);
  out = out.replace(/<(br|hr)\s*\/?>/gi, "\n");
  out = out.replace(/<\/(p|div|section|article|tr|table|ul|ol|h[1-6])>/gi, "\n\n");
  out = out.replace(/<td[^>]*>/gi, " | ");
  out = out.replace(/<[^>]+>/g, "");
  out = decodeEntities(out);
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function strip(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)));
}
