import { saveToIndexedDB } from './indexedDB'

const API_KEY = import.meta.env.VITE_NANO_BANANA_API_KEY
const API_BASE_URL = import.meta.env.VITE_NANO_BANANA_API_URL || 'https://generativelanguage.googleapis.com'

// Use proxy in development to avoid CORS, direct URL in production
// In production (Cloudflare Pages), API calls go directly to Google's API
const API_URL = import.meta.env.DEV
  ? '/google-api'  // Use Vite proxy in development
  : '/api/google'  // Use Cloudflare Function in production

// Prompts
const PROMPT_1_COVER = `Create a photorealistic 3D render of the book based on the provided cover design.

Book Specifications:
Analyze the uploaded cover to determine the layout dimensions (vertical/square/horizontal format)
Page count: 24 pages
Calculate appropriate spine thickness based on page count (approximately page count ÷ 4 in millimeters)

3D Book Presentation:
Position the book at a three-quarter angle view, slightly tilted to showcase both the front cover and spine simultaneously
The book should appear resting on a surface with natural depth and dimension
Apply photorealistic lighting that creates subtle shadows beneath the book and gentle highlights on the cover surface
Show slight page separation visible at the top edge to demonstrate the book's physical depth

Environment Design:
Create a soft, minimalist photography studio setting with a clean, neutral backdrop
Generate a gentle gradient background using 2-3 complementary colors extracted from the book's cover palette
Ensure the background subtly echoes the book's visual theme without competing with or distracting from the main subject
Apply diffused natural lighting from the upper left, creating soft shadows that enhance three-dimensionality
Keep the environment professional and clean, resembling premium product photography where the book is the hero element

Camera & Composition:
Medium shot with shallow depth of field
Eye-level perspective with slight downward angle
Position the book to occupy approximately 60-70% of the frame
Maintain crisp focus on the book cover with gentle background blur for visual separation

Output Style: The final render should resemble premium product photography for a publisher's catalog—clean, professional, inviting, and emphasizing the book's physical quality and cover design artistry.`

const PROMPT_2_FIRST_INTERIOR = `Create a photorealistic 3D render of an open book showing two interior pages, using the provided 3D book cover as a reference for style, environment, and physical properties.

Reference Analysis:
Analyze the provided 3D book cover image to understand the book's physical dimensions, cover finish, spine thickness, and environmental setting
Match the exact lighting setup, background gradient colors, and studio atmosphere from the reference 3D cover
Maintain complete visual consistency with the established photographic style

Book Interior Specifications:
Display the book fully open and lying completely flat. The book is viewed from directly overhead with the camera looking straight down, both pages equally visible in a top-down perspective.
Avoid dramatic angles, side views, or tilted perspectives
The two pages should appear as adjacent spreads in the open book
Show natural page curvature where the pages meet at the spine, with subtle shadowing in the gutter (center crease)
Pages should have photorealistic lighting that creates soft shadows in the spine gutter and subtle highlights on the paper surface
ALWAYS depict text page on the left and image page on the right 
The book should fill 70-80% of the frame with even margins around all edges
Keep the horizon line level and straight—no diagonal or skewed compositions

Environment Matching:
Use the identical gradient background colors and tones from the provided 3D book cover reference
Match the lighting direction, intensity, and softness from the reference image
Keep the background appropriately blurred to ensure the open pages remain the focal point
The overall atmosphere should feel like a continuation of the same photoshoot from the 3D cover image

Output Style: The final render should appear as if it's from the same professional product photography session as the 3D cover reference—maintaining identical environmental conditions, lighting quality, and photographic style for complete visual cohesion. The camera angle should be consistent, professional, and flattering, showing the open book in a clear, readable overhead perspective.`

const PROMPT_3_REMAINING_INTERIORS = `Using the 3 provided reference images, recreate the open book image while ONLY replacing the content on the two interior pages with the new page images provided.

Reference Images Provided:
Open book template image (showing book structure, lighting, angle, environment)
Left page flat image (new content for left page)
Right page flat image (new content for right page)

What MUST Stay Exactly the Same:
Book's physical position, angle, and orientation from reference image #1
Camera angle (top-down overhead perspective)
Book dimensions, spine thickness, and page curvature
Lighting direction, intensity, and shadow placement
Background gradient colors and blur
Gutter shadows and paper highlights
Page texture and paper quality
Environmental atmosphere and studio setting
Margins and framing (book fills 70-80% of frame)
Overall composition and spatial layout

What Changes:
Apply the left page flat image (#2) onto the left page of the open book
Apply the right page flat image (#3) onto the right page of the open book
Map these flat images naturally onto the book pages, respecting the page curvature at the spine and the perspective of the open book

Critical Requirements:
Maintain EXACT camera position and book placement from reference open book image
Keep identical lighting setup - shadows must fall in the same direction
Preserve the same page curvature and natural paper bend at the spine
The new page content should appear naturally printed on the pages, not pasted or floating
Match exact depth, perspective, and dimensional qualities from the reference
The result should look like the same physical book from the same photoshoot, just turned to different pages.`

async function generateImage(prompt, images = {}) {
  if (!API_KEY) {
    throw new Error('Google API key not configured. Please set VITE_NANO_BANANA_API_KEY in .env')
  }

  // Nano Banana Pro model: gemini-3-pro-image-preview
  const MODEL = 'gemini-3-pro-image-preview'
  const endpoint = `/v1beta/models/${MODEL}:generateContent`

  try {
    // Build parts array for Gemini API
    const parts = []

    // Add text prompt
    parts.push({ text: prompt })

    // Add reference images if provided
    if (images.image) {
      // For cover generation with reference image
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: images.image
        }
      })
    }

    // For spread generation - add reference and page images
    if (images.reference_image) {
      let imageData = images.reference_image

      // If it's a data URL, extract the base64 part
      if (typeof imageData === 'string' && imageData.startsWith('data:')) {
        const matches = imageData.match(/data:([^;]+);base64,(.+)/)
        if (matches) {
          const mimeType = matches[1]
          imageData = matches[2]
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: imageData
            }
          })
        }
      } else if (typeof imageData === 'string' && !imageData.startsWith('http')) {
        // Assume it's already base64
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageData
          }
        })
      } else if (imageData.startsWith('http')) {
        // If it's a URL, we'd need to fetch it, but for now skip
        console.warn('Reference image URL not yet supported, skipping')
      }
    }

    if (images.left_page_image) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: images.left_page_image
        }
      })
    }

    if (images.right_page_image) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: images.right_page_image
        }
      })
    }

    const payload = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "2K"
        }
      }
    }

    const fullUrl = `${API_URL}${endpoint}?key=${API_KEY}`

    const headers = {
      'Content-Type': 'application/json'
    }

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    if (response.ok) {
      const result = await response.json()

      // Nano Banana Pro (Gemini) returns images in candidates[0].content.parts
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0]
        if (candidate.content && candidate.content.parts) {
          // Find the first image part
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const mimeType = part.inlineData.mimeType || 'image/jpeg'
              return `data:${mimeType};base64,${part.inlineData.data}`
            }
          }
        }
      }

      throw new Error('No image found in Nano Banana Pro API response')
    }

    // For other errors, log and throw
    let errorText = ''
    try {
      errorText = await response.text()
      const errorJson = JSON.parse(errorText)
      console.error(`Nano Banana Pro API error:`, errorJson)
    } catch (e) {
      console.error(`Failed to parse error response:`, e)
    }

    throw new Error(`Nano Banana Pro API error: ${response.status} - ${errorText || response.statusText}`)
  } catch (error) {
    console.error('Image generation error:', error)
    throw error
  }
}

export async function generateAllImages(extractedPages, onProgressUpdate, onImageGenerated) {
  const generatedImages = {}
  const spreadCount = Math.floor((Object.keys(extractedPages).length - 1) / 2)
  const total = spreadCount + 1 // +1 for cover

  let currentProgress = {
    current: 0,
    total,
    status: {}
  }

  // Initialize status
  currentProgress.status['cover'] = 'pending'
  for (let i = 1; i <= spreadCount; i++) {
    currentProgress.status[`spread-${i}`] = 'pending'
  }
  onProgressUpdate({ ...currentProgress })

  // Step 1: Generate Cover
  try {
    currentProgress.status['cover'] = 'generating'
    onProgressUpdate({ ...currentProgress })

    const coverPage = extractedPages['Cover Page']
    if (!coverPage) {
      throw new Error('Cover page not found')
    }

    const coverUrl = await generateImage(PROMPT_1_COVER, {
      image: coverPage.base64
    })

    generatedImages['cover'] = {
      url: coverUrl,
      generatedAt: new Date().toISOString(),
      downloaded: false
    }

    currentProgress.status['cover'] = 'complete'
    currentProgress.current = 1
    onProgressUpdate({ ...currentProgress })
    await saveToIndexedDB('generatedImages', generatedImages)

    if (onImageGenerated) {
      await onImageGenerated('cover', coverUrl)
    }
  } catch (error) {
    console.error('Cover generation error:', error)
    currentProgress.status['cover'] = 'failed'
    onProgressUpdate({ ...currentProgress })
    throw error
  }

  // Step 2: Generate Spread 1
  let spread1Url = null
  try {
    currentProgress.status['spread-1'] = 'generating'
    onProgressUpdate({ ...currentProgress })

    const leftPage = extractedPages['1-left']
    const rightPage = extractedPages['1-right']

    if (!leftPage || !rightPage) {
      throw new Error('Missing pages for spread 1')
    }

    spread1Url = await generateImage(PROMPT_2_FIRST_INTERIOR, {
      reference_image: generatedImages['cover'].url,
      left_page_image: leftPage.base64,
      right_page_image: rightPage.base64
    })

    generatedImages['spread-1'] = {
      url: spread1Url,
      generatedAt: new Date().toISOString(),
      downloaded: false
    }

    currentProgress.status['spread-1'] = 'complete'
    currentProgress.current = 2
    onProgressUpdate({ ...currentProgress })
    await saveToIndexedDB('generatedImages', generatedImages)

    if (onImageGenerated) {
      await onImageGenerated('spread-1', spread1Url)
    }
  } catch (error) {
    console.error('Spread 1 generation error:', error)
    currentProgress.status['spread-1'] = 'failed'
    onProgressUpdate({ ...currentProgress })
    throw error
  }

  // Step 3: Generate Remaining Spreads (in parallel)
  if (spreadCount > 1 && spread1Url) {
    const promises = []

    for (let i = 2; i <= spreadCount; i++) {
      const leftPage = extractedPages[`${i}-left`]
      const rightPage = extractedPages[`${i}-right`]

      if (leftPage && rightPage) {
        promises.push(
          generateSpread(i, spread1Url, leftPage, rightPage, generatedImages, currentProgress, onProgressUpdate, onImageGenerated)
        )
      }
    }

    await Promise.all(promises)
  }

  return generatedImages
}

async function generateSpread(spreadNum, spread1Reference, leftPage, rightPage, generatedImages, currentProgress, onProgressUpdate, onImageGenerated) {
  try {
    currentProgress.status[`spread-${spreadNum}`] = 'generating'
    onProgressUpdate({ ...currentProgress })

    const spreadUrl = await generateImage(PROMPT_3_REMAINING_INTERIORS, {
      reference_image: spread1Reference,
      left_page_image: leftPage.base64,
      right_page_image: rightPage.base64
    })

    generatedImages[`spread-${spreadNum}`] = {
      url: spreadUrl,
      generatedAt: new Date().toISOString(),
      downloaded: false
    }

    currentProgress.status[`spread-${spreadNum}`] = 'complete'
    currentProgress.current += 1
    onProgressUpdate({ ...currentProgress })
    await saveToIndexedDB('generatedImages', generatedImages)

    if (onImageGenerated) {
      await onImageGenerated(`spread-${spreadNum}`, spreadUrl)
    }
  } catch (error) {
    console.error(`Spread ${spreadNum} generation error:`, error)
    currentProgress.status[`spread-${spreadNum}`] = 'failed'
    onProgressUpdate({ ...currentProgress })
    // Continue with other spreads even if one fails
  }
}

