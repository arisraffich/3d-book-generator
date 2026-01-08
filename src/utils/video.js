import { saveToIndexedDB, loadFromIndexedDB } from './indexedDB'

const REPLICATE_API_KEY = import.meta.env.VITE_REPLICATE_API_KEY
const REPLICATE_API_BASE_URL = 'https://api.replicate.com/v1'

// Use proxy in development (Vite) and production (Cloudflare Function) to avoid CORS
const REPLICATE_API_URL = import.meta.env.DEV
  ? '/replicate-api/v1'  // Use Vite proxy in development
  : '/api/replicate'     // Use Cloudflare Function in production

const MODEL = 'bytedance/seedance-1.5-pro'

// ... (prompts unchanged) ...

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
    camera_fixed: false,
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
    duration: 3,
    resolution: '1080p',
    aspect_ratio: '1:1',
    fps: 24,
    camera_fixed: false,
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

// Generate all videos
export async function generateAllVideos(generatedImages, onProgressUpdate, onVideoGenerated) {

  const generatedVideos = {}

  // Calculate spread transitions
  const spreads = Object.keys(generatedImages)
    .filter(key => key.startsWith('spread-'))
    .sort((a, b) => {
      const numA = parseInt(a.split('-')[1])
      const numB = parseInt(b.split('-')[1])
      return numA - numB
    })

  // Total videos = 1 opening + (N-1) flips
  // If spread count is 1, only opening video.
  // If spread count is > 1, then we have flips.
  const flipCount = spreads.length > 0 ? spreads.length - 1 : 0
  const totalVideos = 1 + flipCount

  let currentProgress = {
    current: 0,
    total: totalVideos,
    status: {}
  }

  // Initialize status
  currentProgress.status['opening'] = 'pending'
  for (let i = 0; i < flipCount; i++) {
    const numA = parseInt(spreads[i].split('-')[1])
    const numB = parseInt(spreads[i + 1].split('-')[1])
    currentProgress.status[`spread-${numA}-${numB}`] = 'pending'
  }
  onProgressUpdate({ ...currentProgress })

  const updateProgress = (id, status) => {
    currentProgress.status[id] = status
    if (status === 'complete') {
      currentProgress.current += 1
    }
    onProgressUpdate({ ...currentProgress })
  }

  const promises = []

  // 1. Opening Video Task
  const openingTask = async () => {
    try {
      updateProgress('opening', 'generating')

      const result = await generateOpeningVideo(generatedImages, (logs) => {
        // Optional log handling
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

      updateProgress('opening', 'complete')
      await saveToIndexedDB('generatedVideos', generatedVideos)

      if (onVideoGenerated) {
        await onVideoGenerated('opening', result.url, generatedVideos['opening'])
      }
    } catch (error) {
      console.error('Opening video generation error:', error)
      updateProgress('opening', 'failed')
      // Don't re-throw, let other videos continue
    }
  }
  promises.push(openingTask())

  // 2. Flip Video Tasks
  for (let i = 0; i < flipCount; i++) {
    const currentSpreadKey = spreads[i]
    const nextSpreadKey = spreads[i + 1]
    const numA = parseInt(currentSpreadKey.split('-')[1])
    const numB = parseInt(nextSpreadKey.split('-')[1])
    const videoId = `spread-${numA}-${numB}`

    const flipTask = async () => {
      try {
        updateProgress(videoId, 'generating')

        const result = await generateFlipVideo(
          generatedImages[currentSpreadKey],
          generatedImages[nextSpreadKey],
          (logs) => {
            // Optional log handling
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

        updateProgress(videoId, 'complete')
        await saveToIndexedDB('generatedVideos', generatedVideos)

        if (onVideoGenerated) {
          await onVideoGenerated(videoId, result.url, generatedVideos[videoId])
        }
      } catch (error) {
        console.error(`Flip video ${videoId} generation error:`, error)
        updateProgress(videoId, 'failed')
      }
    }
    promises.push(flipTask())
  }

  // Find out wait for all
  await Promise.all(promises)

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

