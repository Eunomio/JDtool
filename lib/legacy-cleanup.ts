// One-time cleanup of the two imports retired by the workspace owner.
export const retiredImportedJobIds = ['5e41443a-dff3-4408-ba13-dad45aad8ed5', 'f48fd5b2-22ce-458a-87b5-28d470f04fee'] as const;

export async function discardLegacyImports() {
  if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some(item => item.name === 'jdtool')) return;
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open('jdtool');
    request.onupgradeneeded = event => { if (event.oldVersion === 0) request.transaction?.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => request.error?.name === 'AbortError' ? resolve(null) : reject(request.error);
  });
  if (!db) return;
  try {
    const names = ['jobs', 'sources', 'recommendations', 'preparations', 'companies', 'comparisons', 'practice', 'tasks'].filter(name => db.objectStoreNames.contains(name));
    if (!names.length) return;
    const retired = new Set<string>(retiredImportedJobIds);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      for (const name of names) {
        const store = tx.objectStore(name);
        if (name === 'jobs') { for (const id of retired) store.delete(id); continue; }
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result; if (!cursor) return;
          const row = cursor.value;
          if (name === 'tasks' && Array.isArray(row.jobIds)) {
            const jobIds = row.jobIds.filter((id: string) => !retired.has(id));
            if (jobIds.length !== row.jobIds.length) { if (jobIds.length) cursor.update({ ...row, jobIds }); else cursor.delete(); }
          } else if (typeof row.jobId === 'string' && row.jobId.split('|').some((id: string) => retired.has(id))) cursor.delete();
          cursor.continue();
        };
      }
    });
  } finally { db.close(); }
}
