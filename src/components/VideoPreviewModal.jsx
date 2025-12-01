import { useEffect, useRef } from 'react'
import { downloadVideo } from '../utils/video'

function VideoPreviewModal({ videoId, videoUrl, videoInfo, onClose }) {
  const videoRef = useRef(null)

  useEffect(() => {
    // Handle ESC key to close
    function handleEsc(e) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  function handleDownload() {
    const filename = videoInfo?.filename || `${videoId}.mp4`
    downloadVideo(videoUrl, filename).catch(error => {
      console.error('Download error:', error)
      alert('Failed to download video')
    })
  }

  function getVideoLabel(videoId) {
    if (videoId === 'opening') {
      return 'Opening Scene'
    }
    // Format: "spread-1-2" -> "Spread 1→2"
    const match = videoId.match(/spread-(\d+)-(\d+)/)
    if (match) {
      return `Spread ${match[1]}→${match[2]}`
    }
    return videoId
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content video-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>
        
        <video 
          ref={videoRef}
          src={videoUrl} 
          controls 
          autoPlay
          style={{ width: '100%', maxWidth: '800px', borderRadius: '8px' }}
        />
        
        <div className="video-info">
          <h3>{getVideoLabel(videoId)}</h3>
          <p>Duration: {videoInfo?.duration || (videoId === 'opening' ? '2s' : '3s')}</p>
          <p>Downloaded: {videoInfo?.filename || `${videoId}.mp4`}</p>
        </div>
        
        <button className="button" onClick={handleDownload} style={{ marginTop: '20px' }}>
          ⬇️ Download Again
        </button>
      </div>
    </div>
  )
}

export default VideoPreviewModal

