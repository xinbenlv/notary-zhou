# Notary Zhou 🔏

周国锦（George Zhou）的双语公证服务业务官网，服务旧金山湾区。

🌐 **线上地址**：[notaryzhou.com](https://notaryzhou.com)（密码保护预览中）

## 技术栈

- **[Astro](https://astro.build)** — 静态站点生成器，Islands 架构
- **原生 CSS** — CSS 自定义属性设计系统（无 Tailwind）
- **[Vercel](https://vercel.com)** — 托管 & CDN
- **[Namefi](https://namefi.io)** — 域名 DNS 管理（通过 API）

## 功能特性

- 🌏 全站中英双语排版
- 📱 完全响应式（手机、平板、桌面）
- 🔒 密码预览模式（Commission 尚未下发）
- 🏷️ 草稿模式 + 合规性提示横幅
- 🔍 SEO 基础：JSON-LD LocalBusiness 结构化数据、sitemap、meta 标签、og:image
- 📋 配置集中化（`src/config.ts`）— 改一个文件即可从草稿切到正式上线

## 项目结构

```
src/
├── config.ts              # 全站配置 & 占位数据
├── layouts/
│   └── Layout.astro       # 基础布局（head、横幅、水印）
├── pages/
│   └── index.astro        # 落地页
├── components/
│   ├── Navbar.astro
│   ├── Hero.astro
│   ├── Services.astro
│   ├── Booking.astro      # "即将开放" 占位
│   ├── Footer.astro
│   ├── DraftBanner.astro
│   ├── DraftWatermark.astro
│   └── PasswordGate.astro # 预览密码门
├── styles/
│   └── global.css         # 设计系统（CSS 自定义属性）
public/
├── images/
│   └── george-zhou.jpg
└── robots.txt             # 禁止爬取（草稿阶段）
```

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 域名配置

| 域名 | 用途 |
|------|------|
| `notaryzhou.com` | 主站（Vercel） |
| `notaryzhou.co` | 转发 → .com |
| `notaryzhou.online` | 转发 → .com |
| `www.notaryzhou.com` | 转发 → .com |

## 正式上线清单

当 George 拿到加州公证人委任（Commission）后：

1. 修改 `src/config.ts`：
   - 设置 `isDraft: false`
   - 填入真实电话、邮箱、Commission Number
   - 清空 `previewPassword`
2. 修改 `public/robots.txt`，允许搜索引擎索引
3. 替换占位数据（NNA 认证、E&O 保险金额）
4. 接入预约系统（Calendly / Cal.com）
5. 创建 Google Business Profile
6. 部署：`git push` → Vercel 自动部署

## 许可证

私有 — 保留所有权利。
