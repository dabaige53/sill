import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// Build-time packaging: App Store icons must have an opaque background.
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let data = try Data(contentsOf: input)
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else { fatalError("Unable to decode the Sill icon PNG") }
guard
  let context = CGContext(
    data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 1024 * 4,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else { fatalError("Unable to create the opaque icon bitmap") }
let bounds = CGRect(x: 0, y: 0, width: 1024, height: 1024)
context.setFillColor(CGColor(gray: 1, alpha: 1))
context.fill(bounds)
context.interpolationQuality = .high
context.draw(image, in: bounds)
guard let rendered = context.makeImage(),
  let destination = CGImageDestinationCreateWithURL(
    output as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("Unable to create the icon PNG destination") }
CGImageDestinationAddImage(destination, rendered, nil)
guard CGImageDestinationFinalize(destination) else {
  fatalError("Unable to write the Sill icon PNG")
}
