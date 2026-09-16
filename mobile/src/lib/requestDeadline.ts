export const withRequestDeadline = async <T>(
    operation: (signal: AbortSignal) => PromiseLike<T>,
    milliseconds = 12000,
): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Request timed out"));
        }, milliseconds);
    });
    try {
        return await Promise.race([operation(controller.signal), deadline]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};
