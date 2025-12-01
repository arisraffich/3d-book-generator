import { useCallback, useState } from 'react'
import { extractPagesFromPDF } from '../utils/pdfExtractor'

function UploadArea({ onUploadComplete, onProcessingUpdate, isProcessing, progress, message }) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(async (file) => {
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are supported')
      return
    }

    onProcessingUpdate(0, 'Preparing to extract pages...')
    
    try {
      const pages = await extractPagesFromPDF(file, onProcessingUpdate)
      onUploadComplete(pages)
    } catch (error) {
      console.error('Error extracting PDF:', error)
      alert('Failed to extract PDF pages. Please try a different file.')
      onProcessingUpdate(0, '')
    }
  }, [onUploadComplete, onProcessingUpdate])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e) => {
    const file = e.target.files[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

  if (isProcessing) {
    return (
      <div className="upload-area">
        <div className="progress-modal">
          <div className="progress-title">Processing PDF...</div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}>
              {progress}%
            </div>
          </div>
          <div className="progress-message">{message}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="upload-area">
      <h1 className="upload-title">📚 3D Book Generator</h1>
      <div
        className={`upload-dropzone ${isDragging ? 'dragover' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('file-input').click()}
      >
        <div className="upload-icon">📄</div>
        <div className="upload-text">Drop PDF here or click to upload</div>
        <div className="upload-hint">Supports: PDF files only</div>
      </div>
      <input
        id="file-input"
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  )
}

export default UploadArea


