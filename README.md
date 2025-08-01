# Puppeteer GitHub Action

A GitHub Action to screenshot any URL with a timestamp.
Video can be optionally created from this Action.

## Inputs

| Name             | Required | Default        | Description                                                                |
| ---------------- | -------- | -------------- | -------------------------------------------------------------------------- |
| `url`            | Yes      | *(none)*       | The URL to screenshot.                                                     |
| `folder`         | Yes      | `timeline`     | The folder to save screenshots (and the output video) in.                  |
| `basename`       | Yes      | `screenshot`   | The base name for the screenshot files (e.g., `screenshot_123456.png`).    |
| `make_video`     | No       | `false`        | Whether to generate a video timeline from screenshots (`true` or `false`). |
| `video_name`     | No       | `timeline.mp4` | Output video name (e.g., `timeline.mp4`).                                  |
| `frame_duration` | No       | `1`            | How long (in seconds) each image should display in the video.              |
| `scale_width`    | No       | `640`          | Width of the output video in pixels (height auto-scales).                  |


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
          url: http://localhost:3000
          folder: timeline
          basename: screenshot
          make_video: true
          video_name: timeline.mp4
          frame_duration: 1
          scale_width: 640

      # 'git add -A' assumes your .gitignore is set in a way that these are the only unstaged changes. Otherwise specify the folder name used above, for 'git add'.
      - name: Commit screenshots
        run: |
          git config --global user.email "action@github.com"
          git config --global user.name "GitHub Action"
          git add -A
          git commit -m "Add/update visual screenshots [skip ci]" || echo "No changes to commit"
          git push origin HEAD:${{ github.ref }}
```


### Commentary

## Annoyances with Node.JS Workflows, per GPT:

> Yeah, I get your frustration—you're not alone!
This is one of the few rough edges in GitHub Actions:
Node.js (JavaScript) actions can only use what is already installed in the runner’s environment.
If your action needs a tool like ffmpeg that isn’t guaranteed to be present, the user has to install it in their workflow.

**Resolution**: This was converted to be a 'Docker action' by submitting Dockerfile and using that as the environment for the Action instead of 'ubuntu-latest'.

