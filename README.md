# Notary Zhou

周国锦（George Zhou）的双语公证服务官网，服务湾区 Santa Clara / San Mateo / Alameda 三县。
已上线：[notaryzhou.com](https://notaryzhou.com)（加州公证 Commission #2557299，Santa Clara County，2030-05-30 到期）。

项目日志见 [MEMORY.md](MEMORY.md)。

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

### 公证员详情页与 SEO

`/en/notaries/{commissionNumber}/` 使用同一份每日更新的官方名单按需渲染，
通过 Node adapter locals 共享内存索引，不逐条生成 HTML 文件，也不额外创建数据库。
查验结果姓名链接到详情页；详情页输出 Person / WebPage / BreadcrumbList、独立 metadata、
canonical 和同名／相近姓名／同城记录链接。不存在的编号返回 404；数据未就绪返回 503。

robots.txt 只声明总索引 `/sitemap-index.xml`，总索引直接引用三个 URL 集合：

- `/en/notaries/sitemap.xml`：首批 100 条公证员记录，每条 priority 为 0.0。
- `/articles/sitemap.xml`：已发布文章与文章目录，包含文章更新时间和封面图。
- `/sitemap-0.xml`：其余官网页面，由 Astro 自动生成。

公证员首批名单固定在 `src/data/notary-sitemap-pilot.json`，入选理由见
`reports/notary-sitemap-pilot.csv`。它是经验筛选的试点，不是搜索量或资质质量排名。
名单来源为官方文件；优先姓名能与业务名称对应的公证业务记录，限制同城／同县占比，
并包含本站所有者。`node scripts/select-notary-pilot.mjs` 可重新生成供审核的名单。
定时刷新不会自行更换首批人选；过期或退出当前名单的记录从 sitemap 移除，可能使条数低于 100。
不将每日下载时间冒充为每条记录的 lastmod。

旧 `/notary-sitemap.xml` 301 到新路径，旧全量分页 sitemap 返回 410。
其他人物页仍可查询和通过内链访问，未使用 noindex 或 robots.txt 阻止它们被收录；
sitemap 是发现建议，不能保证 Google 只收录这 100 人或按指定顺序收录。
预览路由仍 noindex，不加入 sitemap。

地图仅表示登记城市。已核对的四个城市有嵌入地图，其他城市提供 Google Maps 城市查询链接；
不在线批量请求地理编码、不公开街道地址、不推断服务范围。
生产方式本地验收：`npm run build` 后 `PORT=8081 npm start`。

### 在线预约

预约页 `/book/`（中文）与 `/en/book/`（英文）是按需渲染的交易流程，`noindex` 且不进 sitemap。
四步：文件与签署人 → 地点 → 日期与时段 → 确认支付。界面用 Vue（仅这一页加载运行时），
其余页面仍是纯 Astro。交互原型 `public/mockups/booking.html` 已由正式页面取代，仅作留档。

**金额一律由服务端算。** 页面第一步显示的公证费直接复用 `src/lib/booking/pricing.ts` 的纯函数，
所以前后端不会各写一套规则；`/api/quote` 仍会整体重算一遍，不采信前端传来的任何价格。
更关键的是**计费规则不从请求里读**：请求只带 `typeKey`，规则由 `src/lib/booking/doctypes.ts`
查出来——否则把一份地契标成 `rule: 'free'` 就能把公证费刷成 $0。`npm run test:booking` 守这条线。

接口（均为 POST，`prerender = false`）：

| 路径 | 用途 |
|------|------|
| `/api/route-preview` | 第二步：核验 placeId、返回畅通车程与折线。只收 Places 选中的 placeId，不接受自由文本地址 |
| `/api/quote` | 第三步：一次返回该日各时段的可用性与价格，来源是日历忙闲、数据库占用窗口、Google 对每个时段的路况预测 |

浏览器密钥 `PUBLIC_GOOGLE_MAPS_BROWSER_KEY` 按 referrer 限制，只开了 Maps JS 与 Places；
Routes 只在服务端用 `GOOGLE_ROUTES_SERVER_KEY` 调用。本机若用 `npm start` 起在别的端口，
Places 会因 referrer 不在白名单而报 403——这是密钥在正常工作，不是页面坏了。

## 域名

| 域名 | 用途 |
|------|------|
| `www.notaryzhou.com` | Railway 主站及规范域名 |
| `notaryzhou.com` | 转发 → `www` |
| `notaryzhou.co` / `notaryzhou.online` | 转发 → `.com` |

## 待办

- [ ] 在线预约：流程已建好（`/book/`、`/en/book/`），只差 Stripe 收款。首页 Booking 区与导航按钮仍指向邮箱占位，等支付打通后再改指过去
- [ ] NNA 认证、E&O 保险（`config.ts` 中仍为 `Pending`）
- [ ] Google Business Profile

私有项目，保留所有权利。

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
