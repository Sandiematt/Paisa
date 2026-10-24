import {createLoadingGate} from '../src/features/insights/loadingGate';

describe('createLoadingGate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('never shows for loads shorter than the delay', () => {
    const onChange = jest.fn();
    const gate = createLoadingGate(onChange, {delayMs: 250, minMs: 500});
    gate.set(true);
    jest.advanceTimersByTime(200);
    gate.set(false);
    jest.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows after the delay and holds for the minimum duration', () => {
    const onChange = jest.fn();
    const gate = createLoadingGate(onChange, {delayMs: 250, minMs: 500});
    gate.set(true);
    jest.advanceTimersByTime(250);
    expect(onChange).toHaveBeenLastCalledWith(true);
    jest.advanceTimersByTime(100);
    gate.set(false);
    jest.advanceTimersByTime(399);
    expect(onChange).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('hides immediately when the minimum has already elapsed', () => {
    const onChange = jest.fn();
    const gate = createLoadingGate(onChange, {delayMs: 100, minMs: 300});
    gate.set(true);
    jest.advanceTimersByTime(100);
    jest.advanceTimersByTime(1000);
    gate.set(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps showing if loading resumes during the minimum hold', () => {
    const onChange = jest.fn();
    const gate = createLoadingGate(onChange, {delayMs: 100, minMs: 500});
    gate.set(true);
    jest.advanceTimersByTime(100);
    gate.set(false);
    gate.set(true);
    jest.advanceTimersByTime(2000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
