async function createGifFromScreenshots(folder, base, gifName, frameDuration, scaleWidth) {
  const allFiles = fs.readdirSync(folder);
  core.info(`Found ${allFiles.length} total files in ${folder}`);
  
  // Filter PNGs (excluding -latest.png) and sort by their embedded epoch timestamp
  const files = allFiles
    .filter(f => f.endsWith('.png') && !f.endsWith('-latest.png'))
    .sort((a, b) => {
      const ta = parseInt(a.match(/_(\d+)\.png$/)?.[1] || 0, 10);
      const tb = parseInt(b.match(/_(\d+)\.png$/)?.[1] || 0, 10);
      return ta - tb;
    });

  if (files.length < 2) {
    core.warning('Not enough screenshots for a GIF. Need at least 2.');
    return;
  }

  const tmpDir = path.join(folder, `__ffmpeg_tmp__`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Copy files with sequential names and store their timestamps for ffmpeg's text overlay
  const timestamps = [];
  files.forEach((f, i) => {
    const ts = parseInt(f.match(/_(\d+)\.png$/)?.[1] || 0, 10);
    timestamps.push(ts);
    fs.copyFileSync(path.join(folder, f), path.join(tmpDir, `img${String(i).padStart(4, '0')}.png`));
  });

  const gifPath = path.join(folder, gifName);

  // Make a text file with one timestamp per frame for ffmpeg's `drawtext` via `textfile`
  const tsTextFile = path.join(tmpDir, 'timestamps.txt');
  fs.writeFileSync(
    tsTextFile,
    timestamps.map(t => {
      const d = new Date(t);
      return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()} ${d.toLocaleTimeString()}`;
    }).join('\n')
  );

  try {
    // Use `drawtext` with `textfile` and `reload=1` so each frame gets its matching timestamp
    const fps = (1 / parseFloat(frameDuration)).toFixed(2);
    const cmd = [
      'ffmpeg', '-y',
      '-framerate', fps,
      '-i', path.join(tmpDir, 'img%04d.png'),
      '-vf', `scale=${scaleWidth}:-1:flags=lanczos,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:textfile='${tsTextFile}':reload=1:x=w-tw-10:y=h-th-10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.5`,
      '-loop', '0',
      gifPath
    ].join(' ');

    core.info(`Using command: ${cmd}`);
    execSync(cmd, { stdio: 'inherit', shell: true });
    core.setOutput('gif_path', gifPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
