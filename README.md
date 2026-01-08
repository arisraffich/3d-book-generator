# 3D Book Generator

A frontend-only React application that converts PDF books into photorealistic 3D book page renders.

## Features

- 📄 **PDF Upload** - Drag and drop or click to upload PDF files
- 🖼️ **Page Extraction** - Extracts all pages as high-resolution images using pdf.js
- 👁️ **Preview Dashboard** - View all extracted pages before generation
- 🎨 **3D Rendering** - Generates photorealistic 3D book images using Nano Banana Pro API
- ⬇️ **Auto-Download** - Automatically downloads all generated images
- 💾 **Browser Storage** - Uses IndexedDB to store extracted pages and generated images

## Tech Stack

- **React** - UI framework
- **Vite** - Build tool and dev server
- **pdf.js** - PDF parsing and page extraction
- **IndexedDB** (via idb) - Browser storage
- **Nano Banana Pro API** - Image generation

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API key:**
   - Copy `env.example` to `.env`
   - Add your Nano Banana Pro API key:
     ```
     VITE_NANO_BANANA_API_KEY=your_api_key_here
     VITE_NANO_BANANA_API_URL=https://api.nanobananapro.com
     ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Usage

1. **Upload PDF** - Drag and drop or click to upload a PDF file
2. **Review Extraction** - Preview all extracted pages in the sidebar
3. **Generate 3D Images** - Click "Generate 3D Book Images" to start
4. **Auto-Download** - Images are automatically downloaded as they're generated

## How It Works

1. **PDF Extraction**: Extracts each page as a high-resolution JPEG image (scale 2.0)
2. **Page Organization**: 
   - Page 1 becomes the cover
   - Remaining pages are paired as left/right spreads
3. **3D Generation**:
   - First generates a 3D cover image
   - Then generates the first spread (using cover as reference)
   - Finally generates remaining spreads in parallel (using spread 1 as reference)

## File Structure

```
├── src/
│   ├── components/
│   │   ├── UploadArea.jsx          # File upload interface
│   │   ├── PreviewDashboard.jsx    # Preview extracted pages
│   │   └── GenerationDashboard.jsx # Generation progress & results
│   ├── utils/
│   │   ├── pdfExtractor.js         # PDF page extraction
│   │   ├── indexedDB.js            # Browser storage helpers
│   │   ├── api.js                  # Nano Banana API integration
│   │   └── download.js             # Auto-download functionality
│   ├── App.jsx                     # Main app component
│   ├── App.css                     # Styles
│   └── main.jsx                    # Entry point
├── package.json
├── vite.config.js
└── index.html
```

## Notes

- This is a fully client-side application - no backend required
- API key is exposed in the frontend (acceptable for personal use)
- Requires modern browser with IndexedDB support
- Large PDFs may take time to extract
- Image generation depends on Nano Banana Pro API availability

## Deployment

Deploy to any static hosting service (Vercel, Netlify, etc.):

```bash
npm run build
```

The `dist` folder contains the production build.

## License

MIT


