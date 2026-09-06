import SwiftUI

struct ObjectGeometry: Decodable, Identifiable {
    let id: String
    let label: String
    let width: Double
    let height: Double
    let layers: [Layer]
    struct Layer: Decodable {
        let fill: String
        let stroke: String?
        let strokeWidth: Double?
        let commands: [Command]
    }
    struct Command: Decodable { let type: String; let values: [Double] }
}

final class ObjectLibrary {
    static let shared = ObjectLibrary()
    private let objects: [String: ObjectGeometry]
    init(bundle: Bundle = .main) {
        struct Manifest: Decodable { let version: Int; let objects: [ObjectGeometry] }
        if let url = bundle.url(forResource: "object-geometry", withExtension: "json"),
           let data = try? Data(contentsOf: url), let manifest = try? JSONDecoder().decode(Manifest.self, from: data), manifest.version == 1 {
            objects = Dictionary(manifest.objects.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        } else { objects = [:] }
    }
    func object(_ id: String) -> ObjectGeometry? { objects[id] }
}

struct ObjectArt: View {
    let id: String
    var body: some View {
        Canvas { context, size in
            guard let object = ObjectLibrary.shared.object(id), object.width > 0, object.height > 0 else {
                drawCustomTag(context: &context, size: size)
                return
            }
            let scale = min(size.width / object.width, size.height / object.height)
            context.translateBy(x: (size.width - object.width * scale) / 2, y: (size.height - object.height * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            for layer in object.layers {
                var drawing = Path()
                for command in layer.commands {
                    let v = command.values
                    switch command.type {
                    case "M" where v.count == 2: drawing.move(to: CGPoint(x: v[0], y: v[1]))
                    case "L" where v.count == 2: drawing.addLine(to: CGPoint(x: v[0], y: v[1]))
                    case "C" where v.count == 6: drawing.addCurve(to: CGPoint(x: v[4], y: v[5]), control1: CGPoint(x: v[0], y: v[1]), control2: CGPoint(x: v[2], y: v[3]))
                    case "Q" where v.count == 4: drawing.addQuadCurve(to: CGPoint(x: v[2], y: v[3]), control: CGPoint(x: v[0], y: v[1]))
                    case "Z": drawing.closeSubpath()
                    default: break
                    }
                }
                if layer.fill != "none" { context.fill(drawing, with: .color(Color(hex: layer.fill))) }
                if let stroke = layer.stroke, stroke != "none" {
                    context.stroke(drawing, with: .color(Color(hex: stroke)), style: StrokeStyle(lineWidth: layer.strokeWidth ?? 1, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }

    private func drawCustomTag(context: inout GraphicsContext, size: CGSize) {
        let rect = CGRect(x: size.width * 0.22, y: size.height * 0.18, width: size.width * 0.57, height: size.height * 0.64)
        let shape = Path(roundedRect: rect, cornerRadius: size.width * 0.07)
        context.fill(shape, with: .color(TuckTheme.jade))
        context.stroke(shape, with: .color(TuckTheme.ink), lineWidth: 2)
        let hole = Path(ellipseIn: CGRect(x: size.width * 0.45, y: size.height * 0.27, width: size.width * 0.11, height: size.height * 0.11))
        context.fill(hole, with: .color(TuckTheme.canvas))
        var line = Path(); line.move(to: CGPoint(x: size.width * 0.35, y: size.height * 0.55)); line.addLine(to: CGPoint(x: size.width * 0.66, y: size.height * 0.55))
        context.stroke(line, with: .color(TuckTheme.ink), style: StrokeStyle(lineWidth: 2, lineCap: .round))
    }
}

extension Color {
    init(hex: String) {
        let source = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        let value = UInt64(source, radix: 16) ?? 0
        self.init(.sRGB, red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, opacity: 1)
    }
}
