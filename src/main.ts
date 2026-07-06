import {
    Approximation,
    BPlusTree,
    Database,
    FieldSchema,
    InternalNode,
    Key,
    LeafNode,
    Node,
    schemas,
} from "./data";

main();

function main(): void {
    let counter = 0;
    const db = new Database("test");
    const table = db.tables.create("Product", {
        id: new FieldSchema(schemas.Int, {
            isPrimary: true,
            default: () => counter++,
        }),
        name: new FieldSchema(schemas.String, {
            isNonNull: true,
            check: (data) => data.length <= 64,
        }),
        price: new FieldSchema(schemas.Float, { isNonNull: true }),
        description: new FieldSchema(schemas.String, {
            check: (data) => data.length <= 256,
        }),
    });

    table.createIndex("id");
    table.createIndex("price");

    table.bulkWrite([
        { name: "not test", price: 12.8 },
        { name: "test", price: 1.0 },
        { name: "test", price: 120 },
    ]);

    console.log(table);
}
