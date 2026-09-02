// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import remarkCjkFriendly from 'remark-cjk-friendly';
import rehypeCollapsibleReferences from './src/plugins/rehype-collapsible-references.mjs';

export default defineConfig({
  // 暂以 www 为规范域名：Railway 只接受 CNAME，根域无法直接指向它；
  // 待 Namefi 支持 ANAME/ALIAS 展平后可改回 https://notaryzhou.com
  site: 'https://www.notaryzhou.com',
  // 内容页仍全部预渲染；只有标了 prerender = false 的接口按需执行。
  // middleware 模式：Astro 只交出一个 handler，静态文件与压缩仍由
  // scripts/serve-static.mjs 负责（standalone 模式不压缩）。
  output: 'static',
  adapter: node({ mode: 'middleware' }),
  markdown: {
    // CommonMark 的 right-flanking 规则会让 `**要点。**说明` 这类中文写法
    // 加粗失效（收尾 ** 前是标点、后接汉字）。该插件按 CJK 习惯放宽判定。
    remarkPlugins: [remarkCjkFriendly],
    // 参考来源默认折叠，避免文末长列表压垮版面（内容仍在 HTML 中，不影响索引）
    rehypePlugins: [rehypeCollapsibleReferences],
  },
  integrations: [
    sitemap({
      // /zh/ is a legacy noindex redirect page, keep it out of the sitemap
      // /zh/ 是历史遗留的 noindex 跳转页；/book 是交易流程，不进搜索
      filter: (page) => !page.includes('/zh/') && !page.includes('/book'),
      i18n: {
        defaultLocale: 'zh',
        locales: { zh: 'zh-CN', en: 'en' },
      },
    }),
  ],
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
