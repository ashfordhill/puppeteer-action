# Visual Snapper Action

A reusable GitHub Action to screenshot any URL and always update a `*-latest.png` image.

## Inputs

- `url`: URL to screenshot (required)
- `folder`: Folder to save screenshots (default: `visual-history`)
- `basename`: Basename for images (default: `screenshot`)

## Setup

To allow GitHub Actions to commit files, you need to set the following permissions in your repository:
![](doc/repository-settings.png)

![](doc/read-write-settings.png)

## Example Workflow

``` yaml
name: Screenshot and GIF Generator

on: [push, pull_request]

jobs:
  screenshot-and-gif:
    runs-on: ubuntu-latest
    
    steps:
      - name: Take and save visual screenshot
        uses: ashfordhill/puppeteer-action@v1
        with:
          url: 'http://localhost:3000'
          folder: 'visual-images'
          basename: 'homepage'

      - name: Commit screenshots
        run: |
          git config --global user.email "action@github.com"
          git config --global user.name "GitHub Action"
          git add visual-images/
          git commit -m "Add/update visual screenshots [skip ci]" || echo "No changes to commit"
          git push origin HEAD:${{ github.ref }}
```