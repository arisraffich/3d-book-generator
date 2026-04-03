import { useState, useEffect } from 'react'

function GenerationDashboard({
  generatedImages,
  isGenerating,
  progress,
  currentPhase,
  onUploadNew,
  onStartVideoGeneration,
  onRegenerateImage,
  onGenerateSingleVideo,
  onContinueGeneration
}) {
  const [previewImage, setPreviewImage] = useState(null)

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === 'Escape') setPreviewImage(null)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [])
  function getStatusIcon(status) {
    if (status?.startsWith('retrying')) return '🔄'
    switch (status) {
      case 'complete':
        return '✅'
      case 'generating':
        return '⏳'
      case 'failed':
        return '❌'
      default:
        return '⬜'
    }
  }

  function getStatusText(status) {
    if (status?.startsWith('retrying')) {
      const match = status.match(/retrying \((\d+)\/(\d+)\)/)
      if (match) return `Retrying (${match[1]}/${match[2]})...`
      return 'Retrying...'
    }
    switch (status) {
      case 'complete':
        return 'Downloaded ✓'
      case 'generating':
        return 'Generating...'
      case 'failed':
        return 'Failed (after 3 attempts)'
      default:
        return 'Pending...'
    }
  }

  function renderGenerationStatus() {
    const items = []
    const total = progress.total

    // Cover
    const coverStatus = progress.status['cover'] || 'pending'
    items.push(
      <div key="cover" className={`generation-status-item ${coverStatus}`}>
        <div className="status-header">
          <span className="status-icon">{getStatusIcon(coverStatus)}</span>
          <span className="status-name">Cover</span>
        </div>
        {coverStatus === 'complete' && generatedImages['cover']?.url && (
          <img
            src={generatedImages['cover'].url}
            alt="Cover"
            className="status-image clickable"
            onClick={() => setPreviewImage({ url: generatedImages['cover'].url, label: 'Cover' })}
          />
        )}
        <div className="status-details">
          {getStatusText(coverStatus)}
        </div>
        {(coverStatus === 'complete' || coverStatus === 'failed') && onRegenerateImage && (
          <div className="action-buttons">
            <button
              className="regenerate-btn"
              onClick={() => onRegenerateImage('cover')}
            >
              ↻ Regenerate
            </button>
            {coverStatus === 'complete' && onGenerateSingleVideo && generatedImages['spread-1']?.url && (
              <button
                className="regenerate-btn video-btn"
                onClick={() => onGenerateSingleVideo('cover')}
                disabled={progress.status['cover-video'] === 'generating'}
              >
                {progress.status['cover-video'] === 'generating' ? '⏳ Generating...' : '🎬 Video'}
              </button>
            )}
          </div>
        )}
      </div>
    )

    // Spreads
    for (let i = 1; i <= total - 1; i++) {
      const spreadKey = `spread-${i}`
      const spreadStatus = progress.status[spreadKey] || 'pending'
      items.push(
        <div key={spreadKey} className={`generation-status-item ${spreadStatus}`}>
          <div className="status-header">
            <span className="status-icon">{getStatusIcon(spreadStatus)}</span>
            <span className="status-name">Spread {i}</span>
          </div>
          {spreadStatus === 'complete' && generatedImages[spreadKey]?.url && (
            <img
              src={generatedImages[spreadKey].url}
              alt={`Spread ${i}`}
              className="status-image clickable"
              onClick={() => setPreviewImage({ url: generatedImages[spreadKey].url, label: `Spread ${i}` })}
            />
          )}
          <div className="status-details">
            {getStatusText(spreadStatus)}
          </div>
          {(spreadStatus === 'complete' || spreadStatus === 'failed') && onRegenerateImage && (
            <div className="action-buttons">
              <button
                className="regenerate-btn"
                onClick={() => onRegenerateImage(spreadKey)}
              >
                ↻ Regenerate
              </button>
              {spreadStatus === 'complete' && onGenerateSingleVideo && i < total - 1 && generatedImages[`spread-${i + 1}`]?.url && (
                <button
                  className="regenerate-btn video-btn"
                  onClick={() => onGenerateSingleVideo(spreadKey)}
                  disabled={progress.status[`${spreadKey}-video`] === 'generating'}
                >
                  {progress.status[`${spreadKey}-video`] === 'generating' ? '⏳ Generating...' : '🎬 Video'}
                </button>
              )}
            </div>
          )}
        </div>
      )
    }

    return items
  }

  // Review phase: cover + spread 1 done, waiting for user approval
  if (currentPhase === 'review' && !isGenerating) {
    return (
      <div className="dashboard-container">
        <div className="sidebar">
          <div className="sidebar-title">3D BOOK RENDERS</div>
          {renderGenerationStatus()}
        </div>
        <div className="center-dashboard">
          <div className="dashboard-title">Review Cover & Spread 1</div>
          <div className="dashboard-subtitle">
            Please review the cover and first spread. If they look good, continue to generate the remaining spreads. If not, use the Regenerate buttons to redo them.
          </div>
          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button className="button" onClick={onContinueGeneration}>
              Continue — Generate Remaining Spreads
            </button>
            <button className="button secondary" onClick={onUploadNew}>
              Upload Another Book
            </button>
          </div>
        </div>
        {previewImage && <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />}
      </div>
    )
  }

  // Check completion by status values, not counter (handles regenerated images properly)
  const allComplete = progress.total > 0 &&
    Object.keys(progress.status).length === progress.total &&
    Object.values(progress.status).every(s => s === 'complete')

  if (!isGenerating && allComplete) {
    // Completion view
    return (
      <div className="dashboard-container">
        <div className="sidebar">
          <div className="sidebar-title">3D BOOK RENDERS</div>
          {renderGenerationStatus()}
        </div>
        <div className="center-dashboard">
          <div className="dashboard-title">All Images Generated!</div>
          <div className="dashboard-subtitle">
            {progress.total} images created and downloaded:
            <ul className="stats-list">
              <li>• cover.jpg</li>
              {Array.from({ length: progress.total - 1 }, (_, i) => (
                <li key={i}>• {i + 1}-spread.jpg</li>
              ))}
            </ul>
            Check your Downloads folder
          </div>
          <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
            <button className="button" onClick={onStartVideoGeneration}>
              Generate Videos
            </button>
            <button className="button secondary" onClick={onUploadNew}>
              Upload Another Book
            </button>
          </div>
        </div>
        {previewImage && <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />}
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-title">3D BOOK RENDERS</div>
        {renderGenerationStatus()}
      </div>
      <div className="center-dashboard">
        <div className="dashboard-title">🎨 Generating 3D Book Images...</div>
        <div className="dashboard-subtitle">
          Progress: {progress.current} of {progress.total} complete
        </div>
        <div style={{ width: '100%', maxWidth: '500px', marginTop: '20px' }}>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            >
              {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
            </div>
          </div>
        </div>
        <div className="dashboard-subtitle" style={{ marginTop: '30px' }}>
          All images auto-downloading to your Downloads folder
        </div>
      </div>
      {previewImage && <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  )
}

function ImagePreviewModal({ image, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content image-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>
        <img src={image.url} alt={image.label} className="preview-full-image" />
        <h3 style={{ marginTop: '12px', textAlign: 'center' }}>{image.label}</h3>
      </div>
    </div>
  )
}

export default GenerationDashboard

