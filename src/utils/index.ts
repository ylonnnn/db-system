export * from "./validator";
export * from "./option";
export * from "./result";

// NOTE: use `system.runJob` in the actual Minecraft script to avoid or mitigate spikes.
export function runJob(gen: Generator) {
    while (!gen.next().done) {}
}
