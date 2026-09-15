# Apostille guide covers

Original, deterministic bilingual covers for the three apostille guides. Source SVGs and derived progressive JPEGs share a basename; article frontmatter uses the JPEGs for broad social-card support. The diagram is a preparation sequence, not a legal certificate or promise of acceptance.

```
apostille-guides/
├── apostille-for-china-{zh,en}.{svg,jpg}
├── birth-certificate-apostille-{zh,en}.{svg,jpg}
├── marriage-certificate-apostille-{zh,en}.{svg,jpg}
├── manifest.json
└── README.md
```

All covers are 1200 × 630, with local-font text in the corresponding article language. SVG sources contain translated accessible names and descriptions. The JPEGs are rasterized from those sources with Sharp. No external fonts, logos, personal records or generated legal seals are used.

The guides' sections are short procedural explanations. Their tables and numbered instructions carry the necessary distinctions, so additional section illustrations would repeat the prose. Each cover shows the document-routing sequence. See `manifest.json` for titles and purpose.
