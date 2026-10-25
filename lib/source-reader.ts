import { lookup } from 'node:dns/promises';
import { Agent, fetch as safeFetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { chromium } from 'playwright';
import { AppError } from './errors';

const PAGE_LIMIT = 3_000_000;
const TEXT_LIMIT = 45_000;
const jdWords = /岗位职责|任职要求|职位描述|职位要求|工作职责|资格要求|招聘要求|responsibilit|qualification|job description/i;
const dnsCache = new Map<string, { addresses: { address: string; family: number }[]; expires: number }>();

function syntheticAddress(address: string) {
  const parsed = ipaddr.process(address);
  return parsed.kind() === 'ipv4' ? parsed.match(ipaddr.parse('198.18.0.0'), 15) : parsed.match(ipaddr.parse('2001:2::'), 48);
}

export async function validatePublicUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError(400, 'INVALID_URL', '请填写完整的招聘页面链接。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new AppError(400, 'INVALID_URL', '请使用公开网页的 http 或 https 链接。');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || /\.(local|localhost|internal|test|invalid)$/.test(hostname)) throw new AppError(400, 'PRIVATE_URL', '请提供公开招聘网页的链接。');
  const cached = dnsCache.get(hostname);
  let addresses = cached && cached.expires > Date.now() ? cached.addresses : await lookup(hostname, { all: true, verbatim: true }).catch(() => { throw new AppError(422, 'SOURCE_UNAVAILABLE', '无法找到这个网页，请核对链接，或上传截图继续。'); });
  // Some local proxy networks return benchmark addresses. Resolve the domain
  // through a fixed public HTTPS resolver, then still require and pin public IPs.
  if (!ipaddr.isValid(hostname) && addresses.length && addresses.every(({ address }) => syntheticAddress(address))) {
    const response = await fetch(`https://dns.alidns.com/resolve?name=${encodeURIComponent(hostname)}&type=A`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!response?.ok) throw new AppError(422, 'SOURCE_UNAVAILABLE', '暂时无法读取网页地址，请稍后重试或上传截图。');
    const data = await response.json() as { Answer?: { type: number; data: string }[] };
    addresses = (data.Answer || []).filter((item) => item.type === 1 && ipaddr.isValid(item.data)).map((item) => ({ address: item.data, family: 4 }));
  }
  if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) throw new AppError(400, 'PRIVATE_URL', '请提供公开招聘网页的链接。');
  if (dnsCache.size > 200) dnsCache.clear();
  dnsCache.set(hostname, { addresses, expires: Date.now() + 60_000 });
  return { url, addresses };
}

export async function publicRequest(input: string, headers: Record<string, string> = {}, redirects = 0, method: 'GET' | 'POST' = 'GET', body?: string, signal?: AbortSignal): Promise<{ body: Buffer; headers: Record<string, string>; status: number; url: string }> {
  if (redirects > 4) throw new AppError(422, 'SOURCE_UNAVAILABLE', '网页跳转过多，请上传截图或粘贴正文继续。');
  const { url, addresses } = await validatePublicUrl(input);
  const dispatcher = new Agent({ connect: { lookup: (_hostname, options, callback) => {
    const candidates = options.family ? addresses.filter((address) => address.family === options.family) : addresses;
    const picked = candidates.length ? candidates : addresses;
    if (options.all) callback(null, picked);
    else callback(null, picked[0].address, picked[0].family);
  } } });
  try {
    const response = await safeFetch(url, {
      dispatcher, redirect: 'manual', signal: AbortSignal.any([signal || AbortSignal.timeout(12_000), AbortSignal.timeout(12_000)]), method, body,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', ...headers },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel();
      return publicRequest(new URL(response.headers.get('location')!, url).href, headers, redirects + 1, response.status === 303 ? 'GET' : method, response.status === 303 ? undefined : body, signal);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PAGE_LIMIT) { await reader.cancel(); throw new AppError(422, 'SOURCE_TOO_LARGE', '网页内容过大，请上传岗位截图或粘贴正文。'); }
      chunks.push(value);
    }
    return { body: Buffer.concat(chunks), headers: Object.fromEntries(response.headers), status: response.status, url: url.href };
  } finally { await dispatcher.close(); }
}

export function textFromHtml(html: string) {
  const $ = load(html);
  const structured: string[] = [];
  $('script[type="application/ld+json"]').each((_index, script) => {
    try {
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const item = value as Record<string, unknown>;
        if (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))) structured.push(load(`<div>${JSON.stringify(item)}</div>`).text());
        if (item['@graph']) visit(item['@graph']);
      };
      visit(JSON.parse($(script).text()));
    } catch { /* Ignore invalid page metadata. */ }
  });
  $('script, style, nav, footer, header, noscript, svg, iframe').remove();
  $('br').replaceWith('\n');
  $('p, div, li, section, article, h1, h2, h3').append('\n');
  return [structured.join('\n'), $('title').text(), $('body').text()].join('\n').replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim().slice(0, TEXT_LIMIT);
}

let activeBrowsers = 0;
async function renderedText(url: string) {
  if (activeBrowsers >= 2) throw new AppError(429, 'SOURCE_BUSY', '正在读取其他网页，请稍后重试。');
  activeBrowsers++;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'zh-CN' });
    let requests = 0;
    const jobPayloads: string[] = [];
    await context.routeWebSocket('**/*', (socket) => socket.close());
    await context.route('**/*', async (route) => {
      const request = route.request();
      const readOnlyPost = request.method() === 'POST' && /search|detail|query|list|get|info/i.test(new URL(request.url()).pathname) && !/login|add|create|delete|submit|apply|update|write|upload/i.test(new URL(request.url()).pathname) && /json/.test(request.headers()['content-type'] || '') && (request.postData()?.length || 0) < 100000;
      if (++requests > 100 || (!['GET', 'HEAD'].includes(request.method()) && !readOnlyPost) || ['image', 'media', 'font'].includes(request.resourceType())) { await route.abort(); return; }
      try {
        const result = await publicRequest(request.url(), { Accept: request.headers()['accept'] || '*/*', ...(readOnlyPost ? { 'Content-Type': 'application/json' } : {}) }, 0, readOnlyPost ? 'POST' : 'GET', readOnlyPost ? request.postData() || undefined : undefined);
        if (jobPayloads.length < 4 && /json/i.test(result.headers['content-type'] || '') && /description|requirement|responsibilit|jobDesc|任职要求|岗位职责/.test(result.body.toString('utf8'))) jobPayloads.push(textFromHtml(`<html><body>${result.body.toString('utf8').replaceAll('<', '&lt;')}</body></html>`).slice(0, 12000));
        const headers = { ...result.headers };
        for (const key of ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']) delete headers[key];
        await route.fulfill({ status: result.status, headers, body: result.body });
      } catch { await route.abort().catch(() => {}); }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForFunction(() => /岗位职责|任职要求|职位描述|职位要求|工作职责|responsibilit|qualification/i.test(document.body.innerText), undefined, { timeout: 12_000 }).catch(() => {});
    const text = await page.locator('body').innerText({ timeout: 5_000 });
    return [text, ...jobPayloads].join('\n').slice(0, TEXT_LIMIT);
  } finally { await browser?.close().catch(() => {}); activeBrowsers--; }
}

export async function readPublicJob(url: URL, request: typeof publicRequest = publicRequest) {
  const jobId = /\/position\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
  if (jobId && (url.hostname.endsWith('.jobs.feishu.cn') || url.hostname === 'jobs.bytedance.com')) {
    try {
      const endpoint = url.hostname === 'jobs.bytedance.com' ? '/api/v1/job/posts/' : '/api/v1/search/job/posts/';
      const result = await request(`${url.origin}${endpoint}${jobId}`, { Accept: 'application/json' });
      const payload = JSON.parse(result.body.toString('utf8'));
      const job = payload.data?.job_post_detail || payload.data?.job_post || payload.data?.job || payload.data;
      if (result.status === 200 && (!payload.code || payload.code === 0) && (!job?.id || String(job.id) === jobId) && job?.title && (job.description || job.requirement)) {
        const raw = textFromHtml(`<html><body><h1>${job.title}</h1><p>岗位职责</p>${job.description || ''}<p>任职要求</p>${job.requirement || ''}<p>${JSON.stringify({ city: job.city_list || job.city_info, category: job.job_category, recruitmentType: job.recruit_type || job.recruitment_type, department: job.department_info })}</p></body></html>`);
        return { text: raw, sourceUrl: url.href, collectedAt: new Date().toISOString(), method: 'public-job-data' };
      }
    } catch { /* Continue with the public page when its data endpoint is unavailable. */ }
  }
  return null;
}

export async function readSource(input: string, purpose: 'job' | 'general' = 'job') {
  const { url } = await validatePublicUrl(input);
  let text = '';
  let resolvedUrl = url.href;
  if (purpose === 'job') { const known = await readPublicJob(url); if (known) return known; }
  try {
    const result = await publicRequest(url.href);
    resolvedUrl = result.url;
    if (result.status >= 200 && result.status < 300 && /html|text|json/i.test(result.headers['content-type'] || '')) text = textFromHtml(result.body.toString('utf8'));
    if (text.length >= 200 && (purpose === 'general' || jdWords.test(text))) return { text, sourceUrl: resolvedUrl, collectedAt: new Date().toISOString(), method: 'html' };
  } catch (error) { if (error instanceof AppError && error.code === 'PRIVATE_URL') throw error; }
  try {
    const rendered = await renderedText(url.href);
    if (rendered.length >= 150 && (jdWords.test(rendered) || rendered.length > text.length + 300)) text = rendered;
  } catch { /* Keep any useful public HTML when rendering fails. */ }
  if (text.length < 100 || (purpose === 'job' && !jdWords.test(text))) throw new AppError(422, 'SOURCE_UNAVAILABLE', purpose === 'job' ? '没有读取到完整岗位内容。请上传JD截图或粘贴正文，已填写的链接会保留。' : '没有读取到足够的公开内容，请粘贴网页文字继续。');
  return { text, sourceUrl: resolvedUrl, collectedAt: new Date().toISOString(), method: 'browser' };
}
