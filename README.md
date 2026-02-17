# Puppeteer GitHub Action

<div align="center" style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
  <img src="doc/timeline.gif" alt="EXAMPLE_GIF" width="300" style="margin:0 8px;" />
  <img src="doc/screenshot-latest.png" alt="EXAMPLE_PNG" width="300" style="margin:0 8px;" />
</div>

#

<div align ="center"><a href="https://github.com/ashfordhill/ashhill.dev/blob/main/.github/workflows/puppeteer.yml">Used in this repo</a></div>

#


A GitHub Action to screenshot any URL with a timestamp.

An animated GIF or video can be optionally created from the page.

## Inputs

| Name             | Required | Default        | Description                                                                |
| ---------------- | -------- | -------------- | -------------------------------------------------------------------------- |
| `url`            | Yes      | *(none)*       | The URL to screenshot or record.                                           |
| `auto_record`     | No       | `true`         | `true` = always record, `false` = only when commit message contains `#record`. |
| `folder`         | Yes      | `timeline`     | The folder to save outputs in.                                             |
| `screenshot_base_name` | Yes | `screenshot`  | The base name for the screenshot files.                                    |
| `make_gif`       | No       | `false`        | Whether to generate an animated GIF from screenshots.                      |
| `gif_name`       | No       | `timeline.gif` | Output GIF name.                                                           |
| `gif_frame_duration` | No       | `1`            | How long (in seconds) each image should display in the GIF.                |
| `gif_scale_width`    | No       | `640`          | Width of the output GIF in pixels (height auto-scales).                    |
| `video_format`     | No       | `none`         | Output format(s) for the video. Options: `mp4`, `gif`, or `mp4,gif`. Set to `none` to disable. |
| `video_base_name` | No      | `video`        | Base name for the video file (extension added automatically).              |
| `video_duration_seconds` | No       | `10`           | Duration to record video in seconds.                                       |
| `video_speed_multiplier` | No  | `1`            | Speed up factor for the video (e.g., 2 for 2x speed, 0.5 for 50% slower).   |

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
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Capture and save visual records
        uses: ashfordhill/puppeteer-action@v9
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          url: http://localhost:3000
          auto_record: true
          folder: timeline
          screenshot_base_name: screenshot
          make_gif: true
          gif_name: timeline.gif
          gif_frame_duration: 1
          gif_scale_width: 640
          video_format: mp4,gif
          video_base_name: video
          video_duration_seconds: 10
          video_speed_multiplier: 2

      - name: Commit visual records
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "Add/update visual records [skip ci]"
          file_pattern: "*.png *.gif *.mp4"
```

**Usage with "auto_record: false"**

To trigger a recording with this setting, include `#record` in your commit message:
```bash
git commit -m "Update homepage layout #record"
```

## Future Considerations

- Multi-URL screenshots
  - Include additional URLs to visit and screenshot, in order of their listing. 
  - For the GIF creation feature, may want to store screenshots by folder per-URL to keep them in separate GIFs

- Multi-element screenshots
  - Take in configurable `n` amount of elements for Puppeteer to click on. May need delay settings as well.

- Mobile view/configurable layout view screenshots 
