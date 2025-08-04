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
    const basename = core.getInput('basename');
    const makeGif = core.getInput('make_gif') === 'true';
    const gifName = core.getInput('gif_name');
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
    await waitOn({ resources: [url], timeout: 120000 });
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
