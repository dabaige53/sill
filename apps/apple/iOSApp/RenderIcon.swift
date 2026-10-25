import AppKit

// Build-time packaging: App Store icons must have an opaque background.
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard let image = NSImage(contentsOf: input),
  let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8,
    samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0),
  let context = NSGraphicsContext(bitmapImageRep: bitmap)
else { fatalError("Unable to read the Sill icon") }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
context.imageInterpolation = .high
let bounds = NSRect(x: 0, y: 0, width: 1024, height: 1024)
NSColor.white.setFill()
bounds.fill()
image.draw(in: bounds, from: .zero, operation: .sourceOver, fraction: 1)
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Unable to encode the Sill icon")
}
try png.write(to: output)
