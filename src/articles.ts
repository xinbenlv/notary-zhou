/** Article category display metadata, shared by the listing and article pages. */
export const articleCategories = {
  basics: { label: '公证基础', order: 1 },
  'china-use': { label: '文件回国使用', order: 2 },
  family: { label: '家庭与养老', order: 3 },
  pitfalls: { label: '别找错门', order: 4 },
  'real-estate': { label: '房产与贷款', order: 5 },
  estate: { label: '信托与遗产', order: 6 },
} as const;

export type ArticleCategory = keyof typeof articleCategories;

export const formatDate = (d: Date) =>
  `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
