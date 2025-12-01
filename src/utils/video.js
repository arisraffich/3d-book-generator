import { saveToIndexedDB, loadFromIndexedDB } from './indexedDB'

const REPLICATE_API_KEY = import.meta.env.VITE_REPLICATE_API_KEY
const REPLICATE_API_URL = 'https://api.replicate.com/v1'
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

  const response = await fetch(`${REPLICATE_API_URL}/models/${MODEL}/versions`, {
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch model versions: ${response.status}`)
  }

  const data = await response.json()
  // Return the latest version (first in the list)
  if (data.results && data.results.length > 0) {
    return data.results[0].id
  }
  throw new Error('No model versions found')
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
      return prediction.output
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
    fps: 30,
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
    fps: 30,
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

// Generate all videos
export async function generateAllVideos(generatedImages, onProgressUpdate, onVideoGenerated) {
  const generatedVideos = {}
  const spreadCount = Math.floor((Object.keys(generatedImages).length - 1) / 2)
  const totalVideos = spreadCount // Opening + (spreads - 1) flips

  let currentProgress = {
    current: 0,
    total: totalVideos,
    status: {}
  }

  // Initialize status
  currentProgress.status['opening'] = 'pending'
  for (let i = 1; i < spreadCount; i++) {
    currentProgress.status[`spread-${i}-${i + 1}`] = 'pending'
  }
  onProgressUpdate({ ...currentProgress })

  // Step 1: Generate Opening Video
  try {
    currentProgress.status['opening'] = 'generating'
    onProgressUpdate({ ...currentProgress })

    const result = await generateOpeningVideo(generatedImages, (logs) => {
      // Could parse logs for detailed progress if needed
    })

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

  // Step 2: Generate Flip Videos (sequentially)
  const spreads = Object.keys(generatedImages)
    .filter(key => key.startsWith('spread-'))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[1])
      const numB = parseInt(b.split('-')[1])
      return numA - numB
    })

  for (let i = 0; i < spreads.length - 1; i++) {
    const currentSpreadKey = spreads[i]
    const nextSpreadKey = spreads[i + 1]
    const videoId = `spread-${i + 1}-${i + 2}`

    try {
      currentProgress.status[videoId] = 'generating'
      onProgressUpdate({ ...currentProgress })

      const result = await generateFlipVideo(
        generatedImages[currentSpreadKey],
        generatedImages[nextSpreadKey],
        (logs) => {
          // Could parse logs for detailed progress if needed
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
      // Continue with other videos even if one fails
    }
  }

  return generatedVideos
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

