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
    const db = new Database("test");
    const table = db.tables.create("Product", {
        storeId: string().primaryKey(),
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
        Array(4096)
            .fill(null)
            .map((_, i) => {
                const price = Math.random() * 5000;
                return {
                    storeId: `STORE_ID:${i}`,
                    name: `test ${i}`,
                    price: Math.random() < 0.5 ? price : Math.round(price),
                };
            }),
    );

    const result = [
        ...table.query({
            price: query.predicate((v: number) => v >= 4000 && v <= 4250),
        }),
    ];

    // table.erase({name})

    console.log(result, result.length);
}
