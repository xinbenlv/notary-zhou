/**
 * 把文章末尾的「参考来源」整节包进 <details>，默认折叠。
 *
 * 构建期完成，产出仍是静态 HTML：折叠内容依然在文档里，搜索引擎照常索引，
 * 只是首屏不占版面。
 *
 * 注意：正文的引用链接（#ref-xxx）指向的条目就在这个折叠区里，
 * 因此文章页另有一小段脚本负责在 hash 命中时自动展开，否则跳转会落空。
 */

const textOf = (node) =>
  node.type === 'text'
    ? node.value
    : (node.children ?? []).map(textOf).join('');

export default function rehypeCollapsibleReferences(options = {}) {
  const headingText = options.heading ?? '参考来源';
  const label = options.label ?? '参考来源与查证记录';

  return (tree) => {
    const children = tree.children;
    const start = children.findIndex(
      (n) =>
        n.type === 'element' &&
        n.tagName === 'h2' &&
        textOf(n).trim() === headingText
    );
    if (start === -1) return;

    // 该节延伸到下一个 h2 或文末
    let end = children.length;
    for (let i = start + 1; i < children.length; i++) {
      const n = children[i];
      if (n.type === 'element' && n.tagName === 'h2') {
        end = i;
        break;
      }
    }

    const body = children.slice(start + 1, end);

    // 数一下条目数，放进摘要里，让读者展开前就知道分量
    let count = 0;
    const countItems = (node) => {
      if (node.type === 'element') {
        if (node.tagName === 'li') count++;
        (node.children ?? []).forEach(countItems);
      }
    };
    body.forEach(countItems);

    const el = (tagName, properties, kids) => ({
      type: 'element',
      tagName,
      properties,
      children: kids,
    });

    const details = el('details', { className: ['references'] }, [
      el('summary', { className: ['references-summary'] }, [
        el('span', { className: ['references-label'] }, [
          { type: 'text', value: label },
        ]),
        ...(count
          ? [
              el('span', { className: ['references-count'] }, [
                { type: 'text', value: `${count} 条` },
              ]),
            ]
          : []),
      ]),
      el('div', { className: ['references-body'] }, body),
    ]);

    children.splice(start, end - start, details);
  };
}
