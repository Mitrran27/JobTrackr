import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { promises as dns } from 'dns';
import { isIP } from 'net';

export interface ExtractedJob {
  url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salaryText: string;
  employmentType: string;
  source: 'structured' | 'page' | 'text';
  warning?: string;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const UA2 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

const clean = (s: any, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function htmlToText(html: string): string {
  const $ = cheerio.load(`<div>${html}</div>`);
  $('br').replaceWith('\n');
  $('li').each((_, el) => {
    $(el).prepend('• ');
    $(el).append('\n');
  });
  $('p,div,h1,h2,h3,h4,ul,ol').each((_, el) => {
    $(el).append('\n');
  });
  return $.root().text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

@Injectable()
export class ExtractorService {
  /** SSRF guard: only public http(s) hosts */
  private async assertPublic(rawUrl: string): Promise<URL> {
    let u: URL;
    try {
      u = new URL(rawUrl);
    } catch {
      throw new BadRequestException('That does not look like a valid URL');
    }
    if (!['http:', 'https:'].includes(u.protocol)) throw new BadRequestException('Only http(s) URLs are supported');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
      throw new BadRequestException('That host is not allowed');
    }
    const addrs = isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
    if (!addrs.length) throw new BadRequestException('Could not resolve that website');
    if (addrs.some((a) => isPrivateIp(a.address))) throw new BadRequestException('That host is not allowed');
    return u;
  }

  private async fetchHtml(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
    let current = rawUrl;
    for (let i = 0; i < 4; i++) {
      const u = await this.assertPublic(current);
      const attempt = (ua: string, extra: Record<string, string> = {}) =>
        axios.get<string>(u.toString(), {
          timeout: 15000,
          maxRedirects: 0,
          maxContentLength: 3_000_000,
          responseType: 'text',
          headers: {
            'User-Agent': ua,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            ...extra,
          },
          validateStatus: (s) => s < 400,
        });
      const res = await attempt(UA)
        .catch((e) => {
          const code = e?.response?.status;
          // Some sites only block unknown clients: retry once as a search-engine style fetch
          if (code === 403 || code === 429 || code === 999) {
            return attempt(UA2, { Referer: 'https://www.google.com/' });
          }
          throw e;
        })
        .catch((e) => {
          const code = e?.response?.status;
          throw new BadRequestException(
            code
              ? `${new URL(rawUrl).hostname} blocks automated readers (HTTP ${code}), so I cannot open this link from the server. Paste the job description below and I will score it the same way.`
              : 'Could not reach that website. Paste the job description instead.',
          );
        });
      if (res.status >= 300 && res.headers.location) {
        current = new URL(res.headers.location, u).toString();
        continue;
      }
      return { html: String(res.data), finalUrl: u.toString() };
    }
    throw new BadRequestException('Too many redirects');
  }

  async fromUrl(url: string): Promise<ExtractedJob> {
    const { html, finalUrl } = await this.fetchHtml(url.trim());
    const $ = cheerio.load(html);

    // 1) schema.org JobPosting (used by most job boards)
    const postings: any[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (typeof n === 'object') {
        const t = n['@type'];
        if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) postings.push(n);
        if (n['@graph']) walk(n['@graph']);
      }
    };
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        walk(JSON.parse($(el).contents().text()));
      } catch {
        /* ignore malformed blocks */
      }
    });

    if (postings.length) {
      const p = postings[0];
      const loc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;
      const addr = loc?.address || {};
      const location = [addr.addressLocality, addr.addressRegion, addr.addressCountry?.name || addr.addressCountry]
        .filter((x) => typeof x === 'string' && x)
        .join(', ');
      const sal = p.baseSalary?.value || {};
      const salaryText = p.baseSalary
        ? clean(
            [p.baseSalary.currency, sal.minValue ?? sal.value, sal.maxValue ? `- ${sal.maxValue}` : '', sal.unitText ? `/ ${String(sal.unitText).toLowerCase()}` : '']
              .filter(Boolean)
              .join(' '),
            100,
          )
        : '';
      const job: ExtractedJob = {
        url: finalUrl,
        title: clean(p.title),
        company: clean(p.hiringOrganization?.name || (typeof p.hiringOrganization === 'string' ? p.hiringOrganization : '')),
        location: clean(location || (p.jobLocationType === 'TELECOMMUTE' ? 'Remote' : '')),
        description: htmlToText(String(p.description || '')).slice(0, 15000),
        salaryText,
        employmentType: clean(Array.isArray(p.employmentType) ? p.employmentType.join(', ') : p.employmentType, 60),
        source: 'structured',
      };
      if (job.title && job.description.length > 80) return job;
    }

    // 2) Generic page fallback
    const og = (n: string) => $(`meta[property="${n}"]`).attr('content') || $(`meta[name="${n}"]`).attr('content') || '';
    let title = clean(og('og:title') || $('h1').first().text() || $('title').text());
    let company = clean(og('og:site_name'));
    const m = title.match(/^(.+?)\s+(?:at|@|\||-|–|—)\s+(.+)$/i);
    if (m) {
      title = clean(m[1]);
      company = clean(m[2].replace(/\s*[|\-–—].*$/, ''));
    }
    const metaDesc = clean(og('og:description') || og('description') || og('twitter:description'), 2000);
    $('script,style,noscript,nav,footer,header,svg,form,iframe').remove();
    const scope = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
    const text = htmlToText(scope.html() || '').slice(0, 15000);

    if (text.length < 200) {
      // Pages built with JavaScript (JobStreet, LinkedIn, Indeed...) or bot-check pages have no readable body
      const blocked = /just a moment|access denied|attention required|are you a robot|captcha|verify you are human|sign in|log in|403|forbidden/i;
      if (!title || blocked.test(title) || blocked.test(metaDesc)) {
        throw new BadRequestException(
          'This site did not let me read the job (it blocks automated access). Paste the job description instead and I will still score it.',
        );
      }
      return {
        url: finalUrl,
        title,
        company,
        location: '',
        description: [metaDesc, text].filter(Boolean).join('\n\n'),
        salaryText: '',
        employmentType: '',
        source: 'page',
        warning:
          'This site loads its job details with JavaScript, so I could only read the title and a short summary. Paste the full job description for an accurate match score.',
      };
    }
    return { url: finalUrl, title, company, location: '', description: text, salaryText: '', employmentType: '', source: 'page' };
  }

  /** Fallback when the user pastes the job text */
  fromText(text: string, url = ''): ExtractedJob {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const title = clean(lines[0] || 'Untitled role', 150);
    return {
      url,
      title,
      company: '',
      location: '',
      description: text.trim().slice(0, 15000),
      salaryText: (text.match(/(?:RM|MYR|USD|SGD|\$)\s?[\d,]+(?:\s?[-–to]+\s?(?:RM|MYR|USD|SGD|\$)?\s?[\d,]+)?(?:\s?(?:per|\/)\s?(?:month|year|hour))?/i) || [''])[0],
      employmentType: '',
      source: 'text',
    };
  }
}
