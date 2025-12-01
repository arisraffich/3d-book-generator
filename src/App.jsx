import { useState, useEffect } from 'react'
import UploadArea from './components/UploadArea'
import PreviewDashboard from './components/PreviewDashboard'
import GenerationDashboard from './components/GenerationDashboard'
import { loadFromIndexedDB } from './utils/indexedDB'
import { generateAllImages } from './utils/api'
import { downloadImage } from './utils/download'

function App() {
  const [currentPhase, setCurrentPhase] = useState('upload') // 'upload' | 'preview' | 'generating' | 'complete'
  const [extractedPages, setExtractedPages] = useState({})
  const [generatedImages, setGeneratedImages] = useState({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [extractionMessage, setExtractionMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState({
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
      
      if (savedPages && Object.keys(savedPages).length > 0) {
        setExtractedPages(savedPages)
        setCurrentPhase('preview')
      }
      
      if (savedImages && Object.keys(savedImages).length > 0) {
        setGeneratedImages(savedImages)
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

  function handleUploadNew() {
    setCurrentPhase('upload')
    setExtractedPages({})
    setGeneratedImages({})
    setIsProcessing(false)
    setExtractionProgress(0)
    setExtractionMessage('')
    setIsGenerating(false)
    setGenerationProgress({
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
        />
      )}
    </div>
  )
}

export default App


