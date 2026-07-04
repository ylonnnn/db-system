import { Result } from "../utils";
import { isNumber, isString, isUndefined } from "../utils/validator";

export type FieldSchemaOptions<T extends FieldSchemaType<any>> = ({
    isPrimary: true; isUnique?: never; isNonNull?: never
} | {
    isPrimary?: never,
    isUnique?: boolean
    isNonNull?: boolean,
}) & Partial<Omit<FieldSchemaConfig<T>, "isUnique" | "isNonNull">>

export interface FieldSchemaConfig<T extends FieldSchemaType<any>, VT extends ExtractFieldSchemaTypeValueType<T> = ExtractFieldSchemaTypeValueType<T>> {
    isPrimary: boolean,
    isUnique: boolean,
    isNonNull: boolean,
    default: (() => VT) | null,
    check: (data: VT) => boolean,
}

export type ExtractFieldSchemaType<T> = T extends FieldSchema<infer FT> ? FT : never
export type ExtractFieldSchemaTypeValueType<T> = T extends FieldSchemaType<infer U> ? U : never

export class FieldSchema<T extends FieldSchemaType<any>> {
    public readonly config: Required<FieldSchemaConfig<T>>;
    public constructor(public readonly type: T, options?: FieldSchemaOptions<T>) {
        this.config = {
            ... (options && "isPrimary" in options ? { isPrimary: true, isUnique: true, isNonNull: true } : {
                isPrimary: false,
                isUnique: (options as any | undefined)?.isUnique ?? false,
                isNonNull: (options as any | undefined)?.isNonNull ?? false,
            }),

            default: options?.default ?? null,
            check: options?.check ?? (() => true),
        }
    }

    public validate(value: any): boolean {
        return (
            // Null value guard clause
            (this.config.isNonNull ? !isUndefined(value) : true)

            // Type guard clause
            && this.type.validate(value)

            // Additional check function
            && this.config.check(value)
        );
    }
}

export class FieldSchemaTypeError extends Error { }
export type FieldSchemaConversionResult<T> = Result<T, FieldSchemaTypeError>;

export abstract class FieldSchemaType<T> {
    public abstract validate(value: any): value is T;
    public abstract from(value: any): FieldSchemaConversionResult<T>;
}

export namespace schemas {
    export const String = new class StringSchemaType extends FieldSchemaType<string> {
        public validate(value: any): value is string {
            return isString(value)
        }

        public from(value: any): FieldSchemaConversionResult<string> {
            return Result.Ok(isUndefined(value) ? `{value}` : (value.toString() as string))
        }
    }

    export const Int = new class IntSchemaType extends FieldSchemaType<number> {
        public validate(value: any): value is number {
            return isNumber(value, true)
        }

        public from(value: any): FieldSchemaConversionResult<number> {
            return isUndefined(value) ? Result.Ok(0) : isString(value) ? Result.Ok(parseInt(value)) : Result.Err(new FieldSchemaTypeError("cannot convert unknown type to int"))
        }
    }

    export const Float = new class FloatSchemaType extends FieldSchemaType<number> {
        public validate(value: any): value is number {
            return isNumber(value)
        }

        public from(value: any): FieldSchemaConversionResult<number> {
            return isUndefined(value) ? Result.Ok(0) : isString(value) ? Result.Ok(parseInt(value)) : Result.Err(new FieldSchemaTypeError("cannot convert unknown type to float"))
        }
    }
}
