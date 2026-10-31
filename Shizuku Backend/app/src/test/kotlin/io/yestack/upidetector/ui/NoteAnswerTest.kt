package io.yestack.upidetector.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoteAnswerTest {

    @Test
    fun skipThenSaveNeverSavesANote() {
        val answer = NoteAnswer()
        assertTrue(answer.take(NoteAnswer.Kind.SKIP))
        assertFalse(answer.take(NoteAnswer.Kind.SAVE))
        assertEquals(NoteAnswer.Kind.SKIP, answer.kind)
    }

    @Test
    fun saveThenSkipKeepsTheSave() {
        val answer = NoteAnswer()
        assertTrue(answer.take(NoteAnswer.Kind.SAVE))
        assertFalse(answer.take(NoteAnswer.Kind.SKIP))
        assertEquals(NoteAnswer.Kind.SAVE, answer.kind)
    }

    @Test
    fun rapidRepeatedTapsCountOnce() {
        val answer = NoteAnswer()
        assertEquals(listOf(true, false, false), (1..3).map { answer.take(NoteAnswer.Kind.SKIP) })
    }
}
