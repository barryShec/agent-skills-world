const STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "into", "after", "before",
  "about", "what", "when", "where", "which", "their", "they", "have", "your", "will",
  "should", "would", "could", "there", "here", "than", "then", "because", "only", "also",
  "just", "some", "more", "less", "very", "true", "false", "skill", "skills", "query",
  "这个", "那个", "如何", "什么", "我们", "你们", "他们", "如果", "一个", "不是", "就是", "可以",
  "需要", "然后", "因为", "所以", "以及", "不要", "还是", "已经", "继续", "完整", "实现", "名人",
  "目录", "加载", "渐进式"
]);

export const UNCERTAINTY_MARKERS = [
  "not sure",
  "uncertain",
  "i don't know",
  "don't know",
  "不确定",
  "不知道",
  "我不确定",
] as const;

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z][a-z-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  return matches.filter((token) => !STOPWORDS.has(token));
}

export function topTopics(texts: Iterable<string>, limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

