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
    const start = performance.now();
    const table = db.tables.create("Product", {
        id: int()
            .primaryKey()
            .default(() => counter++),
        name: string().nonNull(),
        description: string().check((value) => value.length <= 256),
        price: float().nonNull(),
    });
    console.log(
        `initialized table ${table.name}: ${performance.now() - start}`,
    );

    type ProductTable = typeof table;
    type ProductModel = ExtractModel<ProductTable>;
    type ProductModelRF = ModelRequiredField<ProductModel>;
    type ProductModelOF = ModelOptionalField<ProductModel>;

    type ProductPK = ModelPrimaryKey<ProductModel>;
    type ProductPKType = ModelPrimaryKeyType<ProductModel>;

    console.log(
        table.write({
            name: "sample product",
            price: 123,
            description: "just a sample product",
        }),
    );

    table.save();

    console.log([...table.query({})[1]]);

    // table.save();
}
