#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
swift build -c release
bin_dir="$(swift build -c release --show-bin-path)"
bundle="$PWD/.build/MediaChips.app"
mkdir -p "$bundle/Contents/MacOS"
cp "$bin_dir/MediaChips" "$bundle/Contents/MacOS/MediaChips"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key><string>MediaChips</string>
    <key>CFBundleIdentifier</key><string>com.mediachips.native</string>
    <key>CFBundleName</key><string>MediaChips</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key><true/>
    </dict>
</dict>
</plist>
PLIST
codesign --force --sign - "$bundle"
printf '%s\n' "$bundle"
