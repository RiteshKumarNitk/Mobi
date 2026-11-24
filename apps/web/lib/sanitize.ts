import sanitizeHtml from "sanitize-html";

/**
 * Allow-list sanitizer for admin-authored rich text (CMS pages, blog posts).
 * The storefront renders this HTML directly, so scripts, event handlers,
 * iframes and javascript: URLs are stripped.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "blockquote", "pre", "code",
    "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "span", "div",
    "a", "img", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs,
    }),
  },
};

export const sanitizeRichText = (html: string | null | undefined): string | null => (html == null ? null : sanitizeHtml(html, OPTIONS));
