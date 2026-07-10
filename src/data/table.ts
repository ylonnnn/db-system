import { Option, PartialBy, Result, isObject, runJob } from "../utils";
import { BPlusTree, Key } from "./bp_tree";
import { Database } from "./database";
import type {
    Model,
    ModelData,
    ModelDataContainer,
    ModelDataContainerRowCacheKey,
    ModelOptionalField,
    ModelPlan,
    ModelPrimaryKey,
    ModelPrimaryKeyType,
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
    private __indices = new Map<keyof M, BPlusTree<number>>();
    private __container = {
        epoch: 0,
        columns: {},
        rows: new Map(),
        tombstone: new Uint8Array(),
        dead: 0,
    } as ModelDataContainer<M>;
    private __plan: ModelPlan<M>[] = [];
    private __primaryKey: ModelPrimaryKey<M> | undefined = undefined;

    public constructor(
        public readonly name: string,
        public readonly model: M,
    ) {
        let primaryKeyCount = 0;
        for (const key in this.model) {
            const field = this.model[key];
            if (field.config.primary) {
                this.__primaryKey = key as unknown as ModelPrimaryKey<M>;
                ++primaryKeyCount;
            }

            this.__container.columns[key] = [] as any[];
            this.__plan.push({
                key,
                column: this.__container.columns[key],
                default: field.config.default as (() => any) | null,
                index:
                    (field.config.primary ? this.createIndex(key) : undefined,
                    this.__indices.get(key)),
            });
        }

        if (primaryKeyCount > 1)
            throw new Error(
                "a Model cannot have more than one (1) independent primary key.",
            );

        if (this.__primaryKey) this.createIndex(this.__primaryKey);

        // TODO: Load
        // this.__container.tombstone = new Uint8Array(this.__container.rows.size)
    }

    public createIndex<K extends keyof M>(field: K) {
        if (!this.__indices.has(field)) this.updateIndex(field);
    }

    public updateIndex<K extends keyof M>(field: K) {
        const tree = new BPlusTree<number>(Database.MAXIMUM_INDEX_KEY_COUNT);

        let i = 0;
        for (const [pk, row] of this.__container.rows)
            tree.add(new Key(row[field], pk), i++);

        this.__indices.set(field, tree);
    }

    protected cacheKey(idx: number): ModelDataContainerRowCacheKey<M> {
        return (
            this.__primaryKey
                ? this.__container.columns[this.__primaryKey][idx]
                : idx
        ) as ModelDataContainerRowCacheKey<M>;
    }

    // TODO: handle duplicate values for fields that must be unique
    protected store(data: PartialBy<ModelData<M>, ModelOptionalField<M>>) {
        const row = { ...data } as ModelData<M>;
        for (let i = 0; i < this.__plan.length; ++i) {
            const field = this.__plan[i];
            const { key, column, default: def } = field;

            column.push((row[key] ??= (def?.() as any) ?? null));

            if (!field.index) field.index = this.__indices.get(key);
            field.index?.add(
                new Key(
                    row[key],
                    this.__primaryKey ? row[this.__primaryKey] : undefined,
                ),
                this.__container.rows.size,
            );
        }

        this.__container.rows.set(
            (this.__primaryKey
                ? row[this.__primaryKey]
                : this.__container.rows
                      .size) as ModelDataContainerRowCacheKey<M>,
            row,
        );
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

    protected delete(
        idx: number,
        compact: boolean = true,
        epoch: number = this.__container.epoch,
    ) {
        // To avoid using indices that were previously valid but got invalidated
        if (epoch !== this.__container.epoch) return;

        if (this.__container.tombstone.length < this.__container.rows.size) {
            const newByteArr = new Uint8Array(this.__container.rows.size);
            newByteArr.set(this.__container.tombstone);
            this.__container.tombstone = newByteArr;
        }

        if (this.__container.tombstone[idx]) return;

        this.__container.tombstone[idx] = 1;
        ++this.__container.dead;

        if (
            compact &&
            this.__container.dead / this.__container.rows.size >= 0.25
        ) {
            this.compact();
            this.__container.dead = 0;
        }
    }

    protected bulkDelete(
        indices: number[],
        epoch: number = this.__container.epoch,
    ) {
        // Avoid invalidated position deletion
        if (epoch !== this.__container.epoch) return;

        const del = this.delete.bind(this),
            compact = this.compact.bind(this),
            { __container } = this;

        function* bulk() {
            for (const idx of indices) yield del(idx, false, epoch);

            compact();
            __container.dead = 0;
        }

        runJob(bulk());
    }

    protected compact() {
        const n = this.__container.rows.size;
        let write = 0;

        for (let read = 0; read < n; ++read) {
            const readCacheKey = this.cacheKey(read),
                writeCacheKey = this.cacheKey(write);

            const indexBased = !this.__primaryKey;

            if (this.__container.tombstone[read]) {
                this.__container.tombstone[read] = 0;
                if (!indexBased) this.__container.rows.delete(readCacheKey);
                else {
                    if (read + 1 < n)
                        this.__container.rows.set(
                            writeCacheKey,
                            this.__container.rows.get(
                                this.cacheKey(read + 1),
                            ) as ModelData<M>,
                        );
                    else this.__container.rows.delete(writeCacheKey);
                }

                continue;
            }

            for (const key in this.model) {
                this.__container.columns[key][write] =
                    this.__container.columns[key][read];
            }

            ++write;
        }

        for (const key in this.model) {
            const values = this.__container.columns[key];
            values.splice(write);
        }

        ++this.__container.epoch;

        for (const [field] of this.__indices) this.updateIndex(field);
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
            for (const row of data) {
                const result = write(row);
                if (result.isErr()) return result;
                yield result;
            }
        }

        return runJob(bulk());
    }

    public erase(options: TableDataQueryOptions<M>) {
        const [epoch, result] = this.query(options, true);
        this.bulkDelete(runJob(result), epoch);
    }

    public clear() {
        this.__container.epoch = 0;

        for (const key in this.model) this.__container.columns[key] = [];
        this.__container.rows = new Map();

        this.__container.tombstone = new Uint8Array(
            this.__container.tombstone.length,
        );
        this.__container.dead = 0;

        this.__indices.clear();
        for (const plan of this.__plan) plan.index = undefined;
    }

    public query<P extends boolean = false>(
        options: TableDataQueryOptions<M>,
        asPos: P = false as P,
    ): [
        epoch: number,
        result: Generator<P extends true ? number : ModelData<M>>,
    ] {
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

        residual.sort(
            (a, b) =>
                this.model[b[0]].prioritization(b[1][0]) -
                this.model[a[0]].prioritization(a[1][0]),
        );

        // TEMP: TODO: improve lookup, use a table of frequency distribution of values
        let result!: Generator<number>;
        if (seekable.length <= 0) {
            const n = this.__container.rows.size;
            result = (function* () {
                for (let i = 0; i < n; ++i) yield i;
            })();
        } else {
            const [candidate] = seekable;
            const fieldQuery = options[candidate[0]]!,
                [op] = fieldQuery;

            const candidateIndex = this.__indices.get(seekable[0][0])!;
            switch (op) {
                case TableDataQueryOperation.Eq: {
                    const [, val] = fieldQuery;
                    result = candidateIndex.find(val, undefined, false);
                    break;
                }

                case TableDataQueryOperation.Range: {
                    const [, min, max] = fieldQuery;
                    result = candidateIndex.find(min, max, false);
                    break;
                }

                case TableDataQueryOperation.Within:
                    // TODO
                    throw new Error("todo");
            }
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

        const { __container, __primaryKey } = this;
        function* filter() {
            for (const pos of result) {
                if (
                    comparators.every(({ field, cmp }) =>
                        cmp(__container.columns[field][pos]),
                    )
                ) {
                    if (__container.tombstone[pos]) continue;
                    yield (
                        asPos
                            ? pos
                            : (__container.rows.get(
                                  (__primaryKey
                                      ? __container.columns[__primaryKey][pos]
                                      : pos) as ModelDataContainerRowCacheKey<M>,
                              ) as ModelData<M>)
                    ) as P extends true ? number : ModelData<M>;
                }
            }
        }

        return [__container.epoch, filter()];
    }

    /**
     * NOTE: This function does not have a constant time look-up due to
     * the process of ensuring the validity of data.
     */
    public findByPk(pk: ModelPrimaryKeyType<M>): ModelData<M> | undefined {
        if (!this.__primaryKey) return undefined;

        const pos = [
            ...this.__indices.get(this.__primaryKey)!.find(pk),
        ][0]?.[1];

        return pos !== undefined
            ? this.__container.rows.get(this.cacheKey(pos))
            : undefined;
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
