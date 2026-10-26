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
let png = NSMutableData()
guard let rendered = context.makeImage(),
  let destination = CGImageDestinationCreateWithData(
    png as CFMutableData, UTType.png.identifier as CFString, 1, nil)
else { fatalError("Unable to create the icon PNG destination") }
CGImageDestinationAddImage(destination, rendered, nil)
guard CGImageDestinationFinalize(destination) else {
  fatalError("Unable to encode the Sill icon PNG")
}
// Write only Xcode's declared output; ImageIO's URL writer may use sibling temporary files.
try (png as Data).write(to: output, options: [])
