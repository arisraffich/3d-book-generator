import { useState } from 'react'
import VideoPreviewModal from './VideoPreviewModal'
import { downloadVideo } from '../utils/video'

function VideoGenerationDashboard({
  generatedImages,
  generatedVideos,
  isGeneratingVideos,
  videoProgress,
  onStartVideoGeneration,
  onRegenerateVideo,
  onUploadNew
}) {
  const [previewVideoId, setPreviewVideoId] = useState(null)

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

  function getVideoLabel(videoId) {
    if (videoId === 'opening') {
      return 'Opening'
    }
    const match = videoId.match(/spread-(\d+)-(\d+)/)
    if (match) {
      return `Spread ${match[1]}→${match[2]}`
    }
    return videoId
  }

  function renderVideoStatus() {
    const items = []
    const total = videoProgress.total

    // Opening video
    const openingStatus = videoProgress.status['opening'] || 'pending'
    const openingVideo = generatedVideos['opening']
    const openingImage = generatedImages['cover'] // Use cover as thumbnail

    items.push(
      <div key="opening" className={`generation-status-item ${openingStatus}`}>
        <div className="status-header">
          <span className="status-icon">{getStatusIcon(openingStatus)}</span>
          <span className="status-name">{getVideoLabel('opening')}</span>
        </div>
        {openingImage && (
          <div
            className="video-thumbnail"
            onClick={() => openingStatus === 'complete' && openingVideo && setPreviewVideoId('opening')}
            style={{ cursor: openingStatus === 'complete' ? 'pointer' : 'default' }}
          >
            <img
              src={openingImage.url}
              alt="Opening thumbnail"
              className="status-image"
            />
            {openingStatus === 'complete' && (
              <div className="play-overlay">▶</div>
            )}
          </div>
        )}
        <div className="status-details">
          {getStatusText(openingStatus)}
        </div>
        {(openingStatus === 'complete' || openingStatus === 'failed') && (
          <button
            className="regenerate-btn"
            onClick={() => onRegenerateVideo('opening')}
          >
            ↻ Regenerate
          </button>
        )}
      </div>
    )

    // Flip videos
    const spreadCount = Object.keys(generatedImages).filter(k => k.startsWith('spread-')).length
    for (let i = 1; i < spreadCount; i++) {
      const videoId = `spread-${i}-${i + 1}`
      const videoStatus = videoProgress.status[videoId] || 'pending'
      const video = generatedVideos[videoId]
      const startSpreadKey = `spread-${i}`
      const thumbnailImage = generatedImages[startSpreadKey]

      items.push(
        <div key={videoId} className={`generation-status-item ${videoStatus}`}>
          <div className="status-header">
            <span className="status-icon">{getStatusIcon(videoStatus)}</span>
            <span className="status-name">{getVideoLabel(videoId)}</span>
          </div>
          {thumbnailImage && (
            <div
              className="video-thumbnail"
              onClick={() => videoStatus === 'complete' && video && setPreviewVideoId(videoId)}
              style={{ cursor: videoStatus === 'complete' ? 'pointer' : 'default' }}
            >
              <img
                src={thumbnailImage.url}
                alt={`${videoId} thumbnail`}
                className="status-image"
              />
              {videoStatus === 'complete' && (
                <div className="play-overlay">▶</div>
              )}
            </div>
          )}
          <div className="status-details">
            {getStatusText(videoStatus)}
          </div>
          {(videoStatus === 'complete' || videoStatus === 'failed') && (
            <button
              className="regenerate-btn"
              onClick={() => onRegenerateVideo(videoId)}
            >
              ↻ Regenerate
            </button>
          )}
        </div>
      )
    }

    return items
  }

  // Check completion by status values, not counter (handles regenerated videos properly)
  const allComplete = videoProgress.total > 0 && 
    Object.keys(videoProgress.status).length === videoProgress.total &&
    Object.values(videoProgress.status).every(s => s === 'complete')

  if (!isGeneratingVideos && allComplete) {
    // Completion view
    return (
      <div className="dashboard-container">
        <div className="sidebar">
          <div className="sidebar-title">VIDEOS</div>
          {renderVideoStatus()}
        </div>
        <div className="center-dashboard">
          <div className="dashboard-title">✅ All Videos Generated!</div>
          <div className="dashboard-subtitle">
            {videoProgress.total} videos created and downloaded:
            <ul className="stats-list">
              <li>• opening.mp4</li>
              {Array.from({ length: videoProgress.total - 1 }, (_, i) => {
                const videoId = `spread-${i + 1}-${i + 2}`
                return <li key={i}>• {videoId}.mp4</li>
              })}
            </ul>
            Check your Downloads folder
          </div>
          <button className="button" onClick={onUploadNew}>
            📚 Upload Another Book
          </button>
        </div>
        {previewVideoId && generatedVideos[previewVideoId] && (
          <VideoPreviewModal
            videoId={previewVideoId}
            videoUrl={generatedVideos[previewVideoId].url}
            videoInfo={generatedVideos[previewVideoId]}
            onClose={() => setPreviewVideoId(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-title">VIDEOS</div>
        {renderVideoStatus()}
      </div>
      <div className="center-dashboard">
        <div className="dashboard-title">🎬 Generating Videos...</div>
        <div className="dashboard-subtitle">
          Progress: {videoProgress.current} of {videoProgress.total} complete
        </div>
        <div style={{ width: '100%', maxWidth: '500px', marginTop: '20px' }}>
          <div className="progress-bar-container">
            <div
              className="progress-bar"
              style={{ width: `${videoProgress.total > 0 ? (videoProgress.current / videoProgress.total) * 100 : 0}%` }}
            >
              {videoProgress.total > 0 ? Math.round((videoProgress.current / videoProgress.total) * 100) : 0}%
            </div>
          </div>
        </div>
        <div className="dashboard-subtitle" style={{ marginTop: '30px' }}>
          All videos auto-downloading to your Downloads folder
        </div>
      </div>
      {previewVideoId && generatedVideos[previewVideoId] && (
        <VideoPreviewModal
          videoId={previewVideoId}
          videoUrl={generatedVideos[previewVideoId].url}
          videoInfo={generatedVideos[previewVideoId]}
          onClose={() => setPreviewVideoId(null)}
        />
      )}
    </div>
  )
}

export default VideoGenerationDashboard

