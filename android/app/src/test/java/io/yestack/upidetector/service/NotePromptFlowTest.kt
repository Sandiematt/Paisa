package io.yestack.upidetector.service

import io.yestack.upidetector.service.NotePromptFlow.Step
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The note prompt's state under rapid taps, late callbacks and lifecycle changes. */
class NotePromptFlowTest {

    private val flow = NotePromptFlow()

    @Test
    fun answerDismissesOnceAndRapidRepeatTapsDoNothing() {
        assertEquals(Step.Show(1), flow.ask(1))
        assertEquals(Step.None, flow.answer(1))
        assertNull(flow.showing)
        repeat(3) { assertEquals(Step.None, flow.answer(1)) }
        assertTrue(flow.isAnswered(1))
    }

    @Test
    fun droppingTheQueueKeepsTheQuestionOnScreenAndShowsNothingMore() {
        assertEquals(Step.Show(1), flow.ask(1))
        assertEquals(Step.None, flow.ask(2))
        assertEquals(Step.None, flow.ask(3))
        flow.dropWaiting()
        assertEquals(1L, flow.showing)
        assertEquals(Step.None, flow.answer(1))
        assertNull(flow.showing)
    }

    @Test
    fun anAnsweredExpenseIsNeverAskedAgain() {
        flow.ask(1)
        flow.answer(1)
        assertEquals(Step.None, flow.ask(1))
        assertNull(flow.showing)
    }

    @Test
    fun theSameExpenseAskedTwiceIsShownOnce() {
        assertEquals(Step.Show(1), flow.ask(1))
        assertEquals(Step.None, flow.ask(1))
    }

    @Test
    fun aSecondExpenseWaitsAndComesAfterTheAnswer() {
        flow.ask(1)
        assertEquals(Step.None, flow.ask(2))
        assertEquals(Step.Show(2), flow.answer(1))
        assertEquals(2L, flow.showing)
    }

    @Test
    fun aTapOnAQuestionAlreadyReplacedDoesNothing() {
        flow.ask(1)
        flow.ask(2)
        flow.answer(1) // now showing 2
        assertEquals(Step.None, flow.answer(1))
        assertEquals(2L, flow.showing)
    }

    @Test
    fun aQuestionThatCannotBeShownGivesWayToTheNext() {
        flow.ask(1)
        flow.ask(2)
        assertEquals(Step.Show(2), flow.showFailed(1))
    }

    @Test
    fun clearForgetsTheQueueButNotTheAnswers() {
        flow.ask(1)
        flow.answer(1)
        flow.ask(2)
        flow.ask(3)
        flow.clear()
        assertNull(flow.showing)
        assertEquals(Step.None, flow.ask(1))
        assertEquals(Step.Show(3), flow.ask(3))
    }
}
