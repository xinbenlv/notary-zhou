#!/usr/bin/env node
/**
 * 文章质量校验：跑在 `dist/` 构建产物上，检查渲染后的真实结果。
 *
 * 中文写作最容易踩的坑是 CommonMark 的 right-flanking 规则：`**要点。**说明`
 * 里收尾的 `**` 前面是标点、后面是汉字，不构成合法收尾定界符，加粗会失效、
 * 星号原样显示。同类问题也出现在 `*斜体*` 和 `` `代码` `` 上。
 *
 * 用法：npm run build && node scripts/check-articles.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST_ROOT = existsSync('dist/client') ? 'dist/client' : 'dist';
const DIST = join(DIST_ROOT, 'articles');
const SRC = 'src/content/articles';

if (!existsSync(DIST)) {
  console.error(`✗ 找不到 ${DIST}/，请先运行 npm run build`);
  process.exit(1);
}

/** Collect Chinese article bodies, excluding directory/topic pages. */
const pages = [];
function walk(dir, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file, `${prefix}${entry.name}/`);
    else if (entry.name === 'index.html' && readFileSync(file, 'utf8').includes('class="article-body"'))
      pages.push({ slug: prefix.replace(/\/$/, ''), file });
  }
}
walk(DIST);

const problems = [];
const report = (slug, kind, detail) => problems.push({ slug, kind, detail });
if (existsSync(join(DIST_ROOT, 'en/articles'))) report('en/articles', '已移除的英文文章目录重新生成', '文章仅以中文发布');

for (const { slug, file } of pages) {
  const html = readFileSync(file, 'utf8');
  // 只看正文，避免 JSON-LD / meta 里的文本误报
  const body = html.match(/<article class="article-body"[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? html;
  const text = body.replace(/<[^>]+>/g, '');

  // 1. 未被渲染的行内标记
  for (const [re, kind] of [
    [/\*\*/g, '未渲染的 ** 加粗标记'],
    [/(?<![*\w])\*(?!\*)[^\s*][^*\n]*\*(?![*\w])/g, '未渲染的 * 斜体标记'],
  ]) {
    for (const m of text.matchAll(re)) {
      const at = Math.max(0, m.index - 12);
      report(slug, kind, `…${text.slice(at, m.index + 24).replace(/\s+/g, ' ')}…`);
    }
  }

  // 2. 引用链完整性：每个 #ref-xxx 内链都要有对应锚点，且锚点不应无人引用
  const anchors = new Set([...body.matchAll(/id="(ref-[\w-]+)"/g)].map((m) => m[1]));
  const links = new Set([...body.matchAll(/href="#(ref-[\w-]+)"/g)].map((m) => m[1]));
  for (const l of links) if (!anchors.has(l)) report(slug, '引用锚点缺失', `#${l}`);
  for (const a of anchors) if (!links.has(a)) report(slug, '参考条目无人引用', `#${a}`);

  // 3. 图片文件是否真实存在
  for (const m of html.matchAll(/src="(\/images\/[^"]+)"/g)) {
    if (!existsSync(join(DIST_ROOT, m[1]))) report(slug, '图片缺失', m[1]);
  }

  // 4. 免责声明是否就位
  if (!html.includes('article-disclaimer')) report(slug, '缺少免责声明', '');
}

// 5. 每篇源文件都要有对应的已发布页面（漏掉 draft:true 时能发现）
const published = new Set(pages.map((p) => p.slug));
function checkSource(dir, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { checkSource(join(dir, entry.name), `${prefix}${entry.name}/`); continue; }
    if (!entry.name.endsWith('.md') || entry.name === 'README.md') continue;
    const slug = prefix + entry.name.replace(/\.md$/, '');
    const raw = readFileSync(join(dir, entry.name), 'utf8');
    const draft = /^draft:\s*true/m.test(raw);
    if (prefix.startsWith('en/') || /^lang:\s*['"]?en['"]?\s*$/m.test(raw)) report(slug, '英文文章源文件不符合发布政策', entry.name);
    if (!published.has(slug) && !draft) report(slug, '源文件存在但未生成页面', entry.name);
    if (published.has(slug) && draft) report(slug, '草稿被发布', entry.name);
  }
}
checkSource(SRC);

if (problems.length === 0) {
  console.log(`✓ ${pages.length} 篇文章全部通过校验`);
  process.exit(0);
}

console.error(`✗ 发现 ${problems.length} 个问题：\n`);
for (const p of problems) console.error(`  [${p.slug}] ${p.kind}\n      ${p.detail}`);
process.exit(1);
