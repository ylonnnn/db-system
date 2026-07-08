import {
    Database,
    ExtractModel,
    float,
    int,
    ModelOptionalField,
    ModelRequiredField,
    query,
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

    table.bulkWrite(
        Array(4096)
            .fill(null)
            .map((_, i) => {
                const price = Math.random() * 5000;
                return {
                    name: `test ${i}`,
                    price: Math.random() < 0.5 ? price : Math.round(price),
                };
            }),
    );

    const result = [
        ...table.query({
            price: query.predicate((val) => val >= 2750),
            id: query.range(10, 250),
        }),
    ];

    console.log(result, result.length);
}
