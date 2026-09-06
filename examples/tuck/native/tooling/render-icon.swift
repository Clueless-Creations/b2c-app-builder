import AppKit
import Foundation

struct Manifest: Decodable { let objects: [Object] }
struct Object: Decodable {
    let id: String
    let width: Double
    let height: Double
    let layers: [Layer]
}
struct Layer: Decodable {
    let fill: String
    let stroke: String?
    let strokeWidth: Double?
    let commands: [Command]
}
struct Command: Decodable { let type: String; let values: [Double] }

func color(_ hex: String) -> CGColor {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted), radix: 16) ?? 0
    return CGColor(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255, alpha: 1)
}

let native = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let manifestURL = native.deletingLastPathComponent().appendingPathComponent("shared/object-geometry.json")
let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: manifestURL))
guard let bag = manifest.objects.first(where: { $0.id == "bag" }) else { fatalError("The shared bag is required") }
guard let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError("Cannot make icon bitmap") }
context.setFillColor(color("F7F1E6")); context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
context.translateBy(x: 0, y: 1024); context.scaleBy(x: 1, y: -1)
context.setFillColor(color("E3E4D8")); context.fillEllipse(in: CGRect(x: 80, y: 80, width: 864, height: 864))
context.translateBy(x: 44, y: 35); context.scaleBy(x: 936 / bag.width, y: 936 / bag.height)
context.setLineCap(.round); context.setLineJoin(.round)
for layer in bag.layers {
    let path = CGMutablePath()
    for command in layer.commands {
        let values = command.values
        switch command.type {
        case "M": path.move(to: CGPoint(x: values[0], y: values[1]))
        case "L": path.addLine(to: CGPoint(x: values[0], y: values[1]))
        case "Q": path.addQuadCurve(to: CGPoint(x: values[2], y: values[3]), control: CGPoint(x: values[0], y: values[1]))
        case "C": path.addCurve(to: CGPoint(x: values[4], y: values[5]), control1: CGPoint(x: values[0], y: values[1]), control2: CGPoint(x: values[2], y: values[3]))
        case "Z": path.closeSubpath()
        default: fatalError("Unsupported shared path command")
        }
    }
    if layer.fill != "none" { context.addPath(path); context.setFillColor(color(layer.fill)); context.fillPath() }
    if let stroke = layer.stroke, stroke != "none" {
        context.addPath(path); context.setStrokeColor(color(stroke)); context.setLineWidth(layer.strokeWidth ?? 1); context.strokePath()
    }
}
guard let image = context.makeImage(), let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { fatalError("Cannot encode icon") }
let output = native.appendingPathComponent("Assets.xcassets/AppIcon.appiconset/AppIcon.png")
try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
try png.write(to: output, options: .atomic)
print("Rendered AppIcon.png from the shared bag geometry")
