import AppKit
import Foundation

// Command-line rendering only; no application or window is launched.
let root = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let tokenData = try Data(
  contentsOf: root.appendingPathComponent("design-system/tokens/installer.json"))
let tokenRoot = try JSONSerialization.jsonObject(with: tokenData) as! [String: [String: Any]]
let tokens = tokenRoot["installer"]!
let copyData = try Data(
  contentsOf: root.appendingPathComponent("design-system/copy/zh-Hans/installer.json"))
let copy = try JSONDecoder().decode([String: String].self, from: copyData)
func metric(_ key: String) -> CGFloat { CGFloat((tokens[key] as! NSNumber).doubleValue) }
let width = metric("width")
let height = metric("height")
let hex = String((tokens["ink"] as! String).dropFirst())
let rgb = UInt32(hex, radix: 16)!
let ink = NSColor(
  srgbRed: CGFloat((rgb >> 16) & 255) / 255,
  green: CGFloat((rgb >> 8) & 255) / 255,
  blue: CGFloat(rgb & 255) / 255, alpha: 1)
guard
  let artwork = NSImage(
    contentsOf: root.appendingPathComponent("design-system/installer/background-art.png"))
else {
  throw NSError(
    domain: "SillInstaller", code: 1,
    userInfo: [NSLocalizedDescriptionKey: "Missing installer artwork"])
}
for scale in [1, 2] {
  let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(width) * scale,
    pixelsHigh: Int(height) * scale, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  bitmap.size = NSSize(width: width, height: height)
  NSGraphicsContext.saveGraphicsState()
  let context = NSGraphicsContext(bitmapImageRep: bitmap)!
  NSGraphicsContext.current = context
  context.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
  artwork.draw(in: NSRect(x: 0, y: 0, width: width, height: height))
  func text(
    _ key: String, y: CGFloat, size: CGFloat, x: CGFloat = 0,
    lineWidth: CGFloat? = nil, bold: Bool = false
  ) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let attributes: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular),
      .foregroundColor: ink, .paragraphStyle: paragraph,
    ]
    let lineHeight = size * 2
    (copy[key]! as NSString).draw(
      in: NSRect(
        x: x, y: height - y - lineHeight,
        width: lineWidth ?? width, height: lineHeight), withAttributes: attributes)
  }
  text("installer.title", y: metric("titleY"), size: metric("titleSize"), bold: true)
  text("installer.subtitle", y: metric("subtitleY"), size: metric("subtitleSize"))
  text(
    "installer.footer", y: metric("footerY"), size: metric("footerSize"),
    x: metric("footerX"), lineWidth: metric("footerWidth"))
  // Lucide arrow-right, 24-unit coordinates.
  let arrow = NSBezierPath()
  func point(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
    NSPoint(
      x: metric("arrowX") + x * metric("arrowSize") / 24,
      y: height - metric("arrowY") - y * metric("arrowSize") / 24)
  }
  arrow.move(to: point(5, 12))
  arrow.line(to: point(19, 12))
  arrow.move(to: point(12, 5))
  arrow.line(to: point(19, 12))
  arrow.line(to: point(12, 19))
  arrow.lineWidth = metric("arrowStroke")
  arrow.lineCapStyle = .round
  arrow.lineJoinStyle = .round
  ink.setStroke()
  arrow.stroke()
  NSGraphicsContext.restoreGraphicsState()
  let png = bitmap.representation(using: .png, properties: [:])!
  try png.write(to: output.appendingPathComponent("background@\(scale)x.png"))
}
