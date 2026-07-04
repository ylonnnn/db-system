type ResultValue<T, E> = { ok: true; value: T } | { ok: false; err: E };

export class Result<T, E> {
    private constructor(private value: ResultValue<T, E>) {}

    public static Ok<T>(value: T): Result<T, any> {
        return new Result({ ok: true, value });
    }

    public static Err<E>(err: E): Result<any, E> {
        return new Result({ ok: false, err });
    }

    public unwrapOk(): T {
        if (!this.value.ok)
            throw new Error("called Result::unwrapOk on an error");

        return this.value.value;
    }

    public unwrapErr(): E {
        if (this.value.ok)
            throw new Error("called Result::unwrapErr on an `Ok` state");

        return this.value.err;
    }

    public asOk(): Result<T, any> {
        return Result.Ok(this.unwrapOk());
    }

    public asErr(): Result<any, E> {
        return Result.Err(this.unwrapErr());
    }

    public isOk(): boolean {
        return this.value.ok;
    }

    public isErr(): boolean {
        return !this.value.ok;
    }

    public use<U>(
        f: (value: T) => U,
        err?: (err: E) => U | undefined,
    ): U | undefined {
        return this.value.ok ? f(this.value.value) : err?.(this.value.err);
    }
}
