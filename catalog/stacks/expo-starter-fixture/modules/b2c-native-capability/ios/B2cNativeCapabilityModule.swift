import ExpoModulesCore

public class B2cNativeCapabilityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("B2cNativeCapability")

    OnCreate {}
    OnDestroy {}

    Events("onCapabilityError")

    Function("probe") {
      return "ios"
    }
  }
}
