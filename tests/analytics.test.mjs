import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../src/components/GoogleAnalytics.astro', import.meta.url), 'utf8')
  .match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
class ClickTarget {
  constructor(link) { this.link = link; }
  closest() { return this.link; }
}
function runtime(hostname = 'www.notaryzhou.com') {
  const scripts = [], listeners = [];
  const context = {
    window: {}, Element: ClickTarget, URL, Date,
    location: { hostname, href: `https://${hostname}/en/verify/?q=Private+Name#private` },
    document: {
      referrer: 'https://example.com/page?email=private@example.com#secret',
      createElement: () => ({}),
      head: { appendChild: script => scripts.push(script) },
      addEventListener: (type, listener) => listeners.push({ type, listener }),
    },
  };
  const run = () => vm.runInNewContext(code, context);
  const events = () => (context.window.dataLayer ?? []).filter(args => args[0] === 'event');
  return { context, scripts, listeners, run, events };
}

test('analytics initializes once and excludes lookup queries and referrer parameters', () => {
  const r = runtime(); r.run(); r.run();
  assert.equal(r.scripts.length, 1);
  assert.equal(r.listeners.length, 1);
  assert.equal(r.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-NSPEQT81PG');
  const config = r.context.window.dataLayer.find(args => args[0] === 'config');
  assert.equal(config[2].page_location, 'https://www.notaryzhou.com/en/verify/');
  assert.equal(config[2].page_referrer, 'https://example.com/page');
  assert.equal(config[2].allow_google_signals, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(r.events().length, 0);
});

test('only marked appointment email clicks qualify; event payload cannot contain contact contents', () => {
  const r = runtime(); r.run();
  const click = r.listeners[0].listener;
  assert.equal(r.listeners[0].type, 'click');
  click({ target: new ClickTarget(null) });
  click({ target: {} });
  const link = {
    dataset: { contactPlacement: 'booking' },
    getAttribute: () => 'mailto:private@example.com?subject=Private+Name&body=Sensitive+document',
    textContent: 'private@example.com',
  };
  click({ target: new ClickTarget(link), defaultPrevented: true });
  click({ target: new ClickTarget({ ...link, dataset: { contactPlacement: 'privacy' } }) });
  click({ target: new ClickTarget({ ...link, getAttribute: () => 'https://example.com/' }) });
  assert.equal(r.events().length, 0);
  click({ target: new ClickTarget(link) });
  const [event] = r.events();
  assert.equal(event[1], 'contact_email_click');
  assert.deepEqual(JSON.parse(JSON.stringify(event[2])), {
    contact_method: 'email', contact_placement: 'booking', transport_type: 'beacon',
  });
  assert.equal(r.events().length, 1);
});

test('localhost and other hosts never load analytics or register click tracking', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'preview.example.com']) {
    const r = runtime(hostname); r.run();
    assert.equal(r.scripts.length, 0);
    assert.equal(r.listeners.length, 0);
    assert.equal(r.context.window.dataLayer, undefined);
  }
});
