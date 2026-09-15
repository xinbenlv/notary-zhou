# Notary Zhou

George (GJ) Zhou的双语公证服务官网，服务湾区 Santa Clara / San Mateo / Alameda 三县。
已上线：[notaryzhou.com](https://notaryzhou.com)（Commission #2557299）。

项目日志见 [MEMORY.md](MEMORY.md)。

![中文跨境文件指南](docs/assets/global-guides-mobile.png)

提供普通话上门公证说明、公证员查验，以及附官方来源的中文文件指南。
FAQ、指南和文章仅发布中文。本次变更见 [发布说明](reports/chinese-only-guides.md)。

## 技术栈

- [Astro](https://astro.build) 6，静态页面 + Node 中间件，原生 CSS（无 Tailwind）
- 部署：官网和公证员名单内存 API 使用同一个 Railway 服务
- DNS：Namefi

## 结构

```
src/
├── config.ts            # 唯一数据源：联系方式、Commission、法定费用表、开关
├── layouts/Layout.astro # head、JSON-LD、noindex 逻辑
├── pages/index.astro    # 单页落地页
├── components/          # 官网区块，含中英文 NotaryLookup
├── lib/                 # 官方名单下载、校验、解析及内存索引
└── styles/global.css    # 设计系统（CSS 自定义属性）
public/
├── images/george-zhou.jpg
└── robots.txt           # 允许抓取；声明网站与公证员 sitemap
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

### 公证员名单查验

查验界面是官网内的独立页面：`/verify/` 渲染中文，`/en/verify/` 渲染英文，
并共同使用同域名下的只读 API。Railway 服务启动时下载加州州务卿 ZIP，在内存中解析及建立索引，
之后每天太平洋时间上午 7:00 刷新；若定时刷新失败，会继续保留上一份已验证的数据。

本地同时启动 API 和 Astro：

```bash
npm run notary:service  # http://127.0.0.1:8787
npm run dev             # http://localhost:4321
```

Railway 使用仓库根目录部署即可，`npm start` 会同时提供 Astro 页面、SSR 路由和名单 API，
并监听 Railway 注入的 `PORT`；健康检查路径为 `/health`。

API 不保存街道地址，也不需要数据库。测试及基准命令：

```bash
npm run test:notary
npm run notary:benchmark
```

### 文章与搜索发现

文章仅保留中文，使用 `/articles/` 与一份 sitemap；英文文章旧址返回 410。
写作约定见 [文章 README](src/content/articles/README.md)。
`npm run check:articles` 检查引用、图片、链接、canonical 及英文内容已移除。
公证员详情页和 sitemap 试点的完整说明见 [搜索发现文档](reports/notary-discovery.md)。

## 域名

| 域名 | 用途 |
|------|------|
| `www.notaryzhou.com` | Railway 主站及规范域名 |
| `notaryzhou.com` | 转发 → `www` |
| `notaryzhou.co` / `notaryzhou.online` | 转发 → `.com` |

## 待办

- [ ] 在线预约：Booking 区目前只有邮箱占位。方案为自建（Google Calendar 查忙闲/写事件 + Google Maps 算车程 + Stripe 收款），不使用 Calendly / Cal.com；交互原型见 `public/mockups/booking.html`
- [ ] NNA 认证、E&O 保险（`config.ts` 中仍为 `Pending`）
- [ ] Google Business Profile

保留所有权利。

## Google Analytics

Production page statistics use GA4 Measurement ID `G-NSPEQT81PG` (property
`552951052`, website stream `15726721936`). The shared layout includes
`src/components/GoogleAnalytics.astro` on non-draft, indexable production pages.
It only initializes on `www.notaryzhou.com`, removes URL/referrer query strings
and fragments, and disables advertising signals. Enhanced measurement is off
in the stream; no lookup or contact-form event parameters are collected.

Keep a single `gtag` config call: it sends the initial `page_view` automatically.
Do not add a second GTM/GA tag or manual page view. Preview pages remain excluded.
Configuration and deployment evidence: `reports/google-setup-status.md`.

The explicitly marked homepage email links send `contact_email_click`, with
only `contact_method=email` and an allowlisted `contact_placement=booking|hero`.
This measures an inquiry click, not an email sent, a confirmed lead, or a booking.
Privacy/correction links are excluded; email addresses, link contents, and
message contents are never event parameters. Run `npm run test:analytics` to
check redaction, duplicate initialization, and event boundaries.

Privacy notices are available at `/privacy/` (Chinese) and `/en/privacy/`
(English), linked from both the main footer and public-record footer. They
describe the actual Analytics, lookup, email, map, and font integrations.
