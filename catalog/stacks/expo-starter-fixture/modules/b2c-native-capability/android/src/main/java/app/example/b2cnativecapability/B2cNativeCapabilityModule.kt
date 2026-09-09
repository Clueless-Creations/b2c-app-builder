package app.example.b2cnativecapability

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class B2cNativeCapabilityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("B2cNativeCapability")

    OnCreate {}
    OnDestroy {}

    Events("onCapabilityError")

    Function("probe") {
      return@Function "android"
    }
  }
}
