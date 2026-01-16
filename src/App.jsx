import { useState, useEffect } from 'react'
import UploadArea from './components/UploadArea'
import PreviewDashboard from './components/PreviewDashboard'
import GenerationDashboard from './components/GenerationDashboard'
import VideoGenerationDashboard from './components/VideoGenerationDashboard'
import { loadFromIndexedDB, saveToIndexedDB } from './utils/indexedDB'
import { generateAllImages, generateImage, PROMPT_1_COVER, PROMPT_2_FIRST_INTERIOR, PROMPT_3_REMAINING_INTERIORS } from './utils/api'
import { downloadImage } from './utils/download'
import { generateAllVideos, downloadVideo, generateOpeningVideo, generateFlipVideo } from './utils/video'

function App() {
  const [currentPhase, setCurrentPhase] = useState('upload') // 'upload' | 'preview' | 'generating' | 'complete' | 'generating-videos' | 'videos-complete'
  const [extractedPages, setExtractedPages] = useState({})
  const [generatedImages, setGeneratedImages] = useState({})
  const [generatedVideos, setGeneratedVideos] = useState({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [extractionMessage, setExtractionMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState({
    current: 0,
    total: 0,
    status: {}
  })
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false)
  const [videoProgress, setVideoProgress] = useState({
    current: 0,
    total: 0,
    status: {}
  })

  // Load saved data on mount
  useEffect(() => {
    loadSavedData()
  }, [])

  async function loadSavedData() {
    try {
      const savedPages = await loadFromIndexedDB('extractedPages')
      const savedImages = await loadFromIndexedDB('generatedImages')
      const savedVideos = await loadFromIndexedDB('generatedVideos')

      if (savedPages && Object.keys(savedPages).length > 0) {
        setExtractedPages(savedPages)
        setCurrentPhase('preview')
      }

      if (savedImages && Object.keys(savedImages).length > 0) {
        setGeneratedImages(savedImages)
      }

      if (savedVideos && Object.keys(savedVideos).length > 0) {
        setGeneratedVideos(savedVideos)
        // If videos exist, show video dashboard
        const videoCount = Object.keys(savedVideos).length
        const spreadCount = Object.keys(savedImages).filter(k => k.startsWith('spread-')).length
        const expectedVideoCount = spreadCount
        if (videoCount === expectedVideoCount && expectedVideoCount > 0) {
          setCurrentPhase('videos-complete')
          setVideoProgress({
            current: videoCount,
            total: expectedVideoCount,
            status: Object.keys(savedVideos).reduce((acc, key) => {
              acc[key] = 'complete'
              return acc
            }, {})
          })
        }
      }
    } catch (error) {
      console.error('Error loading saved data:', error)
    }
  }

  function handleUploadComplete(pages) {
    setExtractedPages(pages)
    setIsProcessing(false)
    setExtractionProgress(0)
    setExtractionMessage('')
    setCurrentPhase('preview')
  }

  function handleProcessingUpdate(progress, message) {
    setExtractionProgress(progress)
    setExtractionMessage(message)
    setIsProcessing(true)
  }

  async function handleStartGeneration() {
    // Switch to generating phase
    setCurrentPhase('generating')
    setIsGenerating(true)

    // Calculate total items to generate
    const spreadCount = Math.floor((Object.keys(extractedPages).length - 1) / 2)
    const total = spreadCount + 1 // +1 for cover

    // Initialize progress
    setGenerationProgress({
      current: 0,
      total,
      status: {}
    })

    // Start generation directly from button click
    try {
      const generated = await generateAllImages(
        extractedPages,
        (progressUpdate) => {
          // Update progress as images generate
          setGenerationProgress(progressUpdate)
        },
        async (imageKey, imageUrl) => {
          // Auto-download each generated image
          const filename = imageKey === 'cover' ? 'cover.jpg' : `${imageKey.replace('spread-', '')}-spread.jpg`
          try {
            await downloadImage(imageUrl, filename)
          } catch (error) {
            console.error('Download error:', error)
          }
        }
      )

      // Generation complete
      setGeneratedImages(generated)
      setIsGenerating(false)
      setCurrentPhase('complete')
    } catch (error) {
      console.error('Generation error:', error)
      alert('Failed to generate images. Please check your API key and try again.')
      setIsGenerating(false)
    }
  }

  function handleGenerationComplete(images) {
    setGeneratedImages(images)
    setIsGenerating(false)
    setCurrentPhase('complete')
  }

  function handleGenerationProgress(progress) {
    setGenerationProgress(progress)
  }

  async function handleStartVideoGeneration() {
    setCurrentPhase('generating-videos')
    setIsGeneratingVideos(true)

    const spreadCount = Object.keys(generatedImages).filter(k => k.startsWith('spread-')).length
    const flipCount = spreadCount > 0 ? spreadCount - 1 : 0
    const totalVideos = 1 + flipCount // 1 opening + flip videos

    setVideoProgress({
      current: 0,
      total: totalVideos,
      status: {}
    })

    try {
      const videos = await generateAllVideos(
        generatedImages,
        (progressUpdate) => {
          setVideoProgress(progressUpdate)
        },
        async (videoId, videoUrl, videoInfo) => {
          // Auto-download each generated video
          try {
            await downloadVideo(videoUrl, videoInfo.filename)
          } catch (error) {
            console.error('Video download error:', error)
          }
        }
      )

      setGeneratedVideos(videos)
      setIsGeneratingVideos(false)
      setCurrentPhase('videos-complete')
    } catch (error) {
      console.error('Video generation error:', error)
      alert('Failed to generate videos. Please check your Replicate API key and try again.')
      setIsGeneratingVideos(false)
      setCurrentPhase('complete') // Go back to image completion view
    }
  }

  async function handleRegenerateImage(imageKey) {
    if (!confirm(`Regenerate ${imageKey}? This will use API credits.`)) {
      return
    }

    // Update status to generating
    setGenerationProgress(prev => ({
      ...prev,
      status: {
        ...prev.status,
        [imageKey]: 'generating'
      }
    }))

    try {
      let imageUrl
      if (imageKey === 'cover') {
        const coverPage = extractedPages['Cover Page']
        if (!coverPage) throw new Error('Cover page not found')
        imageUrl = await generateImage(PROMPT_1_COVER, { image: coverPage.base64 })
      } else if (imageKey === 'spread-1') {
        const leftPage = extractedPages['1-left']
        const rightPage = extractedPages['1-right']
        if (!leftPage || !rightPage) throw new Error('Spread 1 pages not found')
        imageUrl = await generateImage(PROMPT_2_FIRST_INTERIOR, {
          reference_image: generatedImages['cover'].url,
          left_page_image: leftPage.base64,
          right_page_image: rightPage.base64
        })
      } else {
        const spreadNum = parseInt(imageKey.replace('spread-', ''))
        const leftPage = extractedPages[`${spreadNum}-left`]
        const rightPage = extractedPages[`${spreadNum}-right`]
        if (!leftPage || !rightPage) throw new Error(`Spread ${spreadNum} pages not found`)

        // Use spread-1 as reference if it exists, otherwise use cover
        const referenceUrl = (generatedImages['spread-1'] && generatedImages['spread-1'].url) || (generatedImages['cover'] && generatedImages['cover'].url)
        if (!referenceUrl) throw new Error('Reference image not found')

        imageUrl = await generateImage(PROMPT_3_REMAINING_INTERIORS, {
          reference_image: referenceUrl,
          left_page_image: leftPage.base64,
          right_page_image: rightPage.base64
        })
      }

      // Download image
      const filename = imageKey === 'cover' ? 'cover.jpg' : `${imageKey.replace('spread-', '')}-spread.jpg`
      await downloadImage(imageUrl, filename)

      // Update state
      const imageInfo = {
        url: imageUrl,
        generatedAt: new Date().toISOString(),
        downloaded: true
      }

      setGeneratedImages(prev => {
        const next = { ...prev, [imageKey]: imageInfo }
        saveToIndexedDB('generatedImages', next)
        return next
      })

      setGenerationProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [imageKey]: 'complete'
        }
      }))
    } catch (error) {
      console.error(`Regenerate image ${imageKey} error:`, error)
      alert(`Failed to regenerate image: ${error.message}`)
      setGenerationProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [imageKey]: 'failed'
        }
      }))
    }
  }

  async function handleRegenerateVideo(videoId) {
    if (!confirm('Regenerate this video? This will use API credits.')) {
      return
    }

    // Update status to generating
    setVideoProgress(prev => ({
      ...prev,
      status: {
        ...prev.status,
        [videoId]: 'generating'
      }
    }))

    try {
      let result
      const currentImages = generatedImages // Ensure we have the latest images

      if (videoId === 'opening') {
        result = await generateOpeningVideo(currentImages)
      } else {
        // Parse video ID (e.g., "spread-1-2" -> spread 1 and 2)
        const match = videoId.match(/spread-(\d+)-(\d+)/)
        if (!match) {
          throw new Error('Invalid video ID')
        }
        const startSpreadNum = parseInt(match[1])
        const startSpreadKey = `spread-${startSpreadNum}`
        const endSpreadKey = `spread-${startSpreadNum + 1}`

        if (!currentImages[startSpreadKey] || !currentImages[endSpreadKey]) {
          throw new Error('Required images not found for this video')
        }

        result = await generateFlipVideo(
          currentImages[startSpreadKey],
          currentImages[endSpreadKey]
        )
      }

      const videoInfo = {
        url: result.url,
        filename: videoId === 'opening' ? 'opening.mp4' : `${videoId}.mp4`,
        downloadedAt: new Date().toISOString(),
        duration: videoId === 'opening' ? 2 : 3,
        predictionId: result.predictionId
      }

      // Download video
      await downloadVideo(result.url, videoInfo.filename)

      // Update state
      setGeneratedVideos(prev => {
        const next = { ...prev, [videoId]: videoInfo }
        saveToIndexedDB('generatedVideos', next)
        return next
      })

      setVideoProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [videoId]: 'complete'
        }
      }))
    } catch (error) {
      console.error(`Regenerate video ${videoId} error:`, error)
      alert(`Failed to regenerate video: ${error.message}`)
      setVideoProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [videoId]: 'failed'
        }
      }))
    }
  }

  function handleUploadNew() {
    setCurrentPhase('upload')
    setExtractedPages({})
    setGeneratedImages({})
    setGeneratedVideos({})
    setIsProcessing(false)
    setExtractionProgress(0)
    setExtractionMessage('')
    setIsGenerating(false)
    setGenerationProgress({
      current: 0,
      total: 0,
      status: {}
    })
    setIsGeneratingVideos(false)
    setVideoProgress({
      current: 0,
      total: 0,
      status: {}
    })
  }

  return (
    <div className="app">
      {(currentPhase === 'upload' || isProcessing) && (
        <UploadArea
          onUploadComplete={handleUploadComplete}
          onProcessingUpdate={handleProcessingUpdate}
          isProcessing={isProcessing}
          progress={extractionProgress}
          message={extractionMessage}
        />
      )}

      {currentPhase === 'preview' && !isProcessing && (
        <PreviewDashboard
          extractedPages={extractedPages}
          onStartGeneration={handleStartGeneration}
          onUploadNew={handleUploadNew}
        />
      )}

      {(currentPhase === 'generating' || currentPhase === 'complete') && (
        <GenerationDashboard
          generatedImages={generatedImages}
          isGenerating={isGenerating}
          progress={generationProgress}
          onUploadNew={handleUploadNew}
          onStartVideoGeneration={handleStartVideoGeneration}
          onRegenerateImage={handleRegenerateImage}
        />
      )}

      {(currentPhase === 'generating-videos' || currentPhase === 'videos-complete') && (
        <VideoGenerationDashboard
          generatedImages={generatedImages}
          generatedVideos={generatedVideos}
          isGeneratingVideos={isGeneratingVideos}
          videoProgress={videoProgress}
          onStartVideoGeneration={handleStartVideoGeneration}
          onRegenerateVideo={handleRegenerateVideo}
          onUploadNew={handleUploadNew}
        />
      )}
    </div>
  )
}

export default App


