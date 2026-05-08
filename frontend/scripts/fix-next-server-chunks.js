const fs = require('fs');
const path = require('path');

const candidateDirs = ['.next-prod', '.next', '.next-dev']
  .map((name) => path.join(__dirname, '..', name, 'server'))
  .filter((dir) => fs.existsSync(dir));

const serverDir = candidateDirs[0];
const chunksDir = serverDir ? path.join(serverDir, 'chunks') : '';

if (!serverDir || !fs.existsSync(chunksDir)) {
  process.exit(0);
}

for (const entry of fs.readdirSync(chunksDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

  const source = path.join(chunksDir, entry.name);
  const target = path.join(serverDir, entry.name);

  try {
    fs.copyFileSync(source, target);
  } catch (error) {
    console.error(`Failed to mirror Next server chunk ${entry.name}:`, error);
    process.exit(1);
  }
}
