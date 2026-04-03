import { useState, useEffect } from 'react'
import UploadArea from './components/UploadArea'
import PreviewDashboard from './components/PreviewDashboard'
import GenerationDashboard from './components/GenerationDashboard'
import VideoGenerationDashboard from './components/VideoGenerationDashboard'
import { loadFromIndexedDB, saveToIndexedDB } from './utils/indexedDB'
import { generateAllImages, generateImageWithRetry, PROMPT_1_COVER, PROMPT_2_FIRST_INTERIOR, PROMPT_3_REMAINING_INTERIORS } from './utils/api'
import { downloadImage } from './utils/download'
import { generateAllVideos, downloadVideo, generateOpeningVideoWithRetry, generateFlipVideoWithRetry } from './utils/video'

function App() {
  const [currentPhase, setCurrentPhase] = useState('upload') // 'upload' | 'preview' | 'generating' | 'review' | 'generating-remaining' | 'complete' | 'generating-videos' | 'videos-complete'
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
      // Note: Videos are NOT restored on refresh - user must click "Generate Videos" to enter video phase

      if (savedPages && Object.keys(savedPages).length > 0) {
        setExtractedPages(savedPages)
        
        // Check if we have generated images - restore to appropriate phase
        if (savedImages && Object.keys(savedImages).length > 0) {
          setGeneratedImages(savedImages)
          
          // Reconstruct progress from saved images
          const spreadCount = Math.floor((Object.keys(savedPages).length - 1) / 2)
          const total = spreadCount + 1 // +1 for cover
          
          // Build status from what we have
          const status = {}
          status['cover'] = savedImages['cover'] ? 'complete' : 'pending'
          for (let i = 1; i <= spreadCount; i++) {
            status[`spread-${i}`] = savedImages[`spread-${i}`] ? 'complete' : 'pending'
          }
          
          const completedCount = Object.values(status).filter(s => s === 'complete').length
          
          setGenerationProgress({
            current: completedCount,
            total,
            status
          })
          
          // Determine phase: if only cover + spread-1, go to review; otherwise complete
          const hasOnlyCoverAndSpread1 = completedCount <= 2 && !savedImages['spread-2']
          const spreadCount2 = Math.floor((Object.keys(savedPages).length - 1) / 2)
          if (hasOnlyCoverAndSpread1 && spreadCount2 > 1) {
            setCurrentPhase('review')
          } else {
            setCurrentPhase('complete')
          }
        } else {
          setCurrentPhase('preview')
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
    // Step 1: Generate cover + spread 1 only
    setCurrentPhase('generating')
    setIsGenerating(true)

    const spreadCount = Math.floor((Object.keys(extractedPages).length - 1) / 2)
    const total = spreadCount + 1 // +1 for cover

    setGenerationProgress({
      current: 0,
      total,
      status: {}
    })

    try {
      // Generate Cover
      const coverPage = extractedPages['Cover Page']
      if (!coverPage) throw new Error('Cover page not found')

      setGenerationProgress(prev => ({
        ...prev,
        status: { ...prev.status, cover: 'generating' }
      }))

      const coverUrl = await generateImageWithRetry(
        PROMPT_1_COVER,
        { image: coverPage.base64 },
        (attempt, max) => {
          setGenerationProgress(prev => ({
            ...prev,
            status: { ...prev.status, cover: `retrying (${attempt}/${max})` }
          }))
        }
      )

      const coverInfo = { url: coverUrl, generatedAt: new Date().toISOString(), downloaded: true }
      setGeneratedImages(prev => {
        const next = { ...prev, cover: coverInfo }
        saveToIndexedDB('generatedImages', next)
        return next
      })
      setGenerationProgress(prev => ({
        ...prev,
        current: 1,
        status: { ...prev.status, cover: 'complete' }
      }))
      try { await downloadImage(coverUrl, 'cover.jpg') } catch (e) { console.error('Download error:', e) }

      // Generate Spread 1
      const leftPage = extractedPages['1-left']
      const rightPage = extractedPages['1-right']
      if (!leftPage || !rightPage) throw new Error('Missing pages for spread 1')

      setGenerationProgress(prev => ({
        ...prev,
        status: { ...prev.status, 'spread-1': 'generating' }
      }))

      const spread1Url = await generateImageWithRetry(
        PROMPT_2_FIRST_INTERIOR,
        {
          reference_image: coverUrl,
          left_page_image: leftPage.base64,
          right_page_image: rightPage.base64
        },
        (attempt, max) => {
          setGenerationProgress(prev => ({
            ...prev,
            status: { ...prev.status, 'spread-1': `retrying (${attempt}/${max})` }
          }))
        }
      )

      const spread1Info = { url: spread1Url, generatedAt: new Date().toISOString(), downloaded: true }
      setGeneratedImages(prev => {
        const next = { ...prev, 'spread-1': spread1Info }
        saveToIndexedDB('generatedImages', next)
        return next
      })
      setGenerationProgress(prev => ({
        ...prev,
        current: 2,
        status: { ...prev.status, 'spread-1': 'complete' }
      }))
      try { await downloadImage(spread1Url, '1-spread.jpg') } catch (e) { console.error('Download error:', e) }

      // Pause for review
      setIsGenerating(false)
      setCurrentPhase('review')
    } catch (error) {
      console.error('Generation error:', error)
      alert('Failed to generate images. Please check your API key and try again.')
      setIsGenerating(false)
    }
  }

  async function handleContinueGeneration() {
    // Step 2: Generate remaining spreads using spread-1 as reference
    setCurrentPhase('generating-remaining')
    setIsGenerating(true)

    const spreadCount = Math.floor((Object.keys(extractedPages).length - 1) / 2)
    const spread1Url = generatedImages['spread-1']?.url
    if (!spread1Url) {
      alert('Spread 1 image not found. Please regenerate it first.')
      setIsGenerating(false)
      setCurrentPhase('review')
      return
    }

    try {
      const promises = []
      for (let i = 2; i <= spreadCount; i++) {
        const leftPage = extractedPages[`${i}-left`]
        const rightPage = extractedPages[`${i}-right`]
        if (leftPage && rightPage) {
          promises.push(
            (async () => {
              const spreadKey = `spread-${i}`
              setGenerationProgress(prev => ({
                ...prev,
                status: { ...prev.status, [spreadKey]: 'generating' }
              }))

              try {
                const spreadUrl = await generateImageWithRetry(
                  PROMPT_3_REMAINING_INTERIORS,
                  {
                    reference_image: spread1Url,
                    left_page_image: leftPage.base64,
                    right_page_image: rightPage.base64
                  },
                  (attempt, max) => {
                    setGenerationProgress(prev => ({
                      ...prev,
                      status: { ...prev.status, [spreadKey]: `retrying (${attempt}/${max})` }
                    }))
                  }
                )

                const spreadInfo = { url: spreadUrl, generatedAt: new Date().toISOString(), downloaded: true }
                setGeneratedImages(prev => {
                  const next = { ...prev, [spreadKey]: spreadInfo }
                  saveToIndexedDB('generatedImages', next)
                  return next
                })
                setGenerationProgress(prev => ({
                  ...prev,
                  current: prev.current + 1,
                  status: { ...prev.status, [spreadKey]: 'complete' }
                }))

                const filename = `${i}-spread.jpg`
                try { await downloadImage(spreadUrl, filename) } catch (e) { console.error('Download error:', e) }
              } catch (error) {
                console.error(`Spread ${i} generation error:`, error)
                setGenerationProgress(prev => ({
                  ...prev,
                  status: { ...prev.status, [spreadKey]: 'failed' }
                }))
              }
            })()
          )
        }
      }

      await Promise.all(promises)
      setIsGenerating(false)
      setCurrentPhase('complete')
    } catch (error) {
      console.error('Generation error:', error)
      alert('Failed to generate remaining images.')
      setIsGenerating(false)
    }
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
          // Update state incrementally so videos can be previewed during generation
          setGeneratedVideos(prev => ({
            ...prev,
            [videoId]: videoInfo
          }))
          
          // Auto-download each generated video
          try {
            await downloadVideo(videoUrl, videoInfo.filename)
          } catch (error) {
            console.error('Video download error:', error)
          }
        },
        generatedVideos
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

    // Helper to update retry status
    const onRetry = (attempt, max) => {
      setGenerationProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [imageKey]: `retrying (${attempt}/${max})`
        }
      }))
    }

    try {
      let imageUrl
      if (imageKey === 'cover') {
        const coverPage = extractedPages['Cover Page']
        if (!coverPage) throw new Error('Cover page not found')
        imageUrl = await generateImageWithRetry(PROMPT_1_COVER, { image: coverPage.base64 }, onRetry)
      } else if (imageKey === 'spread-1') {
        const leftPage = extractedPages['1-left']
        const rightPage = extractedPages['1-right']
        if (!leftPage || !rightPage) throw new Error('Spread 1 pages not found')
        imageUrl = await generateImageWithRetry(PROMPT_2_FIRST_INTERIOR, {
          reference_image: generatedImages['cover'].url,
          left_page_image: leftPage.base64,
          right_page_image: rightPage.base64
        }, onRetry)
      } else {
        const spreadNum = parseInt(imageKey.replace('spread-', ''))
        const leftPage = extractedPages[`${spreadNum}-left`]
        const rightPage = extractedPages[`${spreadNum}-right`]
        if (!leftPage || !rightPage) throw new Error(`Spread ${spreadNum} pages not found`)

        // Use spread-1 as reference if it exists, otherwise use cover
        const referenceUrl = (generatedImages['spread-1'] && generatedImages['spread-1'].url) || (generatedImages['cover'] && generatedImages['cover'].url)
        if (!referenceUrl) throw new Error('Reference image not found')

        imageUrl = await generateImageWithRetry(PROMPT_3_REMAINING_INTERIORS, {
          reference_image: referenceUrl,
          left_page_image: leftPage.base64,
          right_page_image: rightPage.base64
        }, onRetry)
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

      setGenerationProgress(prev => {
        const newStatus = { ...prev.status, [imageKey]: 'complete' }
        const completedCount = Object.values(newStatus).filter(s => s === 'complete').length
        return {
          ...prev,
          current: completedCount,
          status: newStatus
        }
      })
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

  async function handleGenerateSingleVideo(imageKey) {
    // Determine video ID and type based on image key
    let videoId, result

    if (imageKey === 'cover') {
      videoId = 'opening'
      if (!generatedImages['cover'] || !generatedImages['spread-1']) {
        alert('Both cover and spread 1 images are needed to generate the opening video.')
        return
      }
    } else {
      const spreadNum = parseInt(imageKey.replace('spread-', ''))
      const nextSpreadKey = `spread-${spreadNum + 1}`
      videoId = `spread-${spreadNum}-${spreadNum + 1}`
      if (!generatedImages[imageKey] || !generatedImages[nextSpreadKey]) {
        alert(`Both ${imageKey} and spread-${spreadNum + 1} images are needed to generate this video.`)
        return
      }
    }

    if (!confirm(`Generate video for ${imageKey}? This will use API credits.`)) {
      return
    }

    // Update generation progress to show video is generating
    setGenerationProgress(prev => ({
      ...prev,
      status: {
        ...prev.status,
        [`${imageKey}-video`]: 'generating'
      }
    }))

    try {
      if (imageKey === 'cover') {
        result = await generateOpeningVideoWithRetry(generatedImages, null, null)
      } else {
        const spreadNum = parseInt(imageKey.replace('spread-', ''))
        result = await generateFlipVideoWithRetry(
          generatedImages[imageKey],
          generatedImages[`spread-${spreadNum + 1}`],
          null,
          null
        )
      }

      const videoInfo = {
        url: result.url,
        filename: videoId === 'opening' ? 'opening.mp4' : `${videoId}.mp4`,
        downloadedAt: new Date().toISOString(),
        duration: 5,
        predictionId: result.predictionId
      }

      await downloadVideo(result.url, videoInfo.filename)

      setGeneratedVideos(prev => {
        const next = { ...prev, [videoId]: videoInfo }
        saveToIndexedDB('generatedVideos', next)
        return next
      })

      setGenerationProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [`${imageKey}-video`]: 'complete'
        }
      }))

      alert(`Video generated and downloaded: ${videoInfo.filename}`)
    } catch (error) {
      console.error(`Single video generation error for ${imageKey}:`, error)
      alert(`Failed to generate video: ${error.message}`)
      setGenerationProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [`${imageKey}-video`]: 'failed'
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

    // Helper to update retry status
    const onRetry = (attempt, max) => {
      setVideoProgress(prev => ({
        ...prev,
        status: {
          ...prev.status,
          [videoId]: `retrying (${attempt}/${max})`
        }
      }))
    }

    try {
      let result
      const currentImages = generatedImages // Ensure we have the latest images

      if (videoId === 'opening') {
        result = await generateOpeningVideoWithRetry(currentImages, null, onRetry)
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

        result = await generateFlipVideoWithRetry(
          currentImages[startSpreadKey],
          currentImages[endSpreadKey],
          null,
          onRetry
        )
      }

      const videoInfo = {
        url: result.url,
        filename: videoId === 'opening' ? 'opening.mp4' : `${videoId}.mp4`,
        downloadedAt: new Date().toISOString(),
        duration: 5,
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

      setVideoProgress(prev => {
        const newStatus = { ...prev.status, [videoId]: 'complete' }
        const completedCount = Object.values(newStatus).filter(s => s === 'complete').length
        return {
          ...prev,
          current: completedCount,
          status: newStatus
        }
      })
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

      {(currentPhase === 'generating' || currentPhase === 'review' || currentPhase === 'generating-remaining' || currentPhase === 'complete') && (
        <GenerationDashboard
          generatedImages={generatedImages}
          isGenerating={isGenerating}
          progress={generationProgress}
          currentPhase={currentPhase}
          onUploadNew={handleUploadNew}
          onStartVideoGeneration={handleStartVideoGeneration}
          onRegenerateImage={handleRegenerateImage}
          onGenerateSingleVideo={handleGenerateSingleVideo}
          onContinueGeneration={handleContinueGeneration}
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


