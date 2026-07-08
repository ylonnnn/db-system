import { Option, PartialBy, Result, isObject, runJob } from "../utils";
import { BPlusTree, Key } from "./bp_tree";
import { Database } from "./database";
import type {
    Model,
    ModelData,
    ModelDataContainer,
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

    public *query(options: TableDataQueryOptions<M>) {
        const seekable: [keyof M, TableDataQueryFieldOption<any>][] = [];
        const residual: [keyof M, TableDataQueryFieldOption<any>][] = [];

        for (const { key, index } of this.__plan) {
            const fieldQuery = options[key];
            if (!fieldQuery) continue;

            const pair = [key, fieldQuery] as [
                keyof M,
                TableDataQueryFieldOption<any>,
            ];

            fieldQuery[0] !== TableDataQueryOperation.Predicate && index
                ? seekable.push(pair)
                : residual.push(pair);
        }

        seekable.sort(
            (a, b) =>
                this.model[b[0]].prioritization(b[1][0]) -
                this.model[a[0]].prioritization(a[1][0]),
        );

        // TEMP: TODO: improve lookup, use a table of frequency distribution of values
        const [candidate] = seekable;
        const fieldQuery = options[candidate[0]]!,
            [op] = fieldQuery;

        const candidateIndex = this.__indices.get(seekable[0][0])!;
        let result!: [Key, ModelData<M>][];
        switch (op) {
            case TableDataQueryOperation.Eq: {
                const [, val] = fieldQuery;
                result = runJob(candidateIndex.find(val));
                break;
            }

            case TableDataQueryOperation.Range: {
                const [, min, max] = fieldQuery;
                result = runJob(candidateIndex.find(min, max));
                break;
            }

            case TableDataQueryOperation.Within:
                // TODO
                throw new Error("todo");
        }

        const comparators = seekable
            .slice(1)
            .concat(residual)
            .map(([field, query]) => {
                const [op] = query;
                return {
                    field,
                    cmp: {
                        [TableDataQueryOperation.Eq]: (x: any) =>
                            x === query[1],
                        [TableDataQueryOperation.Range]: (x: any) =>
                            x >= query[1] && x < query[2],
                        [TableDataQueryOperation.Within]: (x: any) =>
                            query[1].includes(x),
                        [TableDataQueryOperation.Predicate]: (x: any) =>
                            query[1](x),
                    }[op],
                };
            });

        for (const val of result) {
            if (comparators.every(({ field, cmp }) => cmp(val[1][field])))
                yield val;
        }
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

export enum TableDataQueryOperation {
    Eq,
    Range,
    Within,
    Predicate,
}

export type TableDataQueryFieldOption<T> =
    | [op: TableDataQueryOperation.Eq, value: T]
    | [op: TableDataQueryOperation.Range, min: T, max: T]
    | [op: TableDataQueryOperation.Within, values: T[]]
    | [op: TableDataQueryOperation.Predicate, predicate: (val: T) => boolean];

export type TableDataQueryOptions<M extends Model> = {
    [K in keyof M]?: TableDataQueryFieldOption<ModelData<M>[K]>;
};

export namespace query {
    export const eq = <T>(val: T): TableDataQueryFieldOption<T> => [
        TableDataQueryOperation.Eq,
        val,
    ];
    export const range = <T>(min: T, max: T): TableDataQueryFieldOption<T> => [
        TableDataQueryOperation.Range,
        min,
        max,
    ];
    export const within = <T>(values: T[]): TableDataQueryFieldOption<T> => [
        TableDataQueryOperation.Within,
        values,
    ];
    export const predicate = <T>(
        predicate: (val: T) => boolean,
    ): TableDataQueryFieldOption<T> => [
        TableDataQueryOperation.Predicate,
        predicate,
    ];
}
