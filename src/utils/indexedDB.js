import { openDB } from 'idb'

const DB_NAME = 'BookGeneratorDB'
const DB_VERSION = 1

async function getDB() {
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('extractedPages')) {
        db.createObjectStore('extractedPages')
      }
      if (!db.objectStoreNames.contains('generatedImages')) {
        db.createObjectStore('generatedImages')
      }
    }
  })
}

export async function saveToIndexedDB(storeName, data) {
  const db = await getDB()
  await db.put(storeName, data, 'current')
}

export async function loadFromIndexedDB(storeName) {
  const db = await getDB()
  const data = await db.get(storeName, 'current')
  return data || null
}

export async function clearIndexedDB(storeName) {
  const db = await getDB()
  await db.delete(storeName, 'current')
}


