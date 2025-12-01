#!/bin/bash
# Script to push to GitHub after repository is created

# Replace REPO_NAME with your actual repository name (e.g., "3d-book-generator")
REPO_NAME="3d-book-generator"

git remote add origin https://github.com/arisraffich/${REPO_NAME}.git
git branch -M main
git push -u origin main

echo "✅ Pushed to GitHub successfully!"
echo "Repository: https://github.com/arisraffich/${REPO_NAME}"

