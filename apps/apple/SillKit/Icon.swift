import SwiftUI

/// The Web Mono24 line icons, drawn from the same SVG files. Color follows the foreground style.
public struct Icon: View {
  let name: String
  var size: CGFloat = 18
  var weight: CGFloat? = nil
  var filled = false

  public init(_ name: String, size: CGFloat = 18, weight: CGFloat? = nil, filled: Bool = false) {
    self.name = name
    self.size = size
    self.weight = weight
    self.filled = filled
  }

  public var body: some View {
    let glyph = IconGlyph.named(name)
    let scale = size / 24
    let base = (weight ?? IconGlyph.stroke(for: size)) * scale
    ZStack {
      ForEach(glyph.layers.indices, id: \.self) { index in
        let layer = glyph.layers[index]
        if filled {
          IconLayerShape(path: layer.path).fill()
        } else {
          IconLayerShape(path: layer.path).stroke(
            style: StrokeStyle(
              lineWidth: layer.width.map { $0 * scale } ?? base, lineCap: .round, lineJoin: .round))
        }
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

private struct IconLayerShape: Shape {
  let path: Path
  func path(in rect: CGRect) -> Path {
    path.applying(CGAffineTransform(scaleX: rect.width / 24, y: rect.height / 24))
  }
}

public struct IconGlyph: Sendable {
  public struct Layer: Sendable {
    public var path: Path
    public var width: CGFloat?
  }
  public var layers: [Layer]

  /// Stroke follows the size tier in the design manual: S16 2.0, M20 1.8, L24 1.65.
  static func stroke(for size: CGFloat) -> CGFloat { size <= 17 ? 2 : size <= 21 ? 1.8 : 1.65 }

  public static func named(_ name: String) -> IconGlyph {
    all[name] ?? all["file"] ?? IconGlyph(layers: [])
  }

  private static let all: [String: IconGlyph] = IconSVG.values.mapValues(parse)

  static func parse(_ svg: String) -> IconGlyph {
    var layers: [Layer] = []
    var shared = Path()
    let scanner = svg as NSString
    let element = try! NSRegularExpression(pattern: #"<(path|circle|rect)\b([^>]*)/?>"#)
    for match in element.matches(in: svg, range: NSRange(location: 0, length: scanner.length)) {
      let tag = scanner.substring(with: match.range(at: 1))
      let attributes = Self.attributes(scanner.substring(with: match.range(at: 2)))
      var path = Path()
      switch tag {
      case "path": path = SVGPathParser(attributes["d"] ?? "").path()
      case "circle":
        let x = attributes.number("cx")
        let y = attributes.number("cy")
        let r = attributes.number("r")
        path.addEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
      default:
        let rect = CGRect(
          x: attributes.number("x"), y: attributes.number("y"),
          width: attributes.number("width"), height: attributes.number("height"))
        let radius = attributes.number("rx")
        path.addRoundedRect(
          in: rect, cornerSize: CGSize(width: radius, height: radius), style: .circular)
      }
      if let width = attributes["stroke-width"].flatMap(Double.init) {
        layers.append(Layer(path: path, width: width))
      } else {
        shared.addPath(path)
      }
    }
    return IconGlyph(layers: [Layer(path: shared, width: nil)] + layers)
  }

  private static func attributes(_ text: String) -> [String: String] {
    let pattern = try! NSRegularExpression(pattern: #"([a-zA-Z-]+)="([^"]*)""#)
    let source = text as NSString
    var result: [String: String] = [:]
    for match in pattern.matches(in: text, range: NSRange(location: 0, length: source.length)) {
      result[source.substring(with: match.range(at: 1))] = source.substring(
        with: match.range(at: 2))
    }
    return result
  }
}

extension [String: String] {
  fileprivate func number(_ key: String) -> CGFloat { CGFloat(Double(self[key] ?? "") ?? 0) }
}

/// SVG path data → SwiftUI Path. Covers the commands the icon set uses, arcs included.
public struct SVGPathParser {
  private let characters: [Character]
  private var index = 0

  public init(_ data: String) { characters = Array(data) }

  public func path() -> Path {
    var copy = self
    return copy.parse()
  }

  private mutating func parse() -> Path {
    var path = Path()
    var current = CGPoint.zero
    var start = CGPoint.zero
    var lastControl: CGPoint?
    var command: Character = "M"
    while true {
      skipSeparators()
      guard index < characters.count else { break }
      if characters[index].isLetter {
        command = characters[index]
        index += 1
      }
      let relative = command.isLowercase
      let origin = relative ? current : .zero
      switch command.uppercased().first! {
      case "M":
        guard let point = point(origin) else { return path }
        path.move(to: point)
        current = point
        start = point
        lastControl = nil
        command = relative ? "l" : "L"
      case "L":
        guard let point = point(origin) else { return path }
        path.addLine(to: point)
        current = point
        lastControl = nil
      case "H":
        guard let x = number() else { return path }
        current = CGPoint(x: relative ? current.x + x : x, y: current.y)
        path.addLine(to: current)
        lastControl = nil
      case "V":
        guard let y = number() else { return path }
        current = CGPoint(x: current.x, y: relative ? current.y + y : y)
        path.addLine(to: current)
        lastControl = nil
      case "C":
        guard let c1 = point(origin), let c2 = point(origin), let end = point(origin) else {
          return path
        }
        path.addCurve(to: end, control1: c1, control2: c2)
        current = end
        lastControl = c2
      case "S":
        guard let c2 = point(origin), let end = point(origin) else { return path }
        let c1 =
          lastControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) }
          ?? current
        path.addCurve(to: end, control1: c1, control2: c2)
        current = end
        lastControl = c2
      case "Q":
        guard let control = point(origin), let end = point(origin) else { return path }
        path.addQuadCurve(to: end, control: control)
        current = end
        lastControl = nil
      case "A":
        guard let rx = number(), let ry = number(), let rotation = number(),
          let large = flag(), let sweep = flag(), let end = point(origin)
        else { return path }
        Self.addArc(
          to: &path, from: current, to: end, radii: CGSize(width: rx, height: ry),
          rotation: rotation, large: large, sweep: sweep)
        current = end
        lastControl = nil
      case "Z":
        path.closeSubpath()
        current = start
        lastControl = nil
      default:
        return path
      }
    }
    return path
  }

  private mutating func skipSeparators() {
    while index < characters.count, characters[index] == " " || characters[index] == "," {
      index += 1
    }
  }

  private mutating func number() -> CGFloat? {
    skipSeparators()
    let begin = index
    var seenDot = false
    var seenExponent = false
    if index < characters.count, characters[index] == "-" || characters[index] == "+" {
      index += 1
    }
    while index < characters.count {
      let character = characters[index]
      if character.isNumber {
        index += 1
      } else if character == ".", !seenDot, !seenExponent {
        seenDot = true
        index += 1
      } else if character == "e" || character == "E", !seenExponent {
        seenExponent = true
        index += 1
        if index < characters.count, characters[index] == "-" || characters[index] == "+" {
          index += 1
        }
      } else {
        break
      }
    }
    guard index > begin, let value = Double(String(characters[begin..<index])) else { return nil }
    return CGFloat(value)
  }

  private mutating func flag() -> Bool? {
    skipSeparators()
    guard index < characters.count, characters[index] == "0" || characters[index] == "1" else {
      return nil
    }
    defer { index += 1 }
    return characters[index] == "1"
  }

  private mutating func point(_ origin: CGPoint) -> CGPoint? {
    guard let x = number(), let y = number() else { return nil }
    return CGPoint(x: origin.x + x, y: origin.y + y)
  }

  /// Endpoint arc → center parameterization → cubic segments (SVG 1.1 implementation notes F.6).
  static func addArc(
    to path: inout Path, from p0: CGPoint, to p1: CGPoint, radii: CGSize, rotation: CGFloat,
    large: Bool, sweep: Bool
  ) {
    var rx = abs(radii.width)
    var ry = abs(radii.height)
    guard rx > 0, ry > 0, p0 != p1 else {
      path.addLine(to: p1)
      return
    }
    let phi = rotation * .pi / 180
    let cosPhi = cos(phi)
    let sinPhi = sin(phi)
    let dx = (p0.x - p1.x) / 2
    let dy = (p0.y - p1.y) / 2
    let x1 = cosPhi * dx + sinPhi * dy
    let y1 = -sinPhi * dx + cosPhi * dy
    let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if lambda > 1 {
      rx *= sqrt(lambda)
      ry *= sqrt(lambda)
    }
    let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
    var factor = sqrt(max(0, numerator / denominator))
    if large == sweep { factor = -factor }
    let cx1 = factor * rx * y1 / ry
    let cy1 = -factor * ry * x1 / rx
    let center = CGPoint(
      x: cosPhi * cx1 - sinPhi * cy1 + (p0.x + p1.x) / 2,
      y: sinPhi * cx1 + cosPhi * cy1 + (p0.y + p1.y) / 2)
    func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
      let sign: CGFloat = ux * vy - uy * vx < 0 ? -1 : 1
      let dot = (ux * vx + uy * vy) / (hypot(ux, uy) * hypot(vx, vy))
      return sign * acos(min(1, max(-1, dot)))
    }
    let theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    var delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if !sweep, delta > 0 { delta -= 2 * .pi }
    if sweep, delta < 0 { delta += 2 * .pi }
    let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
    let step = delta / CGFloat(segments)
    let handle = 4 / 3 * tan(step / 4)
    func pointAt(_ t: CGFloat) -> CGPoint {
      CGPoint(
        x: center.x + rx * cos(t) * cosPhi - ry * sin(t) * sinPhi,
        y: center.y + rx * cos(t) * sinPhi + ry * sin(t) * cosPhi)
    }
    func derivative(_ t: CGFloat) -> CGPoint {
      CGPoint(
        x: -rx * sin(t) * cosPhi - ry * cos(t) * sinPhi,
        y: -rx * sin(t) * sinPhi + ry * cos(t) * cosPhi)
    }
    var t = theta
    for _ in 0..<segments {
      let a = pointAt(t)
      let b = pointAt(t + step)
      let da = derivative(t)
      let db = derivative(t + step)
      path.addCurve(
        to: b, control1: CGPoint(x: a.x + handle * da.x, y: a.y + handle * da.y),
        control2: CGPoint(x: b.x - handle * db.x, y: b.y - handle * db.y))
      t += step
    }
  }
}
