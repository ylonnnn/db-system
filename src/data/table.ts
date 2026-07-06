import { Option, Result, isObject, runJob } from "../utils";
import { BPlusTree, Key } from "./bp_tree";
import { Database } from "./database";
import { ExtractFieldSchemaType, FieldSchema, FieldSchemaType } from "./schema";

export class TableMap {
    protected _data: Map<string, Table<any>>;

    public constructor() {
        this._data = new Map();
    }

    public create<T extends Model>(name: string, model: T) {
        const table = new Table(name, model);
        this._data.set(name, table);

        return table;
    }

    public get<T extends Model>(name: string): Option<Table<T>> {
        return new Option(this._data.get(name));
    }
}

export type Model = Record<string, FieldSchema<any>>;
export type ExtractModel<T> = T extends Table<infer M> ? M : never;

export type ModelData<M extends Model> = {
    [K in keyof M]: ExtractFieldSchemaType<M[K]> extends FieldSchemaType<
        infer T
    >
        ? T | null
        : never;
};

export interface ModelDataContainer<M extends Model> {
    columns: { [K in keyof ModelData<M>]: ModelData<M>[K][] };
    rows: ModelData<M>[];
}

export interface ModelPlan<M extends Model, K extends keyof M = keyof M> {
    key: K;
    column: ModelData<M>[K][];
    default: (() => ModelData<M>[K]) | null;
    index: BPlusTree<ModelData<M>> | undefined;
}

export enum TableOperationError {
    InvalidWriteData,
}

export class Table<M extends Model> {
    private __indices = new Map<keyof M, BPlusTree<ModelData<M>>>();
    private __container = {
        columns: {},
        rows: [] as ModelData<M>[],
    } as ModelDataContainer<M>;
    private __plan: ModelPlan<M>[] = [];

    public constructor(
        public readonly name: string,
        public readonly model: M,
    ) {
        let hasPrimary = false;
        for (const key in this.model) {
            const field = this.model[key];
            hasPrimary ||= field.config.isPrimary;

            this.__container.columns[key] = [] as any[];
            this.__plan.push({
                key,
                column: this.__container.columns[key],
                default: field.config.default as (() => any) | null,
                index: this.__indices.get(key),
            });
        }

        // TODO: handle models with no primary keys
    }

    public createIndex<K extends keyof M>(field: K) {
        if (this.__indices.has(field)) return;

        // TODO: allow any kind of field to be used as keys
        // for the B+ tree.

        const tree = new BPlusTree<ModelData<M>>(
            Database.MAXIMUM_INDEX_KEY_COUNT,
        );

        for (const row of this.__container.rows) {
            tree.add(
                new Key(
                    row[field],
                    /* TODO: use primary keys as the secondary value in the key */
                ),
                row,
            );
        }

        this.__indices.set(field, tree);
    }

    protected normalize(data: Partial<ModelData<M>>): ModelData<M> {
        for (const key in this.model)
            data[key] =
                ((data[key] ?? this.model[key].config.default?.()) as any) ??
                null;

        return data as ModelData<M>;
    }

    protected store(data: ModelData<M>) {
        this.__container.rows.push(data);

        for (let i = 0; i < this.__plan.length; ++i) {
            const field = this.__plan[i];
            const { key, column, default: def } = field;

            column.push(data[key] ?? (def?.() as any) ?? null);

            if (!field.index) field.index = this.__indices.get(key);
            field.index?.add(
                new Key(
                    data[key],
                    /* TODO: use its own schema to convert values to key representations */
                    /* TODO: use primary keys as the secondary value in the key */
                ),
                data,
            );
        }
    }

    protected bulkStore(data: ModelData<M>[]) {
        const store = this.store.bind(this);
        function* bulk() {
            for (const row of data) {
                store(row);
                yield;
            }
        }

        runJob(bulk());
    }

    public write(
        data: Partial<ModelData<M>>,
    ): Result<void, TableOperationError> {
        // TODO: use Result<_, _>
        if (!this.validate(data))
            return Result.Err(TableOperationError.InvalidWriteData);

        const row = this.normalize(data);
        this.store(row);

        return Result.Ok(undefined);
    }

    public bulkWrite(data: Partial<ModelData<M>>[]) {
        const write = this.write.bind(this);
        function* bulk() {
            for (const row of data) yield write(row);
        }

        return runJob(bulk());
    }

    public validate(value: any): boolean {
        if (!isObject(value)) return false;

        const fields = new Set(Object.keys(this.model));
        for (const key in value) {
            if (!(key in this.model)) return false;

            const field = this.model[key];
            fields.delete(key);
            if (!field.validate(value[key])) return false;
        }

        for (const missingField of fields) {
            const field = this.model[missingField];

            if (field.config.isNonNull) {
                // Check first if the field will have a default value.
                // Otherwise, the value will be invalidated due to a missing field
                if (field.config.default == null) return false;
                continue;
            }
        }

        return true;
    }
}
