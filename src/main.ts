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
    const tree = new BPlusTree(32);
    const exclude: number[] = [];

    for (const key of Array(4096)
        .fill(0)
        .map((_, i) => i))
    // .map((_, __, { length }) => Math.round(Math.random() * length))
    {
        if (exclude.includes(key)) continue;

        tree.add(new Key(key, key), key);
    }

    console.log(tree.toString());
    const result = tree.find(50, 61);
    console.log(result);

    // let counter = 0;
    // const db = new Database("test");
    // const table = db.tables.create("Product", {
    //     id: new FieldSchema(schemas.Int, {
    //         isPrimary: true,
    //         default: () => counter++,
    //     }),
    //     name: new FieldSchema(schemas.String, {
    //         check: (data) => data.length <= 64,
    //     }),
    //     price: new FieldSchema(schemas.Float),
    //     description: new FieldSchema(schemas.String, {
    //         check: (data) => data.length <= 256,
    //     }),
    // });

    // table.createIndex

    // table.write({ name: "bread", price: 2 })
    // table.createIndex("id")
}
