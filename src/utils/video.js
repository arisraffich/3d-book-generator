import { saveToIndexedDB, loadFromIndexedDB } from './indexedDB'

const REPLICATE_API_KEY = import.meta.env.VITE_REPLICATE_API_KEY
const REPLICATE_API_BASE_URL = 'https://api.replicate.com/v1'
const MAX_RETRIES = 3

// Check if error is permanent (should not retry)
function isPermanentError(error) {
  const message = error.message?.toLowerCase() || ''
  return message.includes('401') || 
         message.includes('403') || 
         message.includes('api key') ||
         message.includes('quota') ||
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

const MODEL = 'bytedance/seedance-1-pro'

// Prompts
const PROMPT_OPENING = `Create a video showing a book opening from closed to revealing the first interior page spread.
The entire book (including spine) rotates RIGHT by 90 degrees without opening. Then the book opens naturally and lays flat on the table surface, revealing interior pages.

CRITICAL - Static Content:
1. No human hands visible.
2. All illustrations and text inside the book must remain completely still and frozen. No animated characters, no moving objects inside the pages. The images are printed on paper.
3. All text sharp and readable
4. DO NOT ADD OR CHANGE ANYTHING IN THE SCENE. KEEP ALL SAME`

const PROMPT_PAGE_FLIP = `Animate the book's interior book pages turning from one spread to the next.
Right page lifts and turns LEFT, revealing next spread
Left page stays anchored and stationary

CRITICAL: 
1. All illustrations and text inside the book must remain completely still and frozen. No animated characters, no moving objects inside the pages. The images are printed on paper.
2. DO NOT add or change anything in the scene
3. Page Turning RIGHT TO LEFT
4. Only ONE SINGLE page turns (the right page)-NOT multiple pages, NOT a bunch of pages—just ONE page
5. NO human hands, NO fingers, NO objects touching the page`

// Helper function to convert data URL to blob URL for Replicate
function convertDataUrlToBlobUrl(dataUrl) {
  // Replicate accepts data URIs directly if < 256kb
  // For larger images, we might need to handle differently
  // For now, return the data URL - Replicate should handle it
  return dataUrl
}

// Get the latest model version
async function getModelVersion() {
  if (!REPLICATE_API_KEY) {
    throw new Error('Replicate API key not configured. Please set VITE_REPLICATE_API_KEY in .env')
  }

  // Get model info - this endpoint includes latest_version
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

  // Extract latest version ID from model.latest_version.id
  if (modelData.latest_version && modelData.latest_version.id) {
    return modelData.latest_version.id
  }

  throw new Error('No latest version found in model data')
}

// Create a prediction on Replicate
async function createPrediction(input) {
  if (!REPLICATE_API_KEY) {
    throw new Error('Replicate API key not configured. Please set VITE_REPLICATE_API_KEY in .env')
  }

  // Get the latest model version
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
    duration: 2,
    resolution: '1080p',
    aspect_ratio: '1:1',
    fps: 24,
    camera_fixed: false
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
    duration: 3,
    resolution: '1080p',
    aspect_ratio: '1:1',
    fps: 24,
    camera_fixed: false
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
export async function generateAllVideos(generatedImages, onProgressUpdate, onVideoGenerated) {
  const generatedVideos = {}

  // Count actual spread keys (spread-1, spread-2, etc.)
  const spreadCount = Object.keys(generatedImages).filter(k => k.startsWith('spread-')).length
  // Total videos = 1 opening + (spreadCount - 1) flip videos
  const flipCount = spreadCount > 0 ? spreadCount - 1 : 0
  const totalVideos = 1 + flipCount

  let currentProgress = {
    current: 0,
    total: totalVideos,
    status: {}
  }

  // Initialize status
  currentProgress.status['opening'] = 'pending'
  for (let i = 1; i <= flipCount; i++) {
    currentProgress.status[`spread-${i}-${i + 1}`] = 'pending'
  }
  onProgressUpdate({ ...currentProgress })

  // Step 1: Generate Opening Video (sequential - just one)
  try {
    currentProgress.status['opening'] = 'generating'
    onProgressUpdate({ ...currentProgress })

    const result = await generateOpeningVideoWithRetry(
      generatedImages, 
      (logs) => {
        // Could parse logs for detailed progress if needed
      },
      (attempt, max) => {
        currentProgress.status['opening'] = `retrying (${attempt}/${max})`
        onProgressUpdate({ ...currentProgress })
      }
    )

    generatedVideos['opening'] = {
      url: result.url,
      filename: 'opening.mp4',
      downloadedAt: new Date().toISOString(),
      startFrame: 'cover',
      endFrame: 'spread-1',
      duration: 2,
      predictionId: result.predictionId
    }

    currentProgress.status['opening'] = 'complete'
    currentProgress.current = 1
    onProgressUpdate({ ...currentProgress })
    await saveToIndexedDB('generatedVideos', generatedVideos)

    if (onVideoGenerated) {
      await onVideoGenerated('opening', result.url, generatedVideos['opening'])
    }
  } catch (error) {
    console.error('Opening video generation error:', error)
    currentProgress.status['opening'] = 'failed'
    onProgressUpdate({ ...currentProgress })
    throw error
  }

  // Step 2: Generate Flip Videos (in parallel batches of PARALLEL_BATCH_SIZE)
  const spreads = Object.keys(generatedImages)
    .filter(key => key.startsWith('spread-'))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[1])
      const numB = parseInt(b.split('-')[1])
      return numA - numB
    })

  // Build array of all flip video tasks
  const flipTasks = []
  for (let i = 0; i < spreads.length - 1; i++) {
    const currentSpreadKey = spreads[i]
    const nextSpreadKey = spreads[i + 1]
    const videoId = `spread-${i + 1}-${i + 2}`
    
    flipTasks.push({
      videoId,
      currentSpreadKey,
      nextSpreadKey,
      startSpread: generatedImages[currentSpreadKey],
      endSpread: generatedImages[nextSpreadKey]
    })
  }

  // Process flip videos in parallel batches
  for (let batchStart = 0; batchStart < flipTasks.length; batchStart += PARALLEL_BATCH_SIZE) {
    const batch = flipTasks.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE)
    
    // Mark all videos in this batch as generating
    for (const task of batch) {
      currentProgress.status[task.videoId] = 'generating'
    }
    onProgressUpdate({ ...currentProgress })

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
        onProgressUpdate({ ...currentProgress })
      }
    )

    generatedVideos[videoId] = {
      url: result.url,
      filename: `${videoId}.mp4`,
      downloadedAt: new Date().toISOString(),
      startFrame: currentSpreadKey,
      endFrame: nextSpreadKey,
      duration: 3,
      predictionId: result.predictionId
    }

    currentProgress.status[videoId] = 'complete'
    currentProgress.current += 1
    onProgressUpdate({ ...currentProgress })
    await saveToIndexedDB('generatedVideos', generatedVideos)

    if (onVideoGenerated) {
      await onVideoGenerated(videoId, result.url, generatedVideos[videoId])
    }
  } catch (error) {
    console.error(`Flip video ${videoId} generation error:`, error)
    currentProgress.status[videoId] = 'failed'
    onProgressUpdate({ ...currentProgress })
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

