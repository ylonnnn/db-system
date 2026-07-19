import { DecryptionFn, EncryptionFn } from "../storage";
import { TableMap } from "./table";

export class Database {
    public static MAXIMUM_INDEX_KEY_COUNT: number = 32;

    private _tables: TableMap;

    public constructor(
        public readonly identifier: string,
        public encryption: EncryptionFn = (serialized) => serialized,
        public decryption: DecryptionFn = (encrypted) => encrypted,
    ) {
        this._tables = new TableMap(this);
    }

    public get tables() {
        return this._tables;
    }
}
