import api, { errMsg } from './api';

export const KINDS = [
  { key: 'CV', label: 'CV' },
  { key: 'COVER_LETTER', label: 'Cover letter' },
];
export const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || k;

/** Starter content for a blank document */
export function template(kind, name = '') {
  const n = name || 'Your Name';
  if (kind === 'COVER_LETTER') {
    return `<p><strong>${esc(n)}</strong><br>email@example.com · +60 12-345 6789</p>
<p>${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}</p>
<p>Hiring Manager<br>Company Name<br>Address</p>
<p>Dear Hiring Manager,</p>
<p>I am writing to apply for the position of <strong>[Job title]</strong> at [Company]. …</p>
<p>In my current role at …</p>
<p>I would welcome the chance to discuss how I can contribute to your team. Thank you for your time and consideration.</p>
<p>Yours sincerely,<br>${esc(n)}</p>`;
  }
  return `<h1 style="text-align:center">${esc(n)}</h1>
<p style="text-align:center">email@example.com · +60 12-345 6789 · City, Country · linkedin.com/in/you</p>
<h2>Profile</h2>
<p>A short summary of who you are and what you are looking for.</p>
<h2>Experience</h2>
<h3>Job title, Company</h3>
<p><em>Jan 2024 – Present · City</em></p>
<ul><li>What you achieved, with numbers where you can</li><li>Another achievement</li></ul>
<h2>Education</h2>
<h3>Degree, University</h3>
<p><em>2020 – 2024</em></p>
<h2>Skills</h2>
<p>Skill one, skill two, skill three</p>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Download a document as PDF or Word, using the server's filename */
export async function downloadDoc(id, format, fallbackTitle = 'document') {
  try {
    const res = await api.get(`/documents/${id}/export`, { params: { format }, responseType: 'blob' });
    const cd = res.headers['content-disposition'] || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
    const name = m ? decodeURIComponent(m[1]) : `${fallbackTitle}.${format}`;
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    throw new Error(await blobErr(e));
  }
}

/** Error responses for blob requests arrive as a Blob; read the JSON message out of it */
async function blobErr(e) {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try {
      const j = JSON.parse(await d.text());
      return Array.isArray(j.message) ? j.message.join(', ') : j.message || 'Could not export the document';
    } catch {
      return 'Could not export the document';
    }
  }
  return errMsg(e);
}

/**
 * Light client-side clean-up for pasted HTML (the server sanitises again on save).
 * Keeps headings, paragraphs, lists, bold/italic/underline/strike, links and alignment.
 */
const KEEP = { P: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', UL: 'ul', OL: 'ol', LI: 'li', B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', S: 's', STRIKE: 's', DEL: 's', BR: 'br', A: 'a' };
const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IMG', 'SVG', 'IFRAME', 'OBJECT', 'TEMPLATE', 'XML']);
const BLOCK = new Set(['DIV', 'SECTION', 'ARTICLE', 'TR', 'BLOCKQUOTE', 'PRE', 'HEADER', 'FOOTER']);

export function cleanPaste(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = document.createElement('div');
  const walk = (src, dst) => {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) {
        dst.appendChild(document.createTextNode(n.nodeValue));
        continue;
      }
      if (n.nodeType !== 1 || DROP.has(n.tagName) || n.tagName.includes(':')) continue;
      const tag = KEEP[n.tagName] || (BLOCK.has(n.tagName) && !n.querySelector('p,div,h1,h2,h3,ul,ol,table') ? 'p' : null);
      if (!tag) {
        walk(n, dst);
        continue;
      }
      const el = document.createElement(tag);
      if (tag === 'a') {
        const href = n.getAttribute('href') || '';
        if (!/^(https?:|mailto:|tel:)/i.test(href)) {
          walk(n, dst);
          continue;
        }
        el.setAttribute('href', href);
      }
      const align = n.style?.textAlign;
      if (['center', 'right', 'justify'].includes(align)) el.style.textAlign = align;
      walk(n, el);
      dst.appendChild(el);
    }
  };
  walk(doc.body, out);
  return out.innerHTML;
}
