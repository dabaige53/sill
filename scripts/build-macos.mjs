import { mkdir, cp, writeFile, chmod } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(process.argv[2] || resolve(root, 'dist/macos/Sill.app'));
const contents = resolve(app, 'Contents'), runtime = resolve(contents, 'Resources/runtime');
await mkdir(resolve(contents, 'MacOS'), { recursive: true });
await mkdir(resolve(runtime, 'server'), { recursive: true });
const node = process.env.SILL_NODE || process.execPath;
const linked = execFileSync('otool', ['-L', node], { encoding: 'utf8' });
if (linked.split('\n').slice(1).some(line => /@rpath|\/opt\/|\/usr\/local\//.test(line))) throw new Error('Node has external dynamic libraries. Run this script with a standalone Node distribution, or set SILL_NODE to one.');
await cp(node, resolve(runtime, 'node')); 
await chmod(resolve(runtime, 'node'), 0o755);
for (const name of ['local.mjs', 'local-state.mjs']) await cp(resolve(root, 'server', name), resolve(runtime, 'server', name));
await cp(resolve(root, 'native/macos/launch.mjs'), resolve(runtime, 'launch.mjs'));
await cp(resolve(root, 'node_modules/zod'), resolve(runtime, 'node_modules/zod'), { recursive: true });
await cp(resolve(root, 'index.html'), resolve(runtime, 'index.html'));
const iconset = resolve(root, 'dist/macos/Sill.iconset');
await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    execFileSync('sips', ['-z', String(size * scale), String(size * scale), resolve(root, 'assets/sill-icon.png'), '--out', resolve(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { stdio: 'ignore' });
  }
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', resolve(contents, 'Resources/Sill.icns')]);
await writeFile(resolve(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Sill</string><key>CFBundleIdentifier</key><string>app.sill.native</string><key>CFBundleName</key><string>Sill</string><key>CFBundleDisplayName</key><string>Sill · 窗台</string><key>CFBundleIconFile</key><string>Sill</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>0.1.0</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/><key>NSPrincipalClass</key><string>NSApplication</string></dict></plist>`);
execFileSync('xcrun', ['swiftc', '-swift-version', '6', '-parse-as-library', '-module-cache-path', resolve(root, 'dist/macos/module-cache'), '-O', '-target', 'arm64-apple-macosx14.0', '-framework', 'SwiftUI', '-framework', 'AppKit', resolve(root, 'native/macos/Sill.swift'), '-o', resolve(contents, 'MacOS/Sill')], { stdio: 'inherit' });
execFileSync('xcrun', ['swiftc', '-module-cache-path', resolve(root, 'dist/macos/module-cache'), '-O', '-target', 'arm64-apple-macosx14.0', resolve(root, 'native/macos/ServiceLock.swift'), '-o', resolve(runtime, 'service-lock')], { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--sign', '-', resolve(runtime, 'service-lock')], { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--sign', '-', resolve(runtime, 'node')], { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
console.log(app);
