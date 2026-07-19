export * from "./validator";
export * from "./option";
export * from "./result";
export * from "./types";

// NOTE: use `system.runJob` in the actual Minecraft script to avoid or mitigate spikes.
export function runJob<U>(gen: Generator<U>): U[] {
    return [...gen];
}

export function runJobUntil<U>(
    gen: Generator<U>,
    fn: (val: U) => boolean,
): U | undefined {
    let val = gen.next();
    while (!val.done) {
        if (fn(val.value)) return val.value;
        val = gen.next();
    }

    return undefined;
}
