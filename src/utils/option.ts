import { isUndefined } from "./validator";

export class Option<T> {
    private has: boolean;
    public constructor(private value: T | undefined) {
        this.has = !isUndefined(value);
        this.value = value;
    }

    public static None = new Option(undefined);
    public static Some<T>(value: T): Option<T> {
        return new Option(value)
    }

    public unwrap(): T {
        if (!this.has) throw new Error("called Option::unwrap with no value present")
        return this.value as T;
    }

    public use<U>(f: (value: T) => U): U | undefined {
        return this.value ? f(this.value) : undefined;
    }
}
