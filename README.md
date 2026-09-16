# Notary Zhou

George (GJ) Zhou的双语公证服务官网，服务湾区 Santa Clara / San Mateo / Alameda 三县。
已上线：[notaryzhou.com](https://notaryzhou.com)（Commission #2557299）。

项目日志见 [MEMORY.md](MEMORY.md)。

![中文跨境文件指南](docs/assets/global-guides-mobile.png)

提供普通话上门公证说明、公证员查验，以及附官方来源的中文文件指南。
界面支持中英文；FAQ、指南和文章的标题、摘要与正文仅提供中文。
阅读时可切换界面语言并留在当前文章，见 [发布说明](reports/bilingual-interface-chinese-articles.md)。

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
`?ui=en` 选择英文界面，不改变文章内容或规范网址。
写作约定见 [文章 README](src/content/articles/README.md)。
`npm run check:articles` 检查引用、图片、链接、canonical 及英文内容已移除。
查验页含三条记录直达链接。详情页与 sitemap 见 [搜索发现文档](reports/notary-discovery.md)。

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

### 预授权、到期与巡检

收款用**预授权**：结账时只冻结，公证完成后再按实际金额扣（`capture_method=manual`）。
卡的授权**正好 7 天**（实测 `capture_before` = 创建后 7.0000 天），`MAX_ADVANCE_DAYS=7`
与 `MIN_NOTICE_HOURS=48` 都是从这个数推出来的，不是排期口味。

**只收银行卡，靠的是 payment method configuration，不是 `payment_method_types`。**
只写 `payment_method_types: ['card']` 挡不住 Link：会话接口回报 `["card"]`，
结账页却照样渲染 `link_instant_debit` 与 `link_klarna`（前者还带"返现 US$5"的角标）。
Stripe 文档把这些算作 card 的一部分——"card ... supported through many networks,
card brands, and select Link funding sources"。而银行扣款不支持预授权，
`us_bank_account` 配 `capture_method=manual` 会被直接拒绝，7 天授权的前提就不成立了。
所以用一个只开 card 的配置，把 ID 放在 `STRIPE_PAYMENT_METHOD_CONFIGURATION`：

| 变量 | 说明 |
|------|------|
| `STRIPE_PAYMENT_METHOD_CONFIGURATION` | `pmc_...`，配置里只开 card，其余全关。**不设**会退回旧写法并打警告，Link 的银行/Klarna 通道会重新出现 |

换 Stripe 账号时要在新账号里重建这个配置——它不是代码，跟着账号走。

**`expired` 是两种情况，靠 `payment_intent_id` 区分：**

| 情形 | `payment_intent_id` | `cancel_reason` | 损失 |
|------|--------------------|-----------------|------|
| 结账没完成 / 客户按了返回 | `NULL` | `checkout_expired`、`customer_abandoned` | 无，什么都没发生 |
| 付了钱、授权到期 | 非空 | `authorization_expired:*` | **一笔该收的钱没收到** |

`payment_intent.canceled` 这一个事件同时承载「有人主动取消」和「授权到期自动释放」，
判定在 `src/lib/booking/lifecycle.ts`，由 `tests/lifecycle.test.mjs` 守住。

**巡检**：`POST /api/admin/watch`（只认 `x-admin-token` 请求头）查出快到期的授权、
已到期没收到的钱、卡在 `held` 的单、没处理成功的 webhook，并顺手清掉过期的 `slot_holds`。
`.github/workflows/booking-watch.yml` 每 6 小时打一次，`ok=false` 就让工作流失败——
仓库里没有邮件服务，借 GitHub 的失败通知把人叫醒就够了。需要在仓库 Secrets 配
`NOTARY_ADMIN_TOKEN`（与线上 `ADMIN_TOKEN` 相同）。

> 调这个接口必须显式带 `Content-Type: application/json`。Astro 默认开着 CSRF origin 检查，
> 没有同源 Origin 的表单类 POST 会被挡成 403 `Cross-site POST form submissions are forbidden`。

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
