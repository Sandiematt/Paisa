package io.yestack.upidetector.bridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers [UpiDetectorModule]. A legacy (non-Turbo) module: under the New Architecture it runs through React
 * Native's interop layer, which the bridgeless runtime enables by default.
 */
class UpiDetectorPackage : ReactPackage {
    @Deprecated("Legacy module list; kept because the module is a legacy module served through the interop layer.")
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(UpiDetectorModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
