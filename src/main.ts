import {
    Database,
    ExtractModel,
    float,
    int,
    ModelOptionalField,
    ModelRequiredField,
    string,
} from "./data";

main();

function main(): void {
    let counter = 0;
    const db = new Database("test");
    const table = db.tables.create("Product", {
        id: int()
            .primaryKey()
            .default(() => counter++),
        name: string().nonNull(),
        description: string().check((value) => value.length <= 256),
        price: float().nonNull(),
    });

    table.createIndex("id");
    table.createIndex("price");

    table.bulkWrite([
        { name: "test 0", price: 12.8 },
        { name: "test 1", price: 1.0 },
        { name: "test 2", price: 120 },
    ]);
}
