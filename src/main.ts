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
            check: (data) => data.length <= 64,
        }),
        price: new FieldSchema(schemas.Float),
        description: new FieldSchema(schemas.String, {
            check: (data) => data.length <= 256,
        }),
    });

    table.createIndex("id");

    table.bulkWrite([
        {
            name: "test",
            price: 12.8,
        },
        {
            name: "bread",
            price: 1.0,
        },
    ]);

    console.log(table);

    // @ts-expect-error
    console.log(table.__container.rows);
}
