package io.yestack.upidetector.service

/**
 * What to do after a screen read that got nothing: no readable window, or a window with no text yet. Every miss gets a
 * live-log line with its reason. Plain Kotlin, so it is tested on the JVM.
 */
internal class ReadRetry(
    private val maxRetries: Int,
    /** Flutter can publish its text a moment after the window appears. */
    private val emptyDelayMillis: Long,
    /** A window in transition (an activity starting, a dialog closing) is usually readable again within a frame or two. */
    private val noWindowDelayMillis: Long,
) {
    class Miss(val retry: Boolean, val delayMillis: Long, val logLine: String)

    var misses = 0
        private set

    /** The last miss gave up; further misses are not worth a log line until [reset]. */
    var gaveUp = false
        private set

    /** A read got text, or the screen or app changed: misses start again from zero. */
    fun reset() {
        misses = 0
        gaveUp = false
    }

    /** [noWindow]: no window of the app could be read at all; otherwise the window had no text. */
    fun onMiss(screenClass: String?, noWindow: Boolean, reason: String): Miss {
        val what = if (noWindow) "snapshot skipped" else "empty read"
        val where = screenClass ?: "unknown screen"
        if (misses < maxRetries) {
            misses++
            val delay = if (noWindow) noWindowDelayMillis else emptyDelayMillis
            return Miss(true, delay, "$what of $where: $reason; retry $misses of $maxRetries in $delay ms")
        }
        gaveUp = true
        return Miss(false, 0L, "$what of $where: $reason; gave up after $maxRetries retries")
    }
}
