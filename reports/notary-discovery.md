# 公证员详情页与 SEO

`/en/notaries/{commissionNumber}/` 使用同一份每日更新的官方名单按需渲染，
通过 Node adapter locals 共享内存索引，不逐条生成 HTML 文件，也不额外创建数据库。
查验结果姓名链接到详情页；详情页输出 Person / WebPage / BreadcrumbList、独立 metadata、
canonical 和同名／相近姓名／同城记录链接。不存在的编号返回 404；数据未就绪返回 503。

robots.txt 只声明总索引 `/sitemap-index.xml`，总索引直接引用四个 URL 集合：

- `/en/notaries/sitemap.xml`：首批 100 条公证员记录，每条 priority 为 0.0。
- `/articles/sitemap.xml`：中文文章、目录与海牙认证主题页。
- `/en/articles/sitemap.xml`：英文译文、目录与海牙认证主题页。两者包含文章真实更新时间与封面图。
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
