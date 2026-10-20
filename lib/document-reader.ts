import { api } from './client';

export async function readDocument(file: File): Promise<string> {
  if (file.size > 15_000_000) throw new Error('文件请小于15MB，可拆分后逐次导入。');
  const buffer = await file.arrayBuffer();
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import('mammoth');
    return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
  }
  if (/\.pdf$/i.test(file.name)) {
    const pdf = await import('pdfjs-dist');
    pdf.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const loading = pdf.getDocument({ data: buffer });
    const document = await loading.promise;
    try {
      if (document.numPages > 12) throw new Error('请将PDF拆为每份不超过12页后导入。');
      const pages: { text?: string; image?: { name: string; dataUrl: string } }[] = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const line = content.items.map((item) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('');
        if (line.replace(/\s/g, '').length >= 30) pages.push({ text: line });
        else {
          const viewport = page.getViewport({ scale: 1.8 });
          const canvas = window.document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          pages.push({ image: { name: `第${number}页`, dataUrl: canvas.toDataURL('image/jpeg', 0.82) } });
        }
      }
      const text: string[] = [];
      for (let index = 0; index < pages.length;) {
        if (pages[index].text) { text.push(pages[index].text!); index++; continue; }
        const images: { name: string; dataUrl: string }[] = [];
        while (index < pages.length && pages[index].image && images.length < 3) images.push(pages[index++].image!);
        const result = await api<{ text: string }>('/api/documents/read', { images });
        text.push(result.text);
      }
      const result = text.join('\n\n');
      if (!result.trim()) throw new Error('文件中没有识别到文字，请粘贴简历内容继续。');
      return result;
    } finally { await loading.destroy(); }
  }
  if (/\.(txt|md)$/i.test(file.name)) return new TextDecoder().decode(buffer);
  throw new Error('请选择DOCX、PDF或文本文件。');
}
