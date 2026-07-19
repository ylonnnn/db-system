import fs from "node:fs";
import path from "node:path";

import { Model, ModelDataContainerColumns, Table } from "../data";
import { table } from "node:console";

export interface SerializedTable<M extends Model> {
    version: number;
    tableName: string;
    savedAt: number;
    rowCount: number;
    data: ModelDataContainerColumns<M>;
}

export type EncryptionFn = (serialized: string, key: string) => string;
export type DecryptionFn = (encrypted: string, key: string) => string;

export class Storage<M extends Model> {
    protected encrypt: EncryptionFn = (serialized) => serialized;
    protected decrypt: DecryptionFn = (encrypted) => encrypted;

    public constructor(
        private table: Table<M>,
        private path: string,
    ) {
        this.load();
    }

    protected serialize(
        data: ModelDataContainerColumns<M>,
        size: number,
    ): string {
        const payload: SerializedTable<M> = {
            version: 1,
            tableName: this.table.name,
            savedAt: Date.now(),
            rowCount: size,
            data,
        };

        return JSON.stringify(payload);
    }

    protected deserialize(serialized: string): SerializedTable<M> {
        return serialized.length
            ? JSON.parse(serialized)
            : {
                  version: 1,
                  tableName: table.name,
                  savedAt: Date.now(),
                  rowCount: 0,
                  data: Object.fromEntries(
                      Object.keys(this.table.model).map((key) => [
                          key,
                          [] as any[],
                      ]),
                  ) as ModelDataContainerColumns<M>,
              };
    }

    public load() {
        if (!fs.existsSync(this.path)) {
            fs.mkdirSync(path.dirname(this.path), { recursive: true });
            fs.writeFileSync(this.path, "");
        }

        const decrypted = this.decrypt(fs.readFileSync(this.path, "utf-8"), "");

        return this.deserialize(decrypted);
    }

    public save(data: ModelDataContainerColumns<M>, size: number) {
        const serialized = this.serialize(data, size);
        const encrypted = this.encrypt(serialized, "");

        fs.writeFileSync(this.path, encrypted, "utf-8");
    }
}
