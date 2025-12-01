import { useMemo } from 'react'

function PreviewDashboard({ extractedPages, onStartGeneration, onUploadNew }) {
  const stats = useMemo(() => {
    const totalPages = Object.keys(extractedPages).length
    const coverCount = extractedPages['Cover Page'] ? 1 : 0
    const spreadCount = Math.floor((totalPages - coverCount) / 2)
    
    return {
      totalPages,
      coverCount,
      spreadCount
    }
  }, [extractedPages])

  const renderPagePreviews = () => {
    const items = []
    
    // Cover
    if (extractedPages['Cover Page']) {
      items.push(
        <div key="cover" className="page-preview-item">
          <div className="page-label">Cover Page</div>
          <img
            src={`data:image/jpeg;base64,${extractedPages['Cover Page'].base64}`}
            alt="Cover"
            className="page-thumbnail"
          />
        </div>
      )
    }
    
    // Spreads
    let spreadNum = 1
    while (extractedPages[`${spreadNum}-left`] || extractedPages[`${spreadNum}-right`]) {
      items.push(
        <div key={`spread-${spreadNum}`} className="page-preview-item spread">
          {extractedPages[`${spreadNum}-left`] && (
            <div>
              <div className="page-label">{spreadNum}-left</div>
              <img
                src={`data:image/jpeg;base64,${extractedPages[`${spreadNum}-left`].base64}`}
                alt={`${spreadNum}-left`}
                className="page-thumbnail"
              />
            </div>
          )}
          {extractedPages[`${spreadNum}-right`] && (
            <div>
              <div className="page-label">{spreadNum}-right</div>
              <img
                src={`data:image/jpeg;base64,${extractedPages[`${spreadNum}-right`].base64}`}
                alt={`${spreadNum}-right`}
                className="page-thumbnail"
              />
            </div>
          )}
        </div>
      )
      spreadNum++
    }
    
    return items
  }

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-title">EXTRACTED PAGES</div>
        {renderPagePreviews()}
      </div>

      <div className="center-dashboard">
        <div className="dashboard-title">✅ PDF Extracted Successfully</div>
        <div className="dashboard-subtitle">
          <ul className="stats-list">
            <li>Pages extracted: {stats.totalPages}</li>
            <li>• {stats.coverCount} Cover</li>
            <li>• {stats.spreadCount} Spreads ({stats.totalPages - stats.coverCount} interior pages)</li>
          </ul>
          These flat PDF pages will be transformed into 3D book renders.
        </div>
        <button className="button" onClick={onStartGeneration}>
          📸 Generate 3D Book Images
        </button>
        <button className="button button-secondary" onClick={onUploadNew}>
          ↻ Upload Different PDF
        </button>
      </div>
    </div>
  )
}

export default PreviewDashboard


