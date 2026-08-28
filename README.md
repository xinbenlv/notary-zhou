# Notary Zhou

周国锦（George Zhou）的双语公证服务官网，服务湾区 Santa Clara / San Mateo / Alameda 三县。
已上线：[notaryzhou.com](https://notaryzhou.com)（加州公证 Commission #2557299，Santa Clara County，2030-05-30 到期）。

项目日志见 [MEMORY.md](MEMORY.md)。

## 技术栈

- [Astro](https://astro.build) 6 静态站，原生 CSS（无 Tailwind）
- 部署：Vercel，`git push` 到 main 自动上线
- DNS：Namefi

## 结构

```
src/
├── config.ts            # 唯一数据源：联系方式、Commission、法定费用表、开关
├── layouts/Layout.astro # head、JSON-LD、noindex 逻辑
├── pages/index.astro    # 单页落地页
├── components/          # Navbar / Hero / Services / Booking / Footer / PasswordGate
└── styles/global.css    # 设计系统（CSS 自定义属性）
public/
├── images/george-zhou.jpg
└── robots.txt           # 仍 Disallow 全站，见下方待办
```

改文案、费用、联系方式只动 `config.ts`。`isDraft: true` 把全站切回草稿模式
（文案变化 + noindex；再填 `previewPassword` 可加密码门，当前两者均已关闭）。

费用表是 Cal. Gov. Code §8211 法定上限，2026 年 8 月核对；法条修订后需同步。

## 开发

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # 产物在 dist/
```

## 域名

| 域名 | 用途 |
|------|------|
| `notaryzhou.com` | 主站（Vercel） |
| `notaryzhou.co` / `notaryzhou.online` / `www` | 转发 → .com |

## 待办

- [ ] `public/robots.txt` 还在 `Disallow: /`——站点已上线但搜索引擎抓不到
- [ ] 在线预约：Booking 区目前只有邮箱占位，待接 Calendly / Cal.com
- [ ] NNA 认证、E&O 保险（`config.ts` 中仍为 `Pending`）
- [ ] Google Business Profile

私有项目，保留所有权利。
