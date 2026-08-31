# notaryzhou.com 中文公证文章 · 作业指南

你要为湾区华人公证服务网站写一篇中文科普文章。仓库根目录：`/Users/zzn/ws/xinbenlv/notary-zhou`（所有命令都在此目录下运行）。

## 第一步：先读这三样

1. **`WRITING_PLAN.md`** — 找到你负责的题目编号，读它的角度说明、英文 Glossary、权威来源清单。
2. **`src/content/articles/us-notary-vs-china-notary.md`** — 已通过审阅的样板，你的成品要与它同一水准、同一结构、同一语气。
3. **`src/config.ts`** — 站点事实（服务区域、法定收费、委任信息），文中涉及时必须与之一致。

## 硬性质量标准（不可打折）

### 引用：必须逐条打开原文核实

**绝对禁止**凭记忆、凭搜索摘要、凭"应该是这样"写引用。每一条都要：

1. 用 `WebFetch` 真正打开页面，读到支持该说法的原文。
2. 确认引用的字句**逐字出现**在页面上。`#:~:text=` 片段必须能真实高亮——用页面上实际存在的文字，不要为了让片段"看起来对"而编造措辞。
3. 确认**匿名可访问**（非付费墙、非登录墙）。若 WebFetch 返回 403，先试 `WebSearch` 找同一事实的其他官方来源；仍不可得则**删掉该说法**，不要保留无法核实的引用。
4. **写进文章的链接必须是你亲手打开过的那一个**，不要在交付报告里另行转述或简化路径。已发生两次：领馆页漏了 `/qianzhen/`、USCIS 页漏了 `/avoid-scams/`，复核者按报告里的路径去抓，三条检索路径全部失败，几乎误判"无法核实"。
5. 取存档快照：`curl -s "https://archive.org/wayback/available?url=<URL编码后的地址>"`。有快照就把日期做成指向快照的链接；没有就写纯文本日期（不要编造快照 URL）。

**来源只收**：政府官网（美国联邦/加州/县、中国部委及使领馆）、法律原文（leginfo、eCFR、国家法律法规数据库）、政府间组织（HCCH）。不收商业媒体、行业协会、博客、任何付费墙内容。

### 引用格式：两跳链

正文里链接**最短的关键短语**（不是整句）到本地参考条目，参考条目再链到原始出处：

```markdown
按[《加州政府法典》第 8205 条](#ref-gov-8205)，公证员的本职是……

## 参考来源

以下来源均于引用当日打开核对；条目中的"查证于"日期为实际核对日期，可点击的日期指向互联网档案馆（Wayback Machine）当时的存档快照。

- <span id="ref-gov-8205"></span>加州《政府法典》第 8205 条（公证员职责）— [leginfo 法条原文](https://leginfo.legislature.ca.gov/faces/...#:~:text=To%20take%20the%20acknowledgment)。支持句："To take the acknowledgment or proof of…" — 查证于 [2026-08-28](https://web.archive.org/web/2026.../...)
```

规则：每个 `#ref-xxx` 内链都要有对应 `<span id>`；每个参考条目都要至少被正文引用一次（校验脚本会检查双向闭合）。锚点 id 用小写英文短横线。

### 写作

- 目标读者：湾区华人，多数是第一次接触美国公证，可能刚移民、英文不便。
- 语气：像一位专业、有耐心的从业者在解释，不是律所公文，也不是营销文案。
- 开头用真实场景切入（样板文用的是"国内亲友让你找公证处"），不要用"在当今社会…"这类空话。
- 篇幅约 2500–4000 字。分 4–6 个 `##` 小节。
- 术语首次出现给中英对照，如"签名确认（acknowledgment）"。
- 结尾给可操作的步骤，并在恰当处指出"先问接收单位"这类能帮读者省事的忠告。
- **不要提供法律意见**，不要断言某份文件一定会被某机构接受。
- 中文加粗可以正常写 `**要点。**说明`（已装 remark-cjk-friendly 插件，不必把标点移出）。
- 避免 AI 腔：不要"值得注意的是""总而言之""在当今…"，不要每段都三点排比，不要堆砌"非常""极其"。

## 第二步：写文件

路径：`src/content/articles/<slug>.md`（slug 由派发任务时指定）

```yaml
---
title: 文章标题（不带书名号）
description: 一句话说明，100-160 字，会用于 SEO 描述与列表页摘要
pubDate: 2026-08-28
category: basics | china-use | family | pitfalls | real-estate | estate
topicId: <WRITING_PLAN 里的编号>
cover: /images/articles/<slug>/og.jpg
coverAlt: 封面图的文字描述
---
```

正文内每个 `##` 小节后紧跟一张配图：

```markdown
## 小节标题

![描述这张图与文章概念的关系，不要写"图片："](/images/articles/<slug>/01-short-name.jpg)
```

## 第三步：生成配图

需要 1 张封面背景 + 3 张章节图（对应前三个主要小节）。

**1) 写 payload**（`<slug>` 替换成你的 slug）：

```bash
mkdir -p /tmp/img/<slug>
```

用 Python 写 4 个 JSON 文件到 `/tmp/img/<slug>/`：`cover-bg.json`、`01-<name>.json`、`02-<name>.json`、`03-<name>.json`。每个的结构：

```json
{"contents":[{"parts":[{"text":"<PROMPT>"}]}],
 "generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"3:2"}}}
```

封面背景用 `"aspectRatio":"16:9"`，章节图用 `"3:2"`。

**统一风格前缀**（每个 prompt 都要带上）：

```
Quiet editorial illustration, flat vector-inspired style with subtle paper grain.
Warm cream background #FFF8F0, deep forest-green ink #1B3B32, restrained accents in terracotta #D88465 and warm yellow #F0B83A.
The composition fills the frame edge to edge - no border, no frame, no matte, no margin on any side; the background texture runs off all four edges.
The top 12% and bottom 12% are bleed area holding only background or scene, safe to crop.
Mood: thoughtful, precise, calm, not glossy. No photorealism, no logos, no watermarks, no signatures.
```

**封面背景**追加：

```
Background art for an article cover card. A calm warm-cream field with subtle paper texture filling the whole frame.
On the RIGHT THIRD ONLY: <一个与文章主题相关的小静物场景>.
The LEFT 60% of the frame must stay nearly empty calm cream space with only faint paper texture - reserved for a headline added later. Nothing may intrude into that left area.
Absolutely no letters, no words, no characters, no typography anywhere in the image.
```

**章节图**：画具体的场景/物件/流程，不要抽象光效或"人对着笔记本电脑"。图中**不要出现文字**（个别必要的英文短标签除外，且必须拼写正确）。中国相关元素用抽象印章图形，不要试图画汉字（模型会画错）。

**2) 调用 Gemini**（key 通过 Infisical 注入，切勿打印 key）：

```bash
cd /Users/zzn/dotfiles && ~/dotfiles/tools/infisical/with-secret.sh --match '^GEMINI_API_KEY$' --as GEMINI_API_KEY -- sh -c '
D=/tmp/img/<slug>          # ← 在 sh -c 内部定义，不要用外部变量：外层单引号会让 $SLUG 展开为空
for n in cover-bg 01-<name> 02-<name> 03-<name>; do
  (curl -s --max-time 180 "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=$GEMINI_API_KEY" \
    -H "Content-Type: application/json" -d @"$D/$n.json" > "$D/$n.resp.json") &
done
wait
for n in cover-bg 01-<name> 02-<name> 03-<name>; do
  python3 -c "
import json,base64,sys,pathlib
d=pathlib.Path(sys.argv[2]); n=sys.argv[1]
try:
    j=json.load(open(d/f'{n}.resp.json'))
    data=next(p['inlineData']['data'] for p in j['candidates'][0]['content']['parts'] if 'inlineData' in p)
    (d/f'{n}.png').write_bytes(base64.b64decode(data)); print(' ',n,'OK')
except Exception as e: print(' ',n,'FAIL',str(e)[:120])
" "$n" "$D"
done'
```

**3) 加工成成品**（务必用这个脚本，保证 29 篇视觉统一）：

```bash
cd /Users/zzn/ws/xinbenlv/notary-zhou
python3 scripts/build_article_images.py \
  --slug <slug> --src /tmp/img/<slug> \
  --kicker "公证知识 · <分类中文名>" \
  --title "标题上半|标题下半" \
  --subtitle "一句副标题"
```

`--title` 用 `|` 分行，两行为宜；字号与副标题会自动适配，插画位置也会自动探测避让，模型留下的近乎纯色边带也会自动裁掉——**不必再为「上下有浅色横带」重新生成整张图**，先跑一次脚本看成品再判断。分类中文名对照：公证基础 / 文件回国使用 / 家庭与养老 / 别找错门 / 房产与贷款 / 信托与遗产。

**4) 目检每一张**（强制）

用 `Read` 工具逐张打开 `public/images/articles/<slug>/*.jpg` 亲眼看，确认：

- 画面四边出血，没有白边、没有相框感；
- 封面标题清晰、无错字、**没有被插画压住**；
- 图中若有英文标签，拼写正确；
- 没有生成汉字乱码、没有奇怪的人体畸形；
- **图中不要出现汉字**：模型画出的中文几乎必是语义不通的伪字，中文读者一眼可辨。需要表现中文文件时，用抽象横线占位加一枚红色方印，切勿尝试写字。

不合格就改 prompt 重新生成那一张再看。**同一张最多重试 3 次**；3 次仍不过就保留最好的一版，并在报告里说明是哪张、哪项不过关。

## 第四步：自检

```bash
cd /Users/zzn/ws/xinbenlv/notary-zhou && node scripts/check-articles.mjs
```

若提示要先构建，说明当前 `dist/` 是旧的——**不要自己跑 `npm run build`**（多个 agent 并行构建会互相覆盖）。你只需确保自己的 md 与图片文件就位；主控会统一构建校验。

## 禁止事项

- 不要 `git commit` / `git add`（主控统一提交）。
- 不要跑 `npm run build` / `npm run dev`。
- 不要改动 `src/` 下除你自己那篇 `.md` 以外的任何文件。
- 不要改 `WRITING_PLAN.md`。
- 不要打印或写入任何 API key。

## 交付报告

完成后用中文简要报告：

1. 文章路径与字数；
2. 引用了几条来源、**逐条列出你实际打开核实的 URL** 与对应支持句是否核对通过、有无因无法核实而删掉的说法；
3. 4 张图的目检结论（有无重试、为什么）；
4. 任何你拿不准、需要人工复核的地方（尤其是法律细节、时效性信息）。
