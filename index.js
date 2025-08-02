// index.js
const core = require('@actions/core');
const puppeteer = require('puppeteer');
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

async function createGifFromScreenshots(folder, base, gifName, frameDuration, scaleWidth) {
  const files = fs.readdirSync(folder)
    .filter(f => f.startsWith(base + '_') && f.endsWith('.png') && !f.endsWith('-latest.png'))
    .sort();

  if (files.length < 2) {
    core.warning('Not enough screenshots for a GIF. Need at least 2.');
    return;
  }

  const tmpDir = path.join(folder, '__ffmpeg_tmp__');
  fs.mkdirSync(tmpDir, { recursive: true });
  files.forEach((f, i) => {
    fs.copyFileSync(path.join(folder, f), path.join(tmpDir, `img${String(i).padStart(4, '0')}.png`));
  });

  const gifPath = path.join(folder, gifName);
  const today = new Date();
  const dateText = `${today.getMonth() + 1}-${today.getDate()}-${today.getFullYear()}`;
  const drawtext = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${dateText}':x=10:y=10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.5`;

  // fps = images per second; frameDuration is seconds per frame
  const fps = (1 / parseFloat(frameDuration)).toFixed(6);

  // Palette workflow for sharp, small GIFs
  const vf = `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,${drawtext},split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer`;

  const cmd = [
    'ffmpeg', '-y',
    '-framerate', fps,
    '-i', path.join(tmpDir, 'img%04d.png'),
    '-vf', `"${vf}"`,
    '-loop', '0',
    gifPath
  ].join(' ');

  try {
    core.info('Generating GIF...');
    execSync(cmd, { stdio: 'inherit', shell: true });
    core.info(`GIF created at: ${gifPath}`);
    core.setOutput('gif_path', gifPath);
  } catch (err) {
    core.warning(`Failed to generate GIF: ${err.message}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  try {
    const folder = core.getInput('folder');
    const basename = core.getInput('basename');

    // Back-compat: treat make_video=true as make_gif=true if present
    const makeGif = core.getInput('make_gif') === 'true' || core.getInput('make_video') === 'true';
    const gifNameInput = core.getInput('gif_name');
    const videoNameLegacy = core.getInput('video_name'); // may exist from older workflows
    const gifName = gifNameInput || (videoNameLegacy ? videoNameLegacy.replace(/\.mp4$/i, '.gif') : 'timeline.gif');

    const frameDuration = core.getInput('frame_duration'); // seconds per frame
    const scaleWidth = core.getInput('scale_width');

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
    await waitOn({ resources: [url], timeout: 30000 });
    core.info('Resource available!');

    fs.mkdirSync(folder, { recursive: true });

    const browser = await puppeteer.launch({
      defaultViewport: { width: 1920, height: 1080 },
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });

    const timestamp = Date.now();
    const file = `${basename}_${timestamp}.png`;
    const filePath = path.join(folder, file);
    await page.screenshot({ path: filePath });

    const latestPath = path.join(folder, `${basename}-latest.png`);
    fs.copyFileSync(filePath, latestPath);

    await browser.close();

    core.info(`Screenshot saved as ${filePath} and updated ${latestPath}`);
    core.setOutput('screenshot_path', filePath);
    core.setOutput('latest_path', latestPath);

    if (makeGif) {
      await createGifFromScreenshots(folder, basename, gifName, frameDuration, scaleWidth);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();
