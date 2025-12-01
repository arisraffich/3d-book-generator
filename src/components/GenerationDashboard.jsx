
function GenerationDashboard({
  generatedImages,
  isGenerating,
  progress,
  onUploadNew
}) {
  function getStatusIcon(status) {
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
            className="status-image"
          />
        )}
        <div className="status-details">
          {coverStatus === 'complete' ? 'Downloaded ✓' : 
           coverStatus === 'generating' ? 'Generating...' : 
           coverStatus === 'failed' ? 'Failed - will retry' : 'Pending...'}
        </div>
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
              className="status-image"
            />
          )}
          <div className="status-details">
            {spreadStatus === 'complete' ? 'Downloaded ✓' : 
             spreadStatus === 'generating' ? 'Generating...' : 
             spreadStatus === 'failed' ? 'Failed - will retry' : 'Pending...'}
          </div>
        </div>
      )
    }
    
    return items
  }

  if (!isGenerating && progress.current === progress.total && progress.total > 0) {
    // Completion view
    return (
      <div className="dashboard-container">
        <div className="sidebar">
          <div className="sidebar-title">3D BOOK RENDERS</div>
          {renderGenerationStatus()}
        </div>
        <div className="center-dashboard">
          <div className="dashboard-title">✅ All Images Generated!</div>
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
          <button className="button" onClick={onUploadNew}>
            🔄 Generate Another Book
          </button>
        </div>
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
    </div>
  )
}

export default GenerationDashboard

