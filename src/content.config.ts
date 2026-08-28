import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(['basics', 'china-use', 'family', 'pitfalls', 'real-estate', 'estate']),
    /** 对应 WRITING_PLAN.md 中的题目编号 */
    topicId: z.number(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
