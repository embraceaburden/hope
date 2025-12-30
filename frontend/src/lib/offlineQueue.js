const DB_NAME = 'forge-offline-queue';
const STORE_NAME = 'encapsulations';
const DB_VERSION = 1;

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const runTransaction = async (mode, handler) => {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = handler(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
};

const normalizeFile = async (file) => ({
  name: file.name,
  type: file.type,
  size: file.size,
  blob: file
});

const createJobId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const enqueueEncapsulationJob = async ({ targetFiles, carrierImage, options }) => {
  const record = {
    id: createJobId(),
    createdAt: new Date().toISOString(),
    targetFiles: await Promise.all(targetFiles.map(normalizeFile)),
    carrierImage: carrierImage ? await normalizeFile(carrierImage) : null,
    options: options || {}
  };

  await runTransaction('readwrite', (store) => store.add(record));
  return record;
};

export const getQueuedEncapsulationJobs = async () =>
  runTransaction('readonly', (store) =>
    new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    })
  );

export const removeQueuedEncapsulationJob = async (jobId) =>
  runTransaction('readwrite', (store) => store.delete(jobId));

export const getQueuedEncapsulationCount = async () => {
  const jobs = await getQueuedEncapsulationJobs();
  return jobs.length;
};

export const rebuildFile = (fileRecord) =>
  new File([fileRecord.blob], fileRecord.name, { type: fileRecord.type });
