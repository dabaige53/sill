import Foundation
import SillKit
import SwiftUI

struct NativeIcon: View {
  let name: String
  var size: CGFloat = 24
  var body: some View {
    IconShape(name: name).stroke(
      style: StrokeStyle(
        lineWidth: size <= 16 ? 2 : size <= 20 ? 1.8 : 1.65, lineCap: .round, lineJoin: .round)
    )
    .frame(width: size, height: size).accessibilityHidden(true)
  }
}

private struct IconShape: Shape {
  let name: String
  func path(in rect: CGRect) -> Path {
    let parser = IconParser()
    let xml = XMLParser(data: Data((IconSVG.values[name] ?? IconSVG.values["file"] ?? "").utf8))
    xml.delegate = parser
    _ = xml.parse()
    return parser.path.applying(CGAffineTransform(scaleX: rect.width / 24, y: rect.height / 24))
  }
}

private final class IconParser: NSObject, XMLParserDelegate {
  var path = Path()
  func parser(
    _ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
    qualifiedName qName: String?, attributes a: [String: String]
  ) {
    func n(_ key: String) -> CGFloat { CGFloat(Double(a[key] ?? "") ?? 0) }
    switch elementName {
    case "path": path.addPath(SVGPath(a["d"] ?? "").path())
    case "circle":
      path.addEllipse(
        in: CGRect(x: n("cx") - n("r"), y: n("cy") - n("r"), width: n("r") * 2, height: n("r") * 2))
    case "ellipse":
      path.addEllipse(
        in: CGRect(
          x: n("cx") - n("rx"), y: n("cy") - n("ry"), width: n("rx") * 2, height: n("ry") * 2))
    case "rect":
      path.addRoundedRect(
        in: CGRect(x: n("x"), y: n("y"), width: n("width"), height: n("height")),
        cornerSize: CGSize(width: n("rx"), height: a["ry"] == nil ? n("rx") : n("ry")))
    case "line":
      path.move(to: CGPoint(x: n("x1"), y: n("y1")))
      path.addLine(to: CGPoint(x: n("x2"), y: n("y2")))
    case "polyline", "polygon":
      let values = (a["points"] ?? "").split { $0 == " " || $0 == "," }.compactMap { Double($0) }
      for i in stride(from: 0, to: values.count - 1, by: 2) {
        let point = CGPoint(x: values[i], y: values[i + 1])
        if i == 0 { path.move(to: point) } else { path.addLine(to: point) }
      }
      if elementName == "polygon" { path.closeSubpath() }
    default: break
    }
  }
}

private struct SVGPath {
  let tokens: [String]
  init(_ source: String) {
    let regex = try! NSRegularExpression(
      pattern: "[a-zA-Z]|[-+]?(?:[0-9]*\\.)?[0-9]+(?:[eE][-+]?[0-9]+)?")
    tokens = regex.matches(in: source, range: NSRange(source.startIndex..., in: source)).compactMap
    { match in
      Range(match.range, in: source).map { String(source[$0]) }
    }
  }
  func path() -> Path {
    var path = Path()
    var point = CGPoint.zero
    var start = CGPoint.zero
    var control = CGPoint.zero
    var index = 0
    var command = "M"
    var previous = ""
    func isCommand(_ value: String) -> Bool { value.count == 1 && value.first!.isLetter }
    while index < tokens.count {
      if isCommand(tokens[index]) {
        command = tokens[index]
        index += 1
      }
      let upper = command.uppercased()
      let relative = command != upper
      let counts = ["M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0]
      guard let count = counts[upper], index + count <= tokens.count else { break }
      if upper == "Z" {
        path.closeSubpath()
        point = start
        command = "M"
        previous = "Z"
        continue
      }
      let values = tokens[index..<index + count].compactMap(Double.init)
      guard values.count == count else { break }
      index += count
      func p(_ i: Int) -> CGPoint {
        CGPoint(
          x: values[i] + (relative ? point.x : 0), y: values[i + 1] + (relative ? point.y : 0))
      }
      switch upper {
      case "M":
        point = p(0)
        path.move(to: point)
        start = point
        command = relative ? "l" : "L"
      case "L":
        point = p(0)
        path.addLine(to: point)
      case "H":
        point.x = values[0] + (relative ? point.x : 0)
        path.addLine(to: point)
      case "V":
        point.y = values[0] + (relative ? point.y : 0)
        path.addLine(to: point)
      case "C":
        let a = p(0)
        let b = p(2)
        let end = p(4)
        path.addCurve(to: end, control1: a, control2: b)
        control = b
        point = end
      case "S":
        let a =
          ["C", "S"].contains(previous)
          ? CGPoint(x: point.x * 2 - control.x, y: point.y * 2 - control.y) : point
        let b = p(0)
        let end = p(2)
        path.addCurve(to: end, control1: a, control2: b)
        control = b
        point = end
      case "Q":
        let c = p(0)
        let end = p(2)
        path.addQuadCurve(to: end, control: c)
        control = c
        point = end
      case "T":
        let c =
          ["Q", "T"].contains(previous)
          ? CGPoint(x: point.x * 2 - control.x, y: point.y * 2 - control.y) : point
        let end = p(0)
        path.addQuadCurve(to: end, control: c)
        control = c
        point = end
      case "A":
        let end = p(5)
        arc(
          &path, from: point, to: end, rx: values[0], ry: values[1], rotation: values[2],
          large: values[3] != 0, sweep: values[4] != 0)
        point = end
      default: break
      }
      previous = upper
    }
    return path
  }
  private func arc(
    _ path: inout Path, from start: CGPoint, to end: CGPoint, rx inputX: Double, ry inputY: Double,
    rotation: Double, large: Bool, sweep: Bool
  ) {
    var rx = abs(inputX)
    var ry = abs(inputY)
    guard rx > 0, ry > 0, start != end else {
      path.addLine(to: end)
      return
    }
    let phi = rotation * .pi / 180
    let c = cos(phi)
    let s = sin(phi)
    let dx = (start.x - end.x) / 2
    let dy = (start.y - end.y) / 2
    let x = c * dx + s * dy
    let y = -s * dx + c * dy
    let scale = x * x / (rx * rx) + y * y / (ry * ry)
    if scale > 1 {
      rx *= sqrt(scale)
      ry *= sqrt(scale)
    }
    let numerator = max(0, rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x)
    let denominator = rx * rx * y * y + ry * ry * x * x
    let factor =
      (large == sweep ? -1.0 : 1.0) * sqrt(numerator / max(denominator, .leastNonzeroMagnitude))
    let cx = factor * rx * y / ry
    let cy = factor * -ry * x / rx
    let center = CGPoint(
      x: c * cx - s * cy + (start.x + end.x) / 2, y: s * cx + c * cy + (start.y + end.y) / 2)
    let angle = atan2((y - cy) / ry, (x - cx) / rx)
    var delta = atan2((-y - cy) / ry, (-x - cx) / rx) - angle
    if sweep && delta < 0 { delta += 2 * .pi }
    if !sweep && delta > 0 { delta -= 2 * .pi }
    let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
    func point(_ theta: Double) -> CGPoint {
      CGPoint(
        x: center.x + c * rx * cos(theta) - s * ry * sin(theta),
        y: center.y + s * rx * cos(theta) + c * ry * sin(theta))
    }
    func derivative(_ theta: Double) -> CGPoint {
      CGPoint(
        x: -c * rx * sin(theta) - s * ry * cos(theta), y: -s * rx * sin(theta) + c * ry * cos(theta)
      )
    }
    for i in 0..<segments {
      let a = angle + Double(i) * delta / Double(segments)
      let b = angle + Double(i + 1) * delta / Double(segments)
      let alpha = 4 / 3.0 * tan((b - a) / 4)
      let p = point(a)
      let q = point(b)
      let d = derivative(a)
      let e = derivative(b)
      path.addCurve(
        to: q, control1: CGPoint(x: p.x + alpha * d.x, y: p.y + alpha * d.y),
        control2: CGPoint(x: q.x - alpha * e.x, y: q.y - alpha * e.y))
    }
  }
}
