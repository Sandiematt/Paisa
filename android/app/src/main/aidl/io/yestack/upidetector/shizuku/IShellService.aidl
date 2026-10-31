package io.yestack.upidetector.shizuku;

/** Shizuku user service: runs in its own process as the shell user (uid 2000), started by Shizuku. */
interface IShellService {
    /** Called by Shizuku to end the service process; the transaction code is fixed by Shizuku. */
    void destroy() = 16777114;

    /**
     * Runs script with sh -c and returns the read end of a pipe carrying its stdout and stderr. The process is
     * killed after timeoutMillis. Streamed, so output larger than a binder transaction (a big dump) still arrives.
     */
    ParcelFileDescriptor run(String script, long timeoutMillis) = 1;

    /**
     * Dumps every window in process (see ScreenReader), falling back to `uiautomator dump` when that cannot be done.
     * Returns a pipe carrying what DumpScript.DUMP prints, so it is read the same way.
     */
    ParcelFileDescriptor dumpWindows(long timeoutMillis) = 2;

    /**
     * Blocks until a screen event from one of packages arrives after event number afterSeq, or timeoutMillis passes.
     * Returns the latest event number. Throws when screen events cannot be received.
     */
    long awaitScreenEvent(in String[] packages, long afterSeq, long timeoutMillis) = 3;
}
