package io.yestack.upidetector.ui

/**
 * The one answer a note screen gives: Save or Skip, whichever comes first. A second tap, Save after Skip, or Skip
 * after Save is refused, so a note is never saved after Skip and nothing runs twice. Plain Kotlin, tested on the JVM.
 */
internal class NoteAnswer {
    enum class Kind { SAVE, SKIP }

    var kind: Kind? = null
        private set

    /** True when [answer] is the first answer, and so should be carried out. */
    fun take(answer: Kind): Boolean {
        if (kind != null) return false
        kind = answer
        return true
    }
}
