/** Exercise bilingual interface navigation without changing Chinese editorial content.
 * Small DOM/event fixtures keep browser behavior testable without adding a runtime dependency. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getInterfaceLanguage, interfaceHref, interfaceSwitchHref, initArticleInterface } from '../src/lib/article-interface.mjs';

const current = 'https://www.notaryzhou.com/articles/china-power-of-attorney/?campaign=guide&ui=en#ref-china-apostille';
const parsed = href => new URL(href, current);
const datasetKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class Element {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.dataset = {}; this.children = []; this.value = text;
    for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } return this; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name.startsWith('data-')) this.dataset[datasetKey(name)] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  get textContent() { return this.value + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this.value = value; this.children = []; }
  get href() { return this.getAttribute('href'); }
  set href(value) { this.setAttribute('href', value); }
  get lang() { return this.getAttribute('lang'); }
  set lang(value) { this.setAttribute('lang', value); }
  matches(selector) {
    return selector.split(',').some(part => {
      const s = part.trim();
      const tag = s.match(/^[a-z]+/i)?.[0];
      if (tag && tag.toUpperCase() !== this.tagName) return false;
      const cls = s.match(/\.([\w-]+)/)?.[1];
      if (cls && !(this.attrs.class || '').split(/\s+/).includes(cls)) return false;
      return [...s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]/g)].every(([, key, value]) => this.attrs[key] !== undefined && (value === undefined || this.attrs[key] === value));
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function interfaceDocument() {
  const element = (tag, attrs, text) => new Element(tag, attrs, text);
  const html = element('html', { lang: 'zh-CN' });
  const label = element('span', { 'data-interface-zh': '返回文章', 'data-interface-en': 'All guides' }, '返回文章');
  const switchEn = element('a', { href: '?ui=en', 'data-interface-switch': 'en' }, 'English');
  const switchZh = element('a', { href: '?ui=zh', 'data-interface-switch': 'zh' }, '中文');
  const directoryLink = element('a', { href: '/articles/' }, '所有文章');
  const bodyLink = element('a', { href: '/articles/apostille-for-china/#ref-ca' }, '海牙认证');
  const citation = element('a', { href: '#ref-china-apostille' }, '[1]');
  const external = element('a', { href: 'https://www.sos.ca.gov/notary/request-apostille?section=1#fees' }, '官方来源');
  const title = element('h1', { 'data-article-content': '', 'data-interface-zh': '赴中国使用的委托书', 'data-interface-en': 'Must not translate' }, '赴中国使用的委托书');
  const description = element('p', { 'data-article-content': '', 'data-interface-zh': '先确认接收方要求。', 'data-interface-en': 'Must not translate' }, '先确认接收方要求。');
  const body = element('article', { class: 'article-body', lang: 'zh-CN' }).append(element('p', { 'data-interface-zh': '正文必须保持中文。', 'data-interface-en': 'Must not translate' }, '正文必须保持中文。'), bodyLink, citation, external);
  const cta = element('a', { href: '/#book', 'data-interface-href-zh': '/#book', 'data-interface-href-en': '/en/#book' }, '预约');
  html.append(label, switchEn, switchZh, directoryLink, title, description, body, cta);
  const blocked = () => { throw new Error('Storage/cookies must not be required'); };
  const view = { location: { href: current } };
  Object.defineProperties(view, { localStorage: { get: blocked }, sessionStorage: { get: blocked } });
  const doc = { documentElement: html, defaultView: view, querySelectorAll: selector => html.querySelectorAll(selector) };
  Object.defineProperty(doc, 'cookie', { get: blocked, set: blocked });
  return { doc, html, label, switchEn, switchZh, directoryLink, title, description, body, bodyLink, citation, external, cta };
}

test('interface mode is explicit in the URL and defaults to Chinese', () => {
  assert.equal(getInterfaceLanguage(current), 'en');
  for (const suffix of ['', '?ui=zh', '?ui=fr', '?ui=EN']) assert.equal(getInterfaceLanguage(`https://www.notaryzhou.com/articles/${suffix}`), 'zh');
});

test('same-page interface switching preserves article path, unrelated parameters and citation hash', () => {
  for (const language of ['zh', 'en']) {
    const next = parsed(interfaceSwitchHref(current, language));
    assert.equal(next.pathname, '/articles/china-power-of-attorney/');
    assert.equal(next.searchParams.get('campaign'), 'guide');
    assert.deepEqual(next.searchParams.getAll('ui'), [language]);
    assert.equal(next.hash, '#ref-china-apostille');
  }
});

test('English mode survives cross-article navigation and Chinese mode removes the interface override', () => {
  for (const href of ['/articles/', '/articles/apostille-for-china/?from=related#fees', '../same-person-affidavit/', '/glossary/#apostille']) {
    const next = parsed(interfaceHref(href, 'en', current));
    assert.equal(next.searchParams.get('ui'), 'en');
    assert.equal(next.pathname, parsed(href).pathname);
    assert.equal(next.hash, parsed(href).hash);
    assert.equal(next.searchParams.get('from'), parsed(href).searchParams.get('from'));
    const zh = parsed(interfaceHref(next.href, 'zh', current));
    assert.equal(zh.searchParams.has('ui'), false);
    assert.equal(zh.hash, next.hash);
  }
});

test('citations, external sources, contact links and non-editorial routes are not rewritten', () => {
  for (const href of ['#ref-ca', 'https://www.sos.ca.gov/notary?ui=original#fees', '//example.com/articles/source/', 'mailto:hello@example.com', '/en/verify/?q=Zhou', '/articleship/']) {
    assert.equal(interfaceHref(href, 'en', current), href);
  }
});

test('English interface localizes labels and links while Chinese titles, descriptions and body text remain unchanged without storage', () => {
  const r = interfaceDocument();
  const before = [r.title.textContent, r.description.textContent, r.body.textContent];
  assert.equal(initArticleInterface(r.doc), 'en');
  assert.equal(r.html.dataset.articleUi, 'en');
  assert.equal(r.html.lang, 'zh-CN');
  assert.equal(r.label.textContent, 'All guides');
  assert.equal(r.label.lang, 'en');
  assert.deepEqual([r.title.textContent, r.description.textContent, r.body.textContent], before);
  assert.equal(parsed(r.directoryLink.href).searchParams.get('ui'), 'en');
  assert.equal(parsed(r.bodyLink.href).searchParams.get('ui'), 'en');
  assert.equal(parsed(r.bodyLink.href).hash, '#ref-ca');
  assert.equal(r.citation.href, '#ref-china-apostille');
  assert.equal(r.external.href, 'https://www.sos.ca.gov/notary/request-apostille?section=1#fees');
  assert.equal(r.cta.href, '/en/#book');
  assert.equal(parsed(r.switchZh.href).hash, '#ref-china-apostille');
});

test('reinitializing after a citation jump refreshes both same-page switches without changing content', () => {
  const r = interfaceDocument();
  initArticleInterface(r.doc, current);
  const afterJump = current.replace('#ref-china-apostille', '#another-source');
  initArticleInterface(r.doc, afterJump);
  for (const link of [r.switchEn, r.switchZh]) assert.equal(parsed(link.href).hash, '#another-source');
  assert.equal(parsed(r.switchZh.href).searchParams.get('ui'), 'zh');
  initArticleInterface(r.doc, parsed(interfaceSwitchHref(afterJump, 'zh')).href);
  assert.equal(r.label.textContent, '返回文章');
  assert.equal(parsed(r.bodyLink.href).searchParams.has('ui'), false);
  assert.equal(r.title.textContent, '赴中国使用的委托书');
});

test('two interface navbars each register one menu handler even if the component script runs twice', () => {
  const code = readFileSync(new URL('../src/components/Navbar.astro', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const docListeners = [], mediaListeners = [];
  const navs = ['zh', 'en'].map(language => {
    const handlers = { toggle: [], drawer: [] };
    const inner = { dataset: {} };
    const attrs = { 'aria-expanded': 'false' };
    const toggle = { addEventListener: (_, fn) => handlers.toggle.push(fn), getAttribute: name => attrs[name], setAttribute: (name, value) => { attrs[name] = value; }, focus: () => {} };
    const drawer = { addEventListener: (_, fn) => handlers.drawer.push(fn) };
    return { dataset: { openLabel: `open-${language}`, closeLabel: `close-${language}` }, querySelector: selector => ({ '.nav-inner': inner, '[data-menu-toggle]': toggle, '.nav-drawer': drawer })[selector], contains: () => false, handlers, attrs, inner };
  });
  const context = { document: { querySelectorAll: () => navs, addEventListener: (type, listener) => docListeners.push({ type, listener }) }, window: { matchMedia: () => ({ addEventListener: (_, listener) => mediaListeners.push(listener) }) } };
  vm.runInNewContext(code, context); vm.runInNewContext(code, context);
  for (const nav of navs) { assert.equal(nav.handlers.toggle.length, 1); assert.equal(nav.handlers.drawer.length, 1); }
  assert.equal(docListeners.length, 4); assert.equal(mediaListeners.length, 2);
  navs[1].handlers.toggle[0]();
  assert.equal(navs[1].attrs['aria-expanded'], 'true');
  assert.equal(navs[1].inner.dataset.menuOpen, 'true');
  assert.equal(navs[0].attrs['aria-expanded'], 'false');
});
