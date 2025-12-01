import * as pdfjsLib from 'pdfjs-dist'
import { saveToIndexedDB } from './indexedDB'

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

export async function extractPagesFromPDF(file, onProgress) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages

    const extractedPages = []

    // Extract each page as high-res image
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum)

      // Render at high resolution (scale 2.0)
      const viewport = page.getViewport({ scale: 2.0 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height

      const context = canvas.getContext('2d')
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise

      // Convert to base64 JPEG
      const base64 = canvas.toDataURL('image/jpeg', 0.95)
        .replace(/^data:image\/jpeg;base64,/, '')

      // Store
      extractedPages.push({
        pageNum,
        base64,
        dimensions: {
          width: viewport.width,
          height: viewport.height,
          aspectRatio: viewport.width / viewport.height
        }
      })

      // Update progress
      const progress = Math.round((pageNum / totalPages) * 100)
      onProgress(progress, `Extracting page ${pageNum} of ${totalPages}...`)
    }

    // Process and store
    return await processAndStorePages(extractedPages)
  } catch (error) {
    console.error('PDF extraction error:', error)
    throw error
  }
}

async function processAndStorePages(extractedPages) {
  const namedPages = {}

  // Page 1 = Cover
  if (extractedPages[0]) {
    namedPages['Cover Page'] = extractedPages[0]
  }

  // Remaining pages = left/right pairs
  let spreadIndex = 1
  for (let i = 1; i < extractedPages.length; i += 2) {
    if (extractedPages[i]) {
      namedPages[`${spreadIndex}-left`] = extractedPages[i]
    }
    if (extractedPages[i + 1]) {
      namedPages[`${spreadIndex}-right`] = extractedPages[i + 1]
    }
    spreadIndex++
  }

  // Store in IndexedDB
  await saveToIndexedDB('extractedPages', namedPages)

  return namedPages
}


