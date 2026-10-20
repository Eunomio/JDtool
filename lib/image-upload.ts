export type UploadImage = { name: string; dataUrl: string };

export async function prepareImage(file: File): Promise<UploadImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择PNG、JPG或WebP截图。');
  if (file.size > 15_000_000) throw new Error('单张截图请小于15MB。');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法读取截图，请重新选择。');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    if (dataUrl.length > 3_300_000) throw new Error('截图内容较大，请拆分或裁剪岗位部分后上传。');
    return { name: file.name || '粘贴的截图.jpg', dataUrl };
  } finally { bitmap.close(); }
}
