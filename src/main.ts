import {
    Database,
    ExtractModel,
    float,
    int,
    ModelOptionalField,
    ModelPrimaryKey,
    ModelPrimaryKeyType,
    ModelRequiredField,
    query,
    string,
    TableDataQueryOptions,
} from "./data";

main();

function main(): void {
    let counter = 0;
    const db = new Database("test");
    const table = db.tables.create("Product", {
        // id: int()
        //     .primaryKey()
        // .default(() => counter++),
        uid: string().primaryKey(),
        name: string().nonNull(),
        description: string().check((value) => value.length <= 256),
        price: float().nonNull(),
    });

    type ProductTable = typeof table;
    type ProductModel = ExtractModel<ProductTable>;
    type ProductModelRF = ModelRequiredField<ProductModel>;
    type ProductModelOF = ModelOptionalField<ProductModel>;

    type ProductPK = ModelPrimaryKey<ProductModel>;
    type ProductPKType = ModelPrimaryKeyType<ProductModel>;

    // table.createIndex("id");
    // table.createIndex("price");

    // // @ts-expect-error
    // table.__container.rows.keys();

    table.bulkWrite(
        Array(10)
            .fill(null)
            .map((_, i) => {
                const price = Math.random() * 5000;
                return {
                    uid: `UID_${i}`,
                    name: `test ${i}`,
                    price: Math.random() < 0.5 ? price : Math.round(price),
                };
            }),
    );

    // const result = [
    //     ...table.query(
    //         {
    //             // id: query.range(10, 500),
    //             price: query.range(3500, 4000),
    //         },
    //         true,
    //     ),
    // ];

    console.log([...table.query({})[1]].map((v) => JSON.stringify(v)));

    table.update(
        { price: query.range(3000, 4500) },
        {
            // uid: "UID_2",
            name: (prevName) => `${prevName} [updated]`,
            price: (prevPrice) => prevPrice * (Math.random() * 5) + 1,
        },
    );

    console.log([...table.query({})[1]].map((v) => JSON.stringify(v)));
}
