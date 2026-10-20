'use client';
import { useRef, useState } from 'react';
import { database } from '../lib/database';
import { parseBackup, restoreBackup } from '../lib/backup';

export default function DataBackup({ refresh }: { refresh: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  async function exportData() {
    try {
      const data: Record<string, unknown> = { format: 'jdtool-backup', version: 2, exportedAt: new Date().toISOString() };
      await database.transaction('r', database.tables, async () => { for (const table of database.tables) data[table.name] = await table.toArray(); });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `求职准备备份-${new Date().toISOString().slice(0, 10)}.json`; link.style.display = 'none'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); setMessage('已导出。备份含个人资料，请妥善保存。');
    } catch { setMessage('导出未完成，请重试。'); }
  }
  async function importData(file: File) {
    try {
      if (file.size > 80_000_000) throw new Error('备份文件过大。');
      const data = parseBackup(JSON.parse(await file.text()));
      if (!window.confirm('导入会合并记录，同一编号将使用备份中的内容。继续吗？')) return;
      await restoreBackup(data);
      await refresh(); setMessage('备份已恢复。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入未完成。'); }
  }
  return <details className="backup-menu"><summary>资料备份</summary><div><button className="text-button" onClick={exportData}>导出备份</button><button className="text-button" onClick={() => input.current?.click()}>从备份恢复</button><input ref={input} className="sr-only" type="file" accept="application/json,.json" aria-label="选择备份文件" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = ''; }} />{message && <p role="status">{message}</p>}</div></details>;
}
