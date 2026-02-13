import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'node_modules', 'cesium', 'Build', 'Cesium');
const dest = join(root, 'public', 'cesium');

async function copyCesiumAssets() {
  if (!existsSync(src)) {
    console.warn('[Cesium] Build assets not found at:', src);
    return;
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(join(root, 'public'), { recursive: true });
  await cp(src, dest, { recursive: true, dereference: true });
  console.log('[Cesium] Assets copied to public/cesium');
}

copyCesiumAssets().catch((error) => {
  console.error('[Cesium] Failed to copy assets:', error);
  process.exitCode = 1;
});
