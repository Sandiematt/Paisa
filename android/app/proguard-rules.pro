# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# App code: native modules, services and activities named from JS and the manifest.
-keep class com.expense_tracker.** { *; }
-keep class io.yestack.upidetector.** { *; }

# Native libraries that ship no consumer rules. Skia's C++ side looks up Java classes,
# methods and fields by name over JNI; the others are view managers and modules
# reached through React Native's reflection-based registries.
-keep class com.shopify.reactnative.skia.** { *; }
-keep class com.airbnb.android.react.lottie.** { *; }
-keep class com.reactnativecommunity.** { *; }
-keep class com.reactcommunity.rndatetimepicker.** { *; }
-keep class eightbitlab.com.blurview.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
