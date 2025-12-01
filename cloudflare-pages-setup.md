# Cloudflare Pages Setup Guide

## Step 1: Connect Repository to Cloudflare Pages

1. Go to https://dash.cloudflare.com/
2. Navigate to **Pages** in the sidebar
3. Click **Create a project**
4. Click **Connect to Git**
5. Authorize Cloudflare to access your GitHub account (if needed)
6. Select repository: `arisraffich/3d-book-generator`
7. Click **Begin setup**

## Step 2: Configure Build Settings

**Framework preset:** Vite
**Build command:** `npm run build`
**Build output directory:** `dist`
**Root directory:** `/` (leave as is)

## Step 3: Environment Variables

Add these environment variables in Cloudflare Pages:

1. Go to **Settings** → **Environment variables**
2. Add these variables:

   - **Variable name:** `VITE_NANO_BANANA_API_KEY`
   - **Value:** `AIzaSyAkAKUQVjqBBAT2jF2_Y_MZyWgcR1X9Wh0`
   - **Environment:** Production, Preview, and Development

   - **Variable name:** `VITE_NANO_BANANA_API_URL`
   - **Value:** `https://generativelanguage.googleapis.com`
   - **Environment:** Production, Preview, and Development

## Step 4: Deploy

1. Click **Save and Deploy**
2. Cloudflare will build and deploy your app
3. You'll get a public URL like: `https://3d-book-generator.pages.dev`

## Important Notes

- The app will use direct API calls in production (no proxy needed)
- Your API key will be in the built JavaScript (acceptable for personal use)
- Cloudflare Pages provides free SSL and CDN
- Each git push to main branch will trigger automatic deployments

