# Puppeteer GitHub Action

A GitHub Action to screenshot any URL with a timestamp.
An animated GIF can be optionally created from a series of screenshots.

## Inputs

| Name             | Required | Default        | Description                                                                |
| ---------------- | -------- | -------------- | -------------------------------------------------------------------------- |
| `url`            | Yes      | *(none)*       | The URL to screenshot.                                                     |
| `folder`         | Yes      | `timeline`     | The folder to save screenshots (and the output GIF) in.                    |
| `basename`       | Yes      | `screenshot`   | The base name for the screenshot files (e.g., `screenshot_123456.png`).    |
| `make_gif`       | No       | `false`        | Whether to generate an animated GIF from screenshots (`true` or `false`).  |
| `gif_name`       | No       | `timeline.gif` | Output GIF name (e.g., `timeline.gif`).                                    |
| `frame_duration` | No       | `1`            | How long (in seconds) each image should display in the GIF.                |
| `scale_width`    | No       | `640`          | Width of the output GIF in pixels (height auto-scales).                    |
| `auto_screenshots` | No     | `true`         | Control screenshot behavior: `true` = always take screenshots, `false` = only when commit message contains `#screenshot`. |


## Auto Screenshots Feature

The `auto_screenshots` input allows you to control when screenshots are taken:

- **`true` (default)**: Screenshots are always taken when the action runs
- **`false`**: Screenshots are only taken when the latest non-bot commit message contains `#screenshot`

When `auto_screenshots` is set to `false`, the action will:
1. Look through recent commit history (last 10 commits)
2. Find the most recent commit that wasn't made by GitHub Actions bot or other bots
3. Check if that commit message contains `#screenshot`
4. Only take a screenshot if `#screenshot` is found

This is useful for:
- Reducing unnecessary screenshots on every commit
- Only capturing visual changes when explicitly requested
- Saving on action runtime and storage

**Note**: When using `auto_screenshots: false`, you must provide a `GITHUB_TOKEN` environment variable so the action can access commit history.

## Setup

To allow GitHub Actions to commit files, you need to set the following permissions in your repository:
![](doc/repository-settings.png)

![](doc/read-write-settings.png)

## Example Workflows

### Basic Usage (Always Take Screenshots)

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
          make_gif: true
          gif_name: timeline.gif
          frame_duration: 1
          scale_width: 640
          auto_screenshots: true  # Default behavior

      # 'git add -A' assumes your .gitignore is set in a way that these are the only unstaged changes. Otherwise specify the folder name used above, for 'git add'.
      - name: Commit screenshots
        run: |
          git config --global user.email "action@github.com"
          git config --global user.name "GitHub Action"
          git add -A
          git commit -m "Add/update visual screenshots [skip ci]" || echo "No changes to commit"
          git push origin HEAD:${{ github.ref }}
```

### Conditional Screenshots (Only When Requested)

``` yaml
name: Conditional Screenshot Generator

on: [push, pull_request]

jobs:
  conditional-screenshot:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 10  # Fetch recent commits for history check
          
      - name: Take screenshot only when requested
        uses: ashfordhill/puppeteer-action@v1
        with:
          url: http://localhost:3000
          folder: timeline
          basename: screenshot
          make_gif: true
          gif_name: timeline.gif
          auto_screenshots: false  # Only take screenshots when commit contains #screenshot
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # Required for commit history access

      - name: Commit screenshots (if any were taken)
        run: |
          git config --global user.email "action@github.com"
          git config --global user.name "GitHub Action"
          git add -A
          git commit -m "Add/update visual screenshots [skip ci]" || echo "No changes to commit"
          git push origin HEAD:${{ github.ref }}
```

**Usage with conditional mode**: To trigger a screenshot, include `#screenshot` in your commit message:
```bash
git commit -m "Update homepage layout #screenshot"
```


### Commentary

## Annoyances with Node.JS Workflows, per GPT:

> Yeah, I get your frustration—you're not alone!
This is one of the few rough edges in GitHub Actions:
Node.js (JavaScript) actions can only use what is already installed in the runner’s environment.
If your action needs a tool like ffmpeg that isn’t guaranteed to be present, the user has to install it in their workflow.

**Resolution**: This was converted to be a 'Docker action' by submitting Dockerfile and using that as the environment for the Action instead of 'ubuntu-latest'.

