/** URL-selected bilingual interface around Chinese editorial content; no persistence. */
const contentSelector = '.article-body, [data-article-content]';
const isEditorialPath = path => /^\/(articles|glossary)(\/|$)/.test(path);
const relativeUrl = url => `${url.pathname}${url.search}${url.hash}`;

export function getInterfaceLanguage(currentHref) {
  return new URL(currentHref).searchParams.get('ui') === 'en' ? 'en' : 'zh';
}

export function interfaceSwitchHref(currentHref, ui) {
  const url = new URL(currentHref);
  url.searchParams.set('ui', ui === 'en' ? 'en' : 'zh');
  return relativeUrl(url);
}

export function interfaceHref(href, ui, currentHref) {
  if (!href || href.startsWith('#')) return href;
  const current = new URL(currentHref);
  let url;
  try { url = new URL(href, current); } catch { return href; }
  if (url.origin !== current.origin || !isEditorialPath(url.pathname)) return href;
  if (ui === 'en') url.searchParams.set('ui', 'en');
  else url.searchParams.delete('ui');
  return relativeUrl(url);
}

export function initArticleInterface(doc = globalThis.document, currentHref = doc.defaultView.location.href) {
  const ui = getInterfaceLanguage(currentHref);
  doc.documentElement.dataset.articleUi = ui;
  doc.querySelectorAll('[data-interface-zh][data-interface-en]').forEach(node => {
    if (node.closest(contentSelector)) return;
    node.textContent = ui === 'en' ? node.dataset.interfaceEn : node.dataset.interfaceZh;
    node.lang = ui === 'en' ? 'en' : 'zh-CN';
  });
  doc.querySelectorAll('a[href]').forEach(link => {
    const switchUi = link.dataset.interfaceSwitch;
    if (switchUi === 'zh' || switchUi === 'en') {
      link.setAttribute('href', interfaceSwitchHref(currentHref, switchUi));
      return;
    }
    const original = link.getAttribute('href');
    if (!original || original.startsWith('#')) return;
    let source;
    try { source = new URL(original, currentHref); } catch { return; }
    if (source.origin !== new URL(currentHref).origin) return;
    const localized = !link.closest(contentSelector) && (ui === 'en'
      ? link.dataset.interfaceHrefEn : link.dataset.interfaceHrefZh);
    link.setAttribute('href', interfaceHref(localized || original, ui, currentHref));
  });
  return ui;
}
