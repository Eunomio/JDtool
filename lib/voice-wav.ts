export function encodeVoiceWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const source = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { source.set(chunk, offset); offset += chunk.length; }
  const rate = 16000; const count = Math.floor(length * rate / sampleRate); const buffer = new ArrayBuffer(44 + count * 2); const view = new DataView(buffer);
  const word = (at: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) { const start = Math.floor(i * sampleRate / rate); const end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * sampleRate / rate))); let value = 0; for (let j = start; j < end; j++) value += source[j]; value = Math.max(-1, Math.min(1, value / (end - start))); view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true); }
  return buffer;
}
