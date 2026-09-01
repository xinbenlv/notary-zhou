// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkCjkFriendly from 'remark-cjk-friendly';
import rehypeCollapsibleReferences from './src/plugins/rehype-collapsible-references.mjs';

export default defineConfig({
  // 暂以 www 为规范域名：Railway 只接受 CNAME，根域无法直接指向它；
  // 待 Namefi 支持 ANAME/ALIAS 展平后可改回 https://notaryzhou.com
  site: 'https://www.notaryzhou.com',
  output: 'static',
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
      filter: (page) => !page.includes('/zh/'),
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
