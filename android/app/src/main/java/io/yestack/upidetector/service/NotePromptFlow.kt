package io.yestack.upidetector.service

/**
 * The note prompt's state, one question at a time: which record is asked about over the screen, and which wait their
 * turn. Every callback (Save, Skip) checks it is about the record on screen, so a repeated tap, a late callback or one
 * for a record already answered does nothing. A record once answered (saved or skipped) is never asked about again.
 * Plain Kotlin, so it is tested on the JVM; [NoteOverlay] carries out the steps.
 */
internal class NotePromptFlow {

    sealed interface Step {
        /** Show the question for [id] over the screen. */
        data class Show(val id: Long) : Step

        data object None : Step
    }

    var showing: Long? = null
        private set
    private val waiting = ArrayDeque<Long>()
    private val answered = HashSet<Long>()

    fun isAnswered(id: Long) = id in answered

    /** A new expense to ask about: shown now, or queued behind the question in progress. */
    fun ask(id: Long): Step {
        if (id in answered || id == showing || id in waiting) return Step.None
        if (showing != null) {
            waiting.addLast(id)
            return Step.None
        }
        showing = id
        return Step.Show(id)
    }

    /** The question for [id] could not be put on screen: forget it and move on. */
    fun showFailed(id: Long): Step {
        if (showing != id) return Step.None
        showing = null
        return next()
    }

    /** Save or Skip (or Back) on the question for [id]. */
    fun answer(id: Long): Step {
        if (showing != id) return Step.None
        showing = null
        answered += id
        return next()
    }

    /** The questions waiting behind the one on screen are forgotten (it stays). They are not marked answered. */
    fun dropWaiting() {
        waiting.clear()
    }

    /** Everything forgotten except which records were answered. */
    fun clear() {
        showing = null
        waiting.clear()
    }

    private fun next(): Step {
        while (waiting.isNotEmpty()) {
            val id = waiting.removeFirst()
            if (id in answered) continue
            showing = id
            return Step.Show(id)
        }
        return Step.None
    }
}
