import { Option, PartialBy, Result, isObject, runJob } from "../utils";
import { BPlusTree, Key } from "./bp_tree";
import { Database } from "./database";
import type {
    Model,
    ModelData,
    ModelDataContainer,
    ModelNullableField,
    ModelOptionalField,
    ModelPlan,
} from "./model";

export class TableMap {
    protected _data: Map<string, Table<any>>;

    public constructor() {
        this._data = new Map();
    }

    public create<M extends Model>(name: string, model: M) {
        const table = new Table<M>(name, model);
        this._data.set(name, table);

        return table;
    }

    public get<M extends Model>(name: string): Option<Table<M>> {
        return new Option(this._data.get(name));
    }
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
            hasPrimary ||= field.config.primary;

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

    protected store(data: PartialBy<ModelData<M>, ModelOptionalField<M>>) {
        const row = data as ModelData<M>;
        for (let i = 0; i < this.__plan.length; ++i) {
            const field = this.__plan[i];
            const { key, column, default: def } = field;

            column.push((row[key] ??= (def?.() as any) ?? null));

            if (!field.index) field.index = this.__indices.get(key);
            field.index?.add(
                new Key(
                    row[key],
                    /* TODO: use primary keys as the secondary value in the key */
                ),
                row,
            );
        }

        this.__container.rows.push(row);
    }

    protected bulkStore(
        data: PartialBy<ModelData<M>, ModelOptionalField<M>>[],
    ) {
        const store = this.store.bind(this);
        function* bulk() {
            for (const row of data) yield store(row);
        }

        runJob(bulk());
    }

    public write(
        data: PartialBy<ModelData<M>, ModelOptionalField<M>>,
    ): Result<void, TableOperationError> {
        return this.validate(data)
            ? Result.Ok(this.store(data))
            : Result.Err(TableOperationError.InvalidWriteData);
    }

    public bulkWrite(data: PartialBy<ModelData<M>, ModelOptionalField<M>>[]) {
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

            if (field.config.nonNull) {
                // Check first if the field will have a default value.
                // Otherwise, the value will be invalidated due to a missing field
                if (field.config.default == null) return false;
                continue;
            }
        }

        return true;
    }
}
