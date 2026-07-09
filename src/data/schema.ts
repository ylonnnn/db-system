import { Result, isNumber, isString, isUndefined } from "../utils";
import { TableDataQueryOperation } from "./table";

export type FieldSchemaDefault<T extends FieldSchemaType<any>> =
    (() => ExtractFieldSchemaTypeValueType<T>) | null;
export type FieldSchemaCheck<T extends FieldSchemaType<any>> = (
    value: ExtractFieldSchemaTypeValueType<T>,
) => boolean;

export interface FieldSchemaConfig<
    T extends FieldSchemaType<any>,
    TPrimary extends boolean = false,
    TNonNull extends boolean = boolean,
    TDefault extends FieldSchemaDefault<T> = FieldSchemaDefault<T>,
> {
    primary: TPrimary;
    unique: boolean;
    nonNull: TNonNull;
    default: TDefault;
    check: FieldSchemaCheck<T>;
}

export type ExtractFieldSchemaType<T> =
    T extends FieldSchema<infer FT> ? FT : never;
export type ExtractFieldSchemaTypeValueType<T> =
    T extends FieldSchemaType<infer U> ? U : never;

export class FieldSchema<
    T extends FieldSchemaType<any>,
    TPrimary extends boolean = false,
    TNonNull extends boolean = false,
    TDefault extends FieldSchemaDefault<T> = FieldSchemaDefault<T>,
> {
    public constructor(
        public readonly type: T,
        private __config: FieldSchemaConfig<T, TPrimary, TNonNull, TDefault> = {
            primary: false as TPrimary,
            unique: false,
            nonNull: false as TNonNull,
            default: null as TDefault,
            check: (() => true) as FieldSchemaCheck<T>,
        },
    ) {}

    public get config() {
        return this.__config;
    }

    public prioritization(op: TableDataQueryOperation) {
        if (op === TableDataQueryOperation.Predicate) return 0;

        const { primary, unique, nonNull } = this.__config;
        return (
            Number(nonNull) +
            (unique ? (op === TableDataQueryOperation.Eq ? 4 : 2) : 0) +
            Number(primary)
        );
    }

    public primaryKey(): FieldSchema<T, true, true, TDefault> {
        this.__config.primary = true as TPrimary;
        this.__config.unique = true;
        this.__config.nonNull = true as TNonNull;

        return this as FieldSchema<T, true, true, TDefault>;
    }

    public unique(): FieldSchema<T, TPrimary, TNonNull, TDefault> {
        this.__config.unique = true;
        return this;
    }

    public nonNull(): FieldSchema<T, TPrimary, true, TDefault> {
        this.__config.nonNull = true as TNonNull;
        return this as FieldSchema<T, TPrimary, true, TDefault>;
    }

    public default<F extends NonNullable<FieldSchemaDefault<T>>>(fn: F) {
        return new FieldSchema<T, TPrimary, TNonNull, F>(this.type, {
            ...this.__config,
            default: fn,
        });
    }

    public check(
        fn: FieldSchemaCheck<T>,
    ): FieldSchema<T, TPrimary, TNonNull, TDefault> {
        this.__config.check = fn;
        return this;
    }

    public validate(value: any): boolean {
        return (
            // Null value guard clause
            (this.__config.nonNull ? !isUndefined(value) : true) &&
            // Type guard clause
            this.type.validate(value) &&
            // Additional check function
            this.__config.check(value)
        );
    }
}

export class FieldSchemaTypeError extends Error {}
export type FieldSchemaConversionResult<T> = Result<T, FieldSchemaTypeError>;

export abstract class FieldSchemaType<T> {
    public abstract validate(value: any): value is T;
    public abstract from(value: any): FieldSchemaConversionResult<T>;
}

const intSchemaType = new (class IntSchemaType extends FieldSchemaType<number> {
    public validate(value: any): value is number {
        return isNumber(value, true);
    }

    public from(value: any): FieldSchemaConversionResult<number> {
        return isUndefined(value)
            ? Result.Ok(0)
            : isString(value)
              ? Result.Ok(parseInt(value))
              : Result.Err(
                    new FieldSchemaTypeError(
                        "cannot convert unknown type to int",
                    ),
                );
    }
})();

const stringSchemaType =
    new (class StringSchemaType extends FieldSchemaType<string> {
        public validate(value: any): value is string {
            return isString(value);
        }

        public from(value: any): FieldSchemaConversionResult<string> {
            return Result.Ok(
                isUndefined(value) ? `{value}` : (value.toString() as string),
            );
        }
    })();

const floatSchemaType =
    new (class FloatSchemaType extends FieldSchemaType<number> {
        public validate(value: any): value is number {
            return isNumber(value);
        }

        public from(value: any): FieldSchemaConversionResult<number> {
            return isUndefined(value)
                ? Result.Ok(0)
                : isString(value)
                  ? Result.Ok(parseFloat(value))
                  : Result.Err(
                        new FieldSchemaTypeError(
                            "cannot convert unknown type to float",
                        ),
                    );
        }
    })();

export const int = () => new FieldSchema(intSchemaType);
export const string = () => new FieldSchema(stringSchemaType);
export const float = () => new FieldSchema(floatSchemaType);
