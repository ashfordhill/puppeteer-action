const core = require('@actions/core');
const puppeteer = require('puppeteer');
const waitOn = require('wait-on');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function guessHostIP() {
  try {
    // On Linux, the default route’s gateway is usually the host bridge
    const route = execSync("ip route | awk '/default/ {print $3}'").toString().trim();
    return route || null;
  } catch (e) {
    core.warning(`Could not detect host IP: ${e.message}`);
    return null;
  }
}

async function createVideoFromScreenshots(folder, base, videoName, frameDuration, scaleWidth) {
  // Get all screenshots except the "-latest.png"
  const files = fs.readdirSync(folder)
    .filter(f => f.startsWith(base + '_') && f.endsWith('.png') && !f.endsWith('-latest.png'))
    .sort(); // Sorts by timestamp because the timestamp is in the name

  if (files.length < 2) {
    core.warning('Not enough screenshots for a video. Need at least 2.');
    return;
  }

  // Prepare temporary sequential files for ffmpeg
  const tmpDir = path.join(folder, '__ffmpeg_tmp__');
  fs.mkdirSync(tmpDir, { recursive: true });
  files.forEach((f, i) => {
    fs.copyFileSync(path.join(folder, f), path.join(tmpDir, `img${String(i).padStart(4, '0')}.png`));
  });

  // Build ffmpeg command
  const videoPath = path.join(folder, videoName);
  const today = new Date();
  const dateText = `${today.getMonth() + 1}-${today.getDate()}-${today.getFullYear()}`;
  const drawtext = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${dateText}':x=10:y=10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.5`;
  const cmd = [
    'ffmpeg', '-y',
    '-framerate', (1 / parseFloat(frameDuration)).toString(),
    '-i', path.join(tmpDir, 'img%04d.png'),
    '-vf', `"scale=${scaleWidth}:-1,${drawtext}"`,
    '-pix_fmt', 'yuv420p',
    videoPath
  ].join(' ');

  try {
    core.info('Generating video...');
    execSync(cmd, { stdio: 'inherit', shell: true });
    core.info(`Video created at: ${videoPath}`);
    core.setOutput('video_path', videoPath);
  } catch (err) {
    core.warning(`Failed to generate video: ${err.message}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Launch Puppeteer, take screenshot, and optionally create video.
// This is the main function that runs when the action is triggered.
(async () => {
  try {
    //const url = core.getInput('url');
    const folder = core.getInput('folder');
    const basename = core.getInput('basename');
    const makeVideo = core.getInput('make_video') === 'true';
    const videoName = core.getInput('video_name');
    const frameDuration = core.getInput('frame_duration');
    const scaleWidth = core.getInput('scale_width');


    let rawUrl = core.getInput('url');

    // If user passed localhost, rewrite it to the detected host IP so container can reach the host service
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

    // Wait for the resource if specified
    core.info(`Waiting for resource: ${url}`);
    await waitOn({ resources: [url], timeout: 30000 });
    core.info('Resource available!');

    // Ensure folder exists
    fs.mkdirSync(folder, { recursive: true });

    // Launch Puppeteer and take screenshot
    const browser = await puppeteer.launch({
      defaultViewport: { width: 1920, height: 1080 },
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Timestamped file
    const timestamp = Date.now();
    const file = `${basename}_${timestamp}.png`;
    const filePath = path.join(folder, file);

    await page.screenshot({ path: filePath });

    // Overwrite latest image
    const latestPath = path.join(folder, `${basename}-latest.png`);
    fs.copyFileSync(filePath, latestPath);

    await browser.close();

    core.info(`Screenshot saved as ${filePath} and updated ${latestPath}`);
    core.setOutput('screenshot_path', filePath);
    core.setOutput('latest_path', latestPath);

    // Optionally, generate the video after screenshotting
    if (makeVideo) {
      await createVideoFromScreenshots(folder, basename, videoName, frameDuration, scaleWidth);
    }

  } catch (error) {
    core.setFailed(error.message);
  }
})();