type RetryOptions = {
    task: () => Promise<void>;
    delays?: number[];
    onError?: (error: unknown) => void;
};

export const createBoundedRetry = ({
    task,
    delays = [1000, 2000, 5000, 15000, 30000],
    onError,
}: RetryOptions) => {
    let stopped = false;
    let attempt = 0;
    let inFlight = false;
    let rerun = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async (resetBackoff = false): Promise<void> => {
        if (stopped) return;
        if (resetBackoff) attempt = 0;
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (inFlight) {
            rerun = true;
            return;
        }
        inFlight = true;
        try {
            await task();
            attempt = 0;
        } catch (error) {
            onError?.(error);
            if (!stopped && attempt < delays.length) {
                const delay = delays[attempt++];
                timer = setTimeout(() => {
                    timer = null;
                    void run();
                }, delay);
            }
        } finally {
            inFlight = false;
            if (rerun && !stopped) {
                rerun = false;
                void run(true);
            }
        }
    };

    return {
        run,
        cancel: () => {
            stopped = true;
            rerun = false;
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
};
