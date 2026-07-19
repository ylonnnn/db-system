import { BPlusTree } from "./bp_tree";
import { FieldSchema, FieldSchemaType } from "./schema";
import { Table } from "./table";

export type Model = Record<string, FieldSchema<any, boolean, boolean>>;
export type ModelPrimaryKey<M extends Model> = {
    [K in keyof M]: M[K] extends FieldSchema<infer _, true, infer __, infer ___>
        ? K
        : never;
}[keyof M];
export type ModelPrimaryKeyType<M extends Model> =
    M[ModelPrimaryKey<M>] extends FieldSchema<
        FieldSchemaType<infer T>,
        infer _,
        infer __,
        infer ___
    >
        ? T
        : never;

export type ModelNonNullableField<M extends Model> = keyof {
    [
        K in keyof M as M[K] extends FieldSchema<
            infer _,
            infer __,
            infer TNotNull,
            infer ___
        >
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
            infer __,
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
        infer _,
        infer TNotNull,
        infer __
    >
        ? TNotNull extends true
            ? T
            : T | null
        : never;
};

export interface ModelDataContainer<M extends Model> {
    epoch: number;

    columns: ModelDataContainerColumns<M>;
    rows: ModelDataContainerRows<M>;

    tombstone: Uint8Array;
    dead: number;
}
export type ModelDataContainerColumns<M extends Model> = {
    [K in keyof ModelData<M>]: ModelData<M>[K][];
};
export type ModelDataContainerRows<M extends Model> = Map<
    ModelDataContainerRowCacheKey<M>,
    ModelData<M>
>;

export type ModelDataContainerRowCacheKey<M extends Model> =
    ModelPrimaryKeyType<M> extends never ? number : ModelPrimaryKeyType<M>;

// export interface ModelPlan<M extends Model, K extends keyof M = keyof M> {
//     key: K;
//     column: ModelData<M>[K][];
//     frequency: Map<ModelData<M>[K], number>;
//     default: (() => ModelData<M>[K]) | null;
//     index: BPlusTree<number> | undefined;
// }
