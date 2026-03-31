import { saveToIndexedDB, loadFromIndexedDB } from './indexedDB'

const REPLICATE_API_KEY = import.meta.env.VITE_REPLICATE_API_KEY
const REPLICATE_API_BASE_URL = 'https://api.replicate.com/v1'
const MAX_RETRIES = 3

// Check if error is permanent (should not retry)
// NOTE: 429 rate limits are retryable - don't treat them as permanent
function isPermanentError(error) {
  const message = error.message?.toLowerCase() || ''
  
  // 429 rate limits are NOT permanent - they should be retried
  if (message.includes('429') || message.includes('rate') || message.includes('resource_exhausted')) {
    return false
  }
  
  return message.includes('401') || 
         message.includes('403') || 
         message.includes('api key') ||
         message.includes('invalid') ||
         message.includes('not configured')
}

// Sleep helper for exponential backoff
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Use proxy in development (Vite) and production (Cloudflare Function) to avoid CORS
const REPLICATE_API_URL = import.meta.env.DEV
  ? '/replicate-api/v1'  // Use Vite proxy in development
  : '/api/replicate'     // Use Cloudflare Function in production

const MODEL = 'bytedance/seedance-1.5-pro'

// Prompts
const PROMPT_OPENING = `A photorealistic video of a physical printed book. The closed book rotates RIGHT 90 degrees, then opens naturally and lays flat on the table, revealing the interior page spread.

CRITICAL RULES:
1. The ONLY major motion is the physical book rotating and opening.
2. Illustrations may have very subtle, gentle movement but characters must keep their exact shape, proportions, and features. No morphing, no deformation.
3. All text must remain perfectly sharp, legible, and undistorted.
4. No human hands or objects touching the book.
5. Same lighting, camera angle, and environment throughout.`

const PROMPT_PAGE_FLIP = `A photorealistic video of an open book with ONE single page turning. The right page lifts and turns LEFT to reveal the next spread. The left page stays flat and stationary.

CRITICAL RULES:
1. Only ONE page turns — the right page lifts and turns left.
2. Illustrations may have very subtle, gentle movement but characters must keep their exact shape, proportions, and features. No morphing, no deformation.
3. All text must remain perfectly sharp, legible, and undistorted.
4. No human hands or objects in the scene.
5. Same lighting, camera angle, and environment throughout.
6. Do not add any additional pages, text, or images other than those in the first and last frames.`

// Helper function to convert data URL to blob URL for Replicate
function convertDataUrlToBlobUrl(dataUrl) {
  // Replicate accepts data URIs directly if < 256kb
  // For larger images, we might need to handle differently
  // For now, return the data URL - Replicate should handle it
  return dataUrl
}

// Cache for model version
let cachedModelVersion = null

async function getModelVersion() {
  if (cachedModelVersion) return cachedModelVersion

  const response = await fetch(`${REPLICATE_API_URL}/models/${MODEL}`, {
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch model: ${response.status} - ${errorText}`)
  }

  const modelData = await response.json()
  if (modelData.latest_version && modelData.latest_version.id) {
    cachedModelVersion = modelData.latest_version.id
    return cachedModelVersion
  }

  throw new Error('No latest version found for model')
}

// Create a prediction on Replicate
async function createPrediction(input) {
  if (!REPLICATE_API_KEY) {
    throw new Error('Replicate API key not configured. Please set VITE_REPLICATE_API_KEY in .env')
  }

  const version = await getModelVersion()

  const response = await fetch(`${REPLICATE_API_URL}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      version: version,
      input: input
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorJson
    try {
      errorJson = JSON.parse(errorText)
    } catch (e) {
      throw new Error(`Replicate API error: ${response.status} - ${errorText}`)
    }
    throw new Error(`Replicate API error: ${response.status} - ${JSON.stringify(errorJson)}`)
  }

  return await response.json()
}

// Poll for prediction completion
async function pollPrediction(predictionId, onProgress) {
  const maxAttempts = 180 // 15 minutes max (180 * 5s)
  let attempt = 0

  while (attempt < maxAttempts) {
    const response = await fetch(`${REPLICATE_API_URL}/predictions/${predictionId}`, {
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to poll prediction: ${response.status}`)
    }

    const prediction = await response.json()

    if (prediction.status === 'succeeded') {
      // Replicate output can be a string URL or array of URLs
      if (typeof prediction.output === 'string') {
        return prediction.output
      } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
        return prediction.output[0]
      } else if (prediction.output && prediction.output.url) {
        return prediction.output.url
      }
      throw new Error('Unexpected output format from Replicate API')
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Video generation ${prediction.status}: ${prediction.error || 'Unknown error'}`)
    }

    // Update progress if callback provided
    if (onProgress && prediction.logs) {
      onProgress(prediction.logs)
    }

    // Wait before next poll (3 seconds initially, then 5 after 30 seconds)
    const waitTime = attempt < 10 ? 3000 : 5000
    await new Promise(resolve => setTimeout(resolve, waitTime))
    attempt++
  }

  throw new Error('Video generation timeout after 15 minutes')
}

// Generate opening video (cover → spread 1)
export async function generateOpeningVideo(generatedImages, onProgress) {
  const coverImage = generatedImages['cover']
  const spread1Image = generatedImages['spread-1']

  if (!coverImage || !spread1Image) {
    throw new Error('Cover or spread 1 image not found')
  }

  // Convert images to format Replicate accepts
  const firstFrame = convertDataUrlToBlobUrl(coverImage.url)
  const lastFrame = convertDataUrlToBlobUrl(spread1Image.url)

  const input = {
    prompt: PROMPT_OPENING,
    image: firstFrame,
    last_frame_image: lastFrame,
    duration: 5,
    resolution: '1080p',
    aspect_ratio: '1:1',
    camera_fixed: true,
    generate_audio: false
  }

  // Create prediction
  const prediction = await createPrediction(input)

  // Poll for completion
  const progressCallback = (logs) => {
    if (onProgress) {
      onProgress(logs)
    }
  }

  const videoUrl = await pollPrediction(prediction.id, progressCallback)

  return {
    url: videoUrl,
    predictionId: prediction.id
  }
}

// Generate page flip video (spread N → spread N+1)
export async function generateFlipVideo(startSpread, endSpread, onProgress) {
  if (!startSpread || !endSpread) {
    throw new Error('Start or end spread image not found')
  }

  // Convert images to format Replicate accepts
  const firstFrame = convertDataUrlToBlobUrl(startSpread.url)
  const lastFrame = convertDataUrlToBlobUrl(endSpread.url)

  const input = {
    prompt: PROMPT_PAGE_FLIP,
    image: firstFrame,
    last_frame_image: lastFrame,
    duration: 5,
    resolution: '1080p',
    aspect_ratio: '1:1',
    camera_fixed: true,
    generate_audio: false
  }

  // Create prediction
  const prediction = await createPrediction(input)

  // Poll for completion
  const progressCallback = (logs) => {
    if (onProgress) {
      onProgress(logs)
    }
  }

  const videoUrl = await pollPrediction(prediction.id, progressCallback)

  return {
    url: videoUrl,
    predictionId: prediction.id
  }
}

// Generate opening video with auto-retry
export async function generateOpeningVideoWithRetry(generatedImages, onProgress, onRetry = null) {
  let lastError
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateOpeningVideo(generatedImages, onProgress)
    } catch (error) {
      lastError = error
      
      if (isPermanentError(error)) {
        console.error(`Permanent error, not retrying: ${error.message}`)
        throw error
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000
        console.log(`Opening video attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay/1000}s...`)
        
        if (onRetry) {
          onRetry(attempt, MAX_RETRIES)
        }
        
        await sleep(delay)
      }
    }
  }
  
  console.error(`All ${MAX_RETRIES} attempts failed for opening video`)
  throw lastError
}

// Generate flip video with auto-retry
export async function generateFlipVideoWithRetry(startSpread, endSpread, onProgress, onRetry = null) {
  let lastError
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateFlipVideo(startSpread, endSpread, onProgress)
    } catch (error) {
      lastError = error
      
      if (isPermanentError(error)) {
        console.error(`Permanent error, not retrying: ${error.message}`)
        throw error
      }
      
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000
        console.log(`Flip video attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay/1000}s...`)
        
        if (onRetry) {
          onRetry(attempt, MAX_RETRIES)
        }
        
        await sleep(delay)
      }
    }
  }
  
  console.error(`All ${MAX_RETRIES} attempts failed for flip video`)
  throw lastError
}

// Parallel batch size for video generation
const PARALLEL_BATCH_SIZE = 5

// Generate all videos (with parallel batches for flip videos)
// Skips videos that already exist in existingVideos
export async function generateAllVideos(generatedImages, onProgressUpdate, onVideoGenerated, existingVideos = {}) {
  const generatedVideos = { ...existingVideos }

  // Count actual spread keys (spread-1, spread-2, etc.)
  const spreadCount = Object.keys(generatedImages).filter(k => k.startsWith('spread-')).length
  // Total videos = 1 opening + (spreadCount - 1) flip videos
  const flipCount = spreadCount > 0 ? spreadCount - 1 : 0
  const totalVideos = 1 + flipCount

  // Count already completed videos
  const alreadyComplete = []
  if (existingVideos['opening']) alreadyComplete.push('opening')
  for (let i = 1; i <= flipCount; i++) {
    if (existingVideos[`spread-${i}-${i + 1}`]) alreadyComplete.push(`spread-${i}-${i + 1}`)
  }

  let currentProgress = {
    current: alreadyComplete.length,
    total: totalVideos,
    status: {}
  }

  // Initialize status — mark existing as complete, rest as pending
  currentProgress.status['opening'] = existingVideos['opening'] ? 'complete' : 'pending'
  for (let i = 1; i <= flipCount; i++) {
    const videoId = `spread-${i}-${i + 1}`
    currentProgress.status[videoId] = existingVideos[videoId] ? 'complete' : 'pending'
  }
  onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })

  // Step 1: Generate Opening Video (skip if already exists)
  if (!existingVideos['opening']) {
    try {
      currentProgress.status['opening'] = 'generating'
      onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })

      const result = await generateOpeningVideoWithRetry(
        generatedImages,
        (logs) => {
          // Could parse logs for detailed progress if needed
        },
        (attempt, max) => {
          currentProgress.status['opening'] = `retrying (${attempt}/${max})`
          onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })
        }
      )

      generatedVideos['opening'] = {
        url: result.url,
        filename: 'opening.mp4',
        downloadedAt: new Date().toISOString(),
        startFrame: 'cover',
        endFrame: 'spread-1',
        duration: 5,
        predictionId: result.predictionId
      }

      currentProgress.status['opening'] = 'complete'
      currentProgress.current += 1
      onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })
      await saveToIndexedDB('generatedVideos', generatedVideos)

      if (onVideoGenerated) {
        await onVideoGenerated('opening', result.url, generatedVideos['opening'])
      }
    } catch (error) {
      console.error('Opening video generation error:', error)
      currentProgress.status['opening'] = 'failed'
      onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })
      throw error
    }
  }

  // Step 2: Generate Flip Videos (in parallel batches of PARALLEL_BATCH_SIZE)
  const spreads = Object.keys(generatedImages)
    .filter(key => key.startsWith('spread-'))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[1])
      const numB = parseInt(b.split('-')[1])
      return numA - numB
    })

  // Build array of flip video tasks, skipping existing ones
  const flipTasks = []
  for (let i = 0; i < spreads.length - 1; i++) {
    const currentSpreadKey = spreads[i]
    const nextSpreadKey = spreads[i + 1]
    const videoId = `spread-${i + 1}-${i + 2}`

    if (!existingVideos[videoId]) {
      flipTasks.push({
        videoId,
        currentSpreadKey,
        nextSpreadKey,
        startSpread: generatedImages[currentSpreadKey],
        endSpread: generatedImages[nextSpreadKey]
      })
    }
  }

  // Process flip videos in parallel batches
  for (let batchStart = 0; batchStart < flipTasks.length; batchStart += PARALLEL_BATCH_SIZE) {
    const batch = flipTasks.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE)

    // Mark all videos in this batch as generating
    for (const task of batch) {
      currentProgress.status[task.videoId] = 'generating'
    }
    onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })

    // Generate all videos in batch in parallel
    const batchPromises = batch.map(task =>
      generateFlipVideoTask(
        task,
        generatedVideos,
        currentProgress,
        onProgressUpdate,
        onVideoGenerated
      )
    )

    // Wait for entire batch to complete before starting next batch
    await Promise.all(batchPromises)
  }

  return generatedVideos
}

// Helper function to generate a single flip video (used in parallel)
async function generateFlipVideoTask(task, generatedVideos, currentProgress, onProgressUpdate, onVideoGenerated) {
  const { videoId, currentSpreadKey, nextSpreadKey, startSpread, endSpread } = task

  try {
    const result = await generateFlipVideoWithRetry(
      startSpread,
      endSpread,
      (logs) => {
        // Could parse logs for detailed progress if needed
      },
      (attempt, max) => {
        currentProgress.status[videoId] = `retrying (${attempt}/${max})`
        onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })
      }
    )

    generatedVideos[videoId] = {
      url: result.url,
      filename: `${videoId}.mp4`,
      downloadedAt: new Date().toISOString(),
      startFrame: currentSpreadKey,
      endFrame: nextSpreadKey,
      duration: 4,
      predictionId: result.predictionId
    }

    currentProgress.status[videoId] = 'complete'
    currentProgress.current += 1
    onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })
    await saveToIndexedDB('generatedVideos', generatedVideos)

    if (onVideoGenerated) {
      await onVideoGenerated(videoId, result.url, generatedVideos[videoId])
    }
  } catch (error) {
    console.error(`Flip video ${videoId} generation error:`, error)
    currentProgress.status[videoId] = 'failed'
    onProgressUpdate({ ...currentProgress, status: { ...currentProgress.status } })
    // Don't throw - allow other videos in batch to continue
  }
}

// Download video helper
export async function downloadVideo(videoUrl, filename) {
  try {
    const response = await fetch(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`)
    }
    const blob = await response.blob()

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()

    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  } catch (error) {
    console.error('Video download error:', error)
    throw error
  }
}

