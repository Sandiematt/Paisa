package io.yestack.upidetector.service

/**
 * When to read a screen again that looked unfinished (a result screen still being drawn). Bounded: at most one
 * re-read per entry of [delaysMillis], then none until a read is finished or the screen changes ([reset]). Plain
 * Kotlin, so it is tested on the JVM.
 */
internal class ReReadSchedule(private val delaysMillis: List<Long>) {

    val max: Int get() = delaysMillis.size

    /** Re-reads scheduled since the last [reset] or finished read. */
    var attempts = 0
        private set

    fun reset() {
        attempts = 0
    }

    /**
     * After a decided read whose unfinished reason is [unfinished] (null: finished): the delay before the next
     * re-read, or null when none is due (the read is finished, or the re-reads are used up).
     */
    fun next(unfinished: String?): Long? {
        if (unfinished == null) {
            attempts = 0
            return null
        }
        if (attempts >= delaysMillis.size) return null
        return delaysMillis[attempts++]
    }

    /** The re-reads are used up for this screen. */
    val exhausted: Boolean get() = attempts >= delaysMillis.size
}
