#!/bin/sh
set -eu

# Xcode runs this phase before processing Info.plist and the generated icon catalog.
# Keep the product version in package.json, including builds started directly in Xcode.
version=$(/usr/bin/plutil -extract version raw -o - "$SRCROOT/../../package.json")
version=$(printf '%s' "$version" | /usr/bin/sed 's/-.*//')
case "$version" in
  ''|*[!0-9.]*) echo 'Invalid product version in package.json' >&2; exit 1 ;;
esac
/bin/mkdir -p "$DERIVED_FILE_DIR/SillAssets.xcassets/AppIcon.appiconset"
/bin/cp "$SRCROOT/iOSApp/Info.plist" "$DERIVED_FILE_DIR/Sill-Info.plist"
/usr/bin/plutil -insert CFBundleShortVersionString -string "$version" "$DERIVED_FILE_DIR/Sill-Info.plist"
# Packaging conversion only; retain the repository brand artwork unchanged.
mac_sdk=$(/usr/bin/xcrun --sdk macosx --show-sdk-path)
/usr/bin/xcrun --sdk macosx swift -sdk "$mac_sdk" -module-cache-path "$DERIVED_FILE_DIR/icon-module-cache" "$SRCROOT/iOSApp/RenderIcon.swift" "$SRCROOT/../../assets/sill-icon.png" "$DERIVED_FILE_DIR/SillAssets.xcassets/AppIcon.appiconset/icon.png"
/bin/cat > "$DERIVED_FILE_DIR/SillAssets.xcassets/Contents.json" <<'JSON'
{"info":{"author":"xcode","version":1}}
JSON
/bin/cat > "$DERIVED_FILE_DIR/SillAssets.xcassets/AppIcon.appiconset/Contents.json" <<'JSON'
{"images":[{"filename":"icon.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}
JSON
