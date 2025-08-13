---
description: Repository Information Overview
alwaysApply: true
---

# Puppeteer Action Information

## Summary
A GitHub Action that uses Puppeteer to take screenshots of web pages with timestamps. It can also generate animated GIFs from a series of screenshots. The action is containerized using Docker to ensure all dependencies (including Chromium and ffmpeg) are available.

## Structure
- **/.github/workflows**: Contains GitHub workflow configuration files
- **/doc**: Documentation images showing repository settings
- **/*.js**: Main JavaScript code for the action
- **/Dockerfile**: Docker configuration for the action
- **/action.yml**: GitHub Action definition file

## Language & Runtime
**Language**: JavaScript (Node.js)
**Version**: Node.js 20 (specified in Dockerfile)
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- @actions/core: 1.11.1 - GitHub Actions core functionality
- puppeteer: 24.15.0 - Headless browser automation
- wait-on: 8.0.4 - Resource availability checker

## Build & Installation
```bash
npm ci
```

## Docker
**Dockerfile**: Dockerfile
**Base Image**: node:20
**Additional Packages**:
- chromium
- ffmpeg
- fonts-dejavu-core
- iproute2

**Environment Variables**:
- PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
- PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

## Usage
The action is configured through the following inputs:
- `url`: The URL to screenshot (required)
- `folder`: Directory to save screenshots (default: timeline)
- `basename`: Base name for screenshot files (default: screenshot)
- `make_gif`: Whether to generate an animated GIF (default: false)
- `gif_name`: Output GIF filename (default: timeline.gif)
- `frame_duration`: Duration each image displays in GIF (default: 1s)
- `scale_width`: Width of output GIF (default: 640px)

Example workflow:
```yaml
- name: Take and save visual screenshot
  uses: ashfordhill/puppeteer-action@v1
  with:
    url: http://localhost:3000
    folder: timeline
    basename: screenshot
    make_gif: true
    gif_name: timeline.gif
    frame_duration: 1
    scale_width: 640
```

## Main Functionality
1. Takes screenshots of specified URLs using Puppeteer
2. Saves timestamped screenshots and updates a "-latest" version
3. Creates animated GIFs from a series of screenshots using ffmpeg
4. Handles localhost URL rewriting for container-to-host communication