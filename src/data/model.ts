import { BPlusTree } from "./bp_tree";
import { FieldSchema, FieldSchemaType } from "./schema";
import { Table } from "./table";

export type Model = Record<string, FieldSchema<any, boolean>>;

export type ModelNonNullableField<M extends Model> = keyof {
    [
        K in keyof M as M[K] extends FieldSchema<infer _, infer TNotNull>
            ? TNotNull extends true
                ? K
                : never
            : never
    ]: void;
};
export type ModelNullableField<M extends Model> = keyof Omit<
    M,
    ModelNonNullableField<M>
>;

export type ModelRequiredField<M extends Model> = keyof {
    [
        K in keyof M as M[K] extends FieldSchema<
            infer _,
            infer TNotNull,
            infer TDefault
        >
            ? TNotNull extends true
                ? TDefault extends null
                    ? K
                    : never
                : never
            : never
    ]: void;
};
export type ModelOptionalField<M extends Model> = keyof Omit<
    M,
    ModelRequiredField<M>
>;

export type ExtractModel<T> = T extends Table<infer M> ? M : never;

export type ModelData<M extends Model> = {
    [K in keyof M]: M[K] extends FieldSchema<
        FieldSchemaType<infer T>,
        infer TNotNull
    >
        ? TNotNull extends true
            ? T
            : T | null
        : never;
};

export interface ModelDataContainer<M extends Model> {
    columns: {
        [K in keyof ModelData<M>]: ModelData<M>[K][];
    };
    rows: ModelData<M>[];
}

export interface ModelPlan<M extends Model, K extends keyof M = keyof M> {
    key: K;
    column: ModelData<M>[K][];
    default: (() => ModelData<M>[K]) | null;
    index: BPlusTree<ModelData<M>> | undefined;
}
