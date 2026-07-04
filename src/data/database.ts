import { Storage } from "../storage";
import { Table, TableMap } from "./table";

export class Database {
    public static MAXIMUM_INDEX_KEY_COUNT: number = 32;

    private _storage: Storage;
    private _tables: TableMap;

    public constructor(public readonly identifier: string) {
        this._storage = new Storage(`/data/{identifier}`);
        this._tables = new TableMap();
    }

    public get tables() {
        return this._tables;
    }
}
