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
  // List all files in the folder
  const allFiles = fs.readdirSync(folder);
  core.info(`Found ${allFiles.length} total files in ${folder}`);
  
  // Filter for PNG files matching our pattern
  const files = allFiles
    .filter(f => f.endsWith('.png') && !f.endsWith('-latest.png'))
    .sort();
  
  core.info(`Found ${files.length} PNG files (excluding -latest.png)`);
  
  // Log all files to help with debugging
  if (files.length > 0) {
    core.info(`All PNG files: ${files.join(', ')}`);
  } else {
    core.warning(`No PNG files found in the directory.`);
    if (allFiles.length > 0) {
      core.info(`Examples of files in directory: ${allFiles.slice(0, Math.min(5, allFiles.length)).join(', ')}`);
    }
    return;
  }

  if (files.length < 2) {
    core.warning('Not enough screenshots for a GIF. Need at least 2.');
    return;
  }

  // Create a unique temporary directory
  const timestamp = Date.now();
  const tmpDir = path.join(folder, `__ffmpeg_tmp_${timestamp}__`);
  fs.mkdirSync(tmpDir, { recursive: true });
  
  // Copy files to temporary directory with sequential names
  core.info('Copying files to temporary directory...');
  files.forEach((f, i) => {
    const sourcePath = path.join(folder, f);
    const destPath = path.join(tmpDir, `img${String(i).padStart(4, '0')}.png`);
    fs.copyFileSync(sourcePath, destPath);
    core.info(`Copied ${f} to ${path.basename(destPath)}`);
  });

  // List the files in the temporary directory to confirm
  const tmpFiles = fs.readdirSync(tmpDir);
  core.info(`Temporary directory contains ${tmpFiles.length} files: ${tmpFiles.join(', ')}`);

  const gifPath = path.join(folder, gifName);
  
  // Use a simpler, more reliable approach for GIF creation
  try {
    // Step 1: Create a palette first (two-step process is more reliable)
    const palettePath = path.join(tmpDir, 'palette.png');
    const fps = (1 / parseFloat(frameDuration)).toFixed(2);
    
    // Create palette command - without quotes in filter
    const paletteCmd = [
      'ffmpeg', '-y',
      '-framerate', fps,
      '-i', path.join(tmpDir, 'img%04d.png'),
      '-vf', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos,palettegen=max_colors=256`,
      palettePath
    ].join(' ');
    
    core.info('Step 1: Generating color palette...');
    core.info(`Using command: ${paletteCmd}`);
    execSync(paletteCmd, { stdio: 'inherit', shell: true });
    
    // Step 2: Create the GIF using the palette
    const gifCmd = [
      'ffmpeg', '-y',
      '-framerate', fps,
      '-i', path.join(tmpDir, 'img%04d.png'),
      '-i', palettePath,
      '-filter_complex', `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:diff_mode=rectangle`,
      '-loop', '0',
      gifPath
    ].join(' ');
    
    core.info(`Step 2: Generating GIF with ${files.length} frames...`);
    core.info(`Using command: ${gifCmd}`);
    execSync(gifCmd, { stdio: 'inherit', shell: true });
    
    if (fs.existsSync(gifPath)) {
      const stats = fs.statSync(gifPath);
      core.info(`GIF created successfully at: ${gifPath} (${stats.size} bytes)`);
      core.setOutput('gif_path', gifPath);
    } else {
      throw new Error('GIF file was not created');
    }
  } catch (err) {
    core.warning(`Failed to generate GIF with two-step method: ${err.message}`);
    
    // Try an even simpler approach as fallback
    try {
      core.info('Trying direct GIF creation method...');
      const simpleCmd = [
        'ffmpeg', '-y',
        '-framerate', (1 / parseFloat(frameDuration)).toFixed(2),
        '-i', path.join(tmpDir, 'img%04d.png'),
        '-vf', `scale=${scaleWidth}:-1:flags=lanczos`,
        gifPath
      ].join(' ');
      
      core.info(`Using command: ${simpleCmd}`);
      execSync(simpleCmd, { stdio: 'inherit', shell: true });
      
      if (fs.existsSync(gifPath)) {
        const stats = fs.statSync(gifPath);
        core.info(`GIF created with simple method at: ${gifPath} (${stats.size} bytes)`);
        core.setOutput('gif_path', gifPath);
      } else {
        throw new Error('GIF file was not created');
      }
    } catch (fallbackErr) {
      core.error(`Failed to generate GIF with simple method: ${fallbackErr.message}`);
      
      // Last resort: try using imagemagick if available
      try {
        core.info('Trying ImageMagick convert as last resort...');
        const convertCmd = [
          'convert',
          '-delay', Math.round(parseFloat(frameDuration) * 100),
          '-loop', '0',
          path.join(tmpDir, 'img*.png'),
          gifPath
        ].join(' ');
        
        core.info(`Using command: ${convertCmd}`);
        execSync(convertCmd, { stdio: 'inherit', shell: true });
        
        if (fs.existsSync(gifPath)) {
          const stats = fs.statSync(gifPath);
          core.info(`GIF created with ImageMagick at: ${gifPath} (${stats.size} bytes)`);
          core.setOutput('gif_path', gifPath);
        } else {
          throw new Error('GIF file was not created');
        }
      } catch (imgErr) {
        core.error(`All GIF creation methods failed. Last error: ${imgErr.message}`);
      }
    }
  } finally {
    // Wait a moment before cleaning up to ensure ffmpeg is done
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
