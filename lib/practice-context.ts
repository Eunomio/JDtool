export function practiceSources<T extends { text: string }>(job: { title: string; direction?: string; requirements?: { text: string }[]; responsibilities?: { text: string }[] }, sources: T[], budget = 8000): T[] {
  if (!sources.length) return [];
  const terms = new Set((`${job.title} ${job.direction || ''} ${(job.responsibilities || []).map(item => item.text).join(' ')} ${(job.requirements || []).map(item => item.text).join(' ')}`.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}|[\u4e00-\u9fff]{2}/g) || []));
  const perSource = Math.min(2400, Math.floor(budget / sources.length));
  return sources.map(source => {
    if (source.text.length <= perSource) return source;
    const chunks = (source.text.match(/[\s\S]{1,450}/g) || []).map((text, index) => ({ text, index, score: [...terms].reduce((sum, term) => sum + (text.toLowerCase().includes(term) ? 1 : 0), index === 0 ? 1 : 0) }));
    const picked: typeof chunks = []; let size = 0;
    for (const chunk of [...chunks].sort((a, b) => b.score - a.score || a.index - b.index)) {
      if (size >= perSource) break;
      const text = chunk.text.slice(0, perSource - size); picked.push({ ...chunk, text }); size += text.length + 1;
    }
    return { ...source, text: picked.sort((a, b) => a.index - b.index).map(chunk => chunk.text).join('\n') };
  });
}
