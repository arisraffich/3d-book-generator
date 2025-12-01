export async function downloadImage(imageUrl, filename) {
  try {
    let blob
    
    // Handle data URLs (base64 images)
    if (imageUrl.startsWith('data:')) {
      const response = await fetch(imageUrl)
      blob = await response.blob()
    } else {
      // Fetch image as blob from URL
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`)
      }
      blob = await response.blob()
    }

    // Create download link
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  } catch (error) {
    console.error('Download error:', error)
    throw error
  }
}

