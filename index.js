// index.js
const core = require('@actions/core');
const github = require('@actions/github');
const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const waitOn = require('wait-on');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function guessHostIP() {
  try {
    const route = execSync("ip route | awk '/default/ {print $3}'").toString().trim();
    return route || null;
  } catch (e) {
    core.warning(`Could not detect host IP: ${e.message}`);
    return null;
  }
}

async function shouldTakeScreenshot(autoScreenshots) {
  // If auto_screenshots is true, always take screenshots
  if (autoScreenshots === 'true') {
    core.info('Auto screenshots enabled - taking screenshot');
    return true;
  }

  // If auto_screenshots is false, check commit message for #screenshot
  core.info('Auto screenshots disabled - checking commit messages for #screenshot');
  
  try {
    // Get the GitHub context
    const context = github.context;
    
    // We need a GitHub token to access the API
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      core.warning('GITHUB_TOKEN not found. Cannot check commit messages. Skipping screenshot.');
      return false;
    }

    const octokit = github.getOctokit(token);
    
    // Get recent commits
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 10 // Check last 10 commits
    });

    // Look for the latest commit that wasn't from GitHub Actions bot
    for (const commit of commits) {
      const author = commit.author?.login || commit.commit.author?.name || '';
      const committer = commit.committer?.login || commit.commit.committer?.name || '';
      
      // Skip commits from GitHub Actions bot
      if (author.includes('github-actions') || 
          committer.includes('github-actions') ||
          author.includes('[bot]') ||
          committer.includes('[bot]')) {
        core.info(`Skipping bot commit: ${commit.sha.substring(0, 7)} - ${commit.commit.message.split('\n')[0]}`);
        continue;
      }

      // Check if this commit message contains #screenshot
      const message = commit.commit.message;
      core.info(`Checking commit ${commit.sha.substring(0, 7)}: ${message.split('\n')[0]}`);
      
      if (message.includes('#screenshot')) {
        core.info('Found #screenshot in commit message - taking screenshot');
        return true;
      } else {
        core.info('No #screenshot found in latest non-bot commit - skipping screenshot');
        return false;
      }
    }

    core.info('No non-bot commits found in recent history - skipping screenshot');
    return false;
    
  } catch (error) {
    core.warning(`Error checking commit messages: ${error.message}. Skipping screenshot.`);
    return false;
  }
}

async function createGifFromScreenshots(folder, base, gifName, frameDuration, scaleWidth) {
  const allFiles = fs.readdirSync(folder);
  core.info(`Found ${allFiles.length} total files in ${folder}`);

  const files = allFiles
    .filter(f => f.endsWith('.png') && !f.endsWith('-latest.png'))
    .sort();

  core.info(`Found ${files.length} PNG files (excluding -latest.png)`);
  if (files.length < 2) {
    core.warning('Not enough screenshots for a GIF. Need at least 2.');
    return;
  }

  const timestamp = Date.now();
  const tmpDir = path.join(folder, `__ffmpeg_tmp_${timestamp}__`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Copy files with sequential names and burn timestamp from filename into each
  core.info('Copying files to temporary directory with burned timestamps...');
  files.forEach((f, i) => {
    const match = f.match(/_(\d+)\.png$/);
    let label = '';
    if (match) {
      const ts = parseInt(match[1], 10);
      const d = new Date(ts);
      label = `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()} ${d.toLocaleTimeString()}`;
    } else {
      label = 'No timestamp';
    }

    // Escape special characters for ffmpeg drawtext
    const safeLabel = label.replace(/:/g, '\\:').replace(/'/g, "\\\\'");
  
    const sourcePath = path.join(folder, f);
    const destPath = path.join(tmpDir, `img${String(i).padStart(4, '0')}.png`);
  
    execSync(
      `ffmpeg -y -i "${sourcePath}" -vf "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${safeLabel}':x=w-tw-10:y=h-th-10:fontsize=24:fontcolor=lime:box=1:boxcolor=black@0.5
" "${destPath}"`,
      { stdio: 'inherit', shell: true }
    );
    core.info(`Processed ${f} -> ${path.basename(destPath)} with label "${label}"`);
  });

  const gifPath = path.join(folder, gifName);

  try {
    const fps = (1 / parseFloat(frameDuration)).toFixed(2);
    const simpleCmd = [
      'ffmpeg', '-y',
      '-framerate', fps,
      '-i', path.join(tmpDir, 'img%04d.png'),
      '-vf', `scale=${scaleWidth}:-1:flags=lanczos`,
      '-loop', '0',
      gifPath
    ].join(' ');

    core.info(`Using command: ${simpleCmd}`);
    execSync(simpleCmd, { stdio: 'inherit', shell: true });

    if (fs.existsSync(gifPath)) {
      const stats = fs.statSync(gifPath);
      core.info(`GIF created successfully at: ${gifPath} (${stats.size} bytes)`);
      core.setOutput('gif_path', gifPath);
    } else {
      throw new Error('GIF file was not created');
    }
  } finally {
    setTimeout(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        core.info(`Cleaned up temporary directory: ${tmpDir}`);
      } catch (cleanupErr) {
        core.warning(`Failed to clean up temporary directory: ${cleanupErr.message}`);
      }
    }, 1000);
  }
}

(async () => {
  try {
    const folder = core.getInput('folder');
    const basename = core.getInput('base_screenshot_name');
    const makeGif = core.getInput('make_gif') === 'true';
    const gifName = core.getInput('gif_name');
    const frameDuration = core.getInput('frame_duration'); // seconds per frame
    const scaleWidth = core.getInput('scale_width');
    const autoScreenshots = core.getInput('auto_screenshots');
    
    const videoFormatInput = core.getInput('video_format').toLowerCase();
    const videoFormats = videoFormatInput === 'none' ? [] : videoFormatInput.split(',').map(f => f.trim());
    const makeVideo = videoFormats.length > 0;
    
    const videoDuration = parseInt(core.getInput('video_duration'), 10);
    const videoSpeed = parseFloat(core.getInput('video_speed_seconds'));
    const videoName = core.getInput('base_video_name');

    // Check if we should take a screenshot
    const shouldRun = await shouldTakeScreenshot(autoScreenshots);
    if (!shouldRun) {
      core.info('Skipping screenshot based on auto_screenshots setting and commit message check');
      return;
    }

    let rawUrl = core.getInput('url');
    if (rawUrl.includes('localhost')) {
      const hostIp = guessHostIP();
      if (hostIp) {
        const replaced = rawUrl.replace(/localhost/g, hostIp);
        core.info(`Rewriting URL for container-host access: ${rawUrl} -> ${replaced}`);
        rawUrl = replaced;
      } else {
        core.warning('Failed to detect host IP; proceeding with original URL (localhost may not resolve).');
      }
    }
    const url = rawUrl;

    core.info(`Waiting for resource: ${url}`);
    await waitOn({ resources: [url], timeout: 120000 });
    core.info('Resource available!');

    fs.mkdirSync(folder, { recursive: true });

    core.info('Launching browser...');
    const browser = await puppeteer.launch({
      defaultViewport: { width: 1920, height: 1080 },
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    
    core.info(`Navigating to ${url}...`);
    // Using 'load' instead of 'networkidle2' to avoid timeouts on pages with persistent connections
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    core.info('Page loaded successfully.');

    const timestamp = Date.now();
    const file = `${basename}_${timestamp}.png`;
    const filePath = path.join(folder, file);
    core.info(`Taking screenshot: ${filePath}`);
    await page.screenshot({ path: filePath });

    const latestPath = path.join(folder, `${basename}-latest.png`);
    fs.copyFileSync(filePath, latestPath);
    core.info(`Updated latest screenshot: ${latestPath}`);

    if (makeVideo) {
      core.info('--- Video Recording Started ---');
      const videoFile = `${videoName}_${timestamp}.mp4`;
      const videoPath = path.join(folder, videoFile);
      const recorder = new PuppeteerScreenRecorder(page);
      
      core.info(`Video settings: duration=${videoDuration}s, speed_multiplier=${videoSpeed}x`);
      core.info(`Output path: ${videoPath}`);
      
      await recorder.start(videoPath);
      core.info(`Recording in progress for ${videoDuration} seconds...`);
      await new Promise(resolve => setTimeout(resolve, videoDuration * 1000));
      
      core.info('Stopping recorder...');
      await recorder.stop();
      core.info('Recorder stopped.');

      if (videoSpeed !== 1) {
        core.info(`Processing video speed change to ${videoSpeed}x...`);
        const spedUpFile = `${videoName}_${timestamp}_processed.mp4`;
        const spedUpPath = path.join(folder, spedUpFile);
        const ptsValue = (1 / videoSpeed).toFixed(4);
        const speedCmd = `ffmpeg -y -i "${videoPath}" -vf "setpts=${ptsValue}*PTS" -an "${spedUpPath}"`;
        
        core.info(`Executing FFmpeg: ${speedCmd}`);
        try {
          execSync(speedCmd, { stdio: 'inherit', shell: true });
          if (fs.existsSync(spedUpPath)) {
            core.info('Speed adjustment successful. Replacing original file.');
            fs.renameSync(spedUpPath, videoPath);
          }
        } catch (ffmpegErr) {
          core.error(`FFmpeg error during speed adjustment: ${ffmpegErr.message}`);
        }
      }

      // Handle requested formats
      for (const format of videoFormats) {
        if (format === 'mp4') {
          const stats = fs.statSync(videoPath);
          core.info(`MP4 video ready: ${videoPath} (${stats.size} bytes)`);
          core.setOutput('video_path', videoPath);
        } else if (format === 'gif') {
          core.info('Converting to high-quality GIF...');
          const videoGifPath = path.join(folder, `${videoName}_${timestamp}.gif`);
          const palettePath = path.join(folder, 'palette.png');
          
          const paletteCmd = `ffmpeg -y -i "${videoPath}" -vf "fps=15,scale=${scaleWidth}:-1:flags=lanczos,palettegen" "${palettePath}"`;
          const gifCmd = `ffmpeg -y -i "${videoPath}" -i "${palettePath}" -lavfi "fps=15,scale=${scaleWidth}:-1:flags=lanczos [x]; [x][1:v] paletteuse" "${videoGifPath}"`;

          try {
            execSync(paletteCmd, { stdio: 'inherit', shell: true });
            execSync(gifCmd, { stdio: 'inherit', shell: true });
            if (fs.existsSync(videoGifPath)) {
              const gifStats = fs.statSync(videoGifPath);
              core.info(`Video GIF created: ${videoGifPath} (${gifStats.size} bytes)`);
              core.setOutput('video_gif_path', videoGifPath);
            }
            if (fs.existsSync(palettePath)) fs.unlinkSync(palettePath);
          } catch (gifErr) {
            core.error(`Error converting to GIF: ${gifErr.message}`);
          }
        } else {
          // Generic conversion for other formats
          core.info(`Converting to ${format}...`);
          const outputPath = path.join(folder, `${videoName}_${timestamp}.${format}`);
          try {
            execSync(`ffmpeg -y -i "${videoPath}" "${outputPath}"`, { stdio: 'inherit', shell: true });
            if (fs.existsSync(outputPath)) {
              core.info(`${format.toUpperCase()} created: ${outputPath}`);
              core.setOutput(`video_${format}_path`, outputPath);
            }
          } catch (err) {
            core.error(`Error converting to ${format}: ${err.message}`);
          }
        }
      }

      // If mp4 was NOT explicitly requested, delete the intermediate mp4 file
      if (!videoFormats.includes('mp4')) {
        core.info('Cleaning up intermediate MP4 file...');
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      }

      core.info('--- Video Recording Finished ---');
    }

    await browser.close();
    core.info('Browser closed.');

    core.setOutput('screenshot_path', filePath);
    core.setOutput('latest_path', latestPath);

    if (makeGif) {
      core.info('Creating animated GIF...');
      await createGifFromScreenshots(folder, basename, gifName, frameDuration, scaleWidth);
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
    if (error.stack) {
      core.debug(error.stack);
    }
  }
})();
