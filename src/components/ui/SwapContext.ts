import {createContext} from 'react';

/**
 * True while a screen swap is in flight.
 *
 * Entrance reveals inside a screen read this and stay settled. The screen is
 * already travelling; replaying a per-element reveal on top of that is two
 * motions at once, which reads as a flicker rather than as polish.
 */
export const SwapInFlightContext = createContext(false);
