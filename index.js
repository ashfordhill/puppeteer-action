const core = require('@actions/core');
const puppeteer = require('puppeteer');
const waitOn = require('wait-on');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const url = core.getInput('url');
    const folder = core.getInput('folder');
    const basename = core.getInput('basename');

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

  } catch (error) {
    core.setFailed(error.message);
  }
})();
