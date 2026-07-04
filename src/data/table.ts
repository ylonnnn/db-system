import { Option, isObject } from "../utils";
import { BPlusTree } from "./bp_tree";
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
        ? T
        : never;
};

export type ModelDataContainer<
    M extends Model,
    D extends ModelData<M> = ModelData<M>,
> = {
    [K in keyof D]: D[K][];
};

export class Table<M extends Model> {
    public container = {} as ModelDataContainer<M>;
    private __indices = new Map<keyof M, BPlusTree<ModelData<M>>>();

    public constructor(
        public readonly name: string,
        public readonly model: M,
    ) {
        for (const key in this.model) this.container[key] = [] as any[];
    }

    public createIndex<K extends keyof M>(field: K) {
        if (this.__indices.has(field)) return;

        this.__indices.set(
            field,
            new BPlusTree(Database.MAXIMUM_INDEX_KEY_COUNT),
        );
    }

    public write(data: Partial<ModelData<M>>) {
        // TODO: use Result<_, _>
        const valid = this.validate(data);
        console.log(`valid: ${valid}`);
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
