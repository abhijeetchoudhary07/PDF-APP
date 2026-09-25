# R8 configuration for the release build.
#
# The bulk of the rules this app needs are consumer rules that ship inside the
# libraries themselves and are applied automatically:
#
#   - capacitor-android keeps anything extending `com.getcapacitor.Plugin` and
#     anything annotated `@CapacitorPlugin`, which is what makes reflective
#     plugin loading survive shrinking;
#   - Play Billing and RevenueCat's purchases-android keep their own wire
#     models, which are deserialized by name.
#
# What follows is only what those do not cover.

# Crash reports from the Play Console are read by a human, and an obfuscated
# stack trace with no line numbers cannot be acted on. Keeping these two
# attributes costs a few kilobytes; `-renamesourcefileattribute` replaces the
# real file names with a constant so the mapping still has to be uploaded to
# resolve them.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Annotations have to survive for the consumer keep rules above to match, and
# for Capacitor to read `@CapacitorPlugin`/`@PluginMethod` off a class at
# runtime.
-keepattributes *Annotation*

# The Capacitor bridge reaches the native side through an object injected into
# the WebView, and every callable member is found by reflection from JS. The
# default Android configuration carries this rule too, but it is the single
# thing whose removal would break the whole app, so it is stated here rather
# than inherited.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor's own plugin machinery reads these off the generated
# `capacitor.plugins.json`, so the class names in that file must still resolve.
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }

# Kotlin coroutines, pulled in by RevenueCat. The service loader entries are
# referenced by resource name, and the internal atomics are accessed
# reflectively by the debug agent probe on startup.
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}
