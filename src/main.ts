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

const HIDDEN_SECRET_KEY = "some_secret";

main();

function xorEncryptionDecryption(str: string, key: string) {
    let result = new Uint16Array(str.length);
    for (let i = 0; i < str.length; ++i)
        result[i] = str.charCodeAt(i) ^ key.charCodeAt(i % key.length);

    return String.fromCharCode.apply(null, result as unknown as number[]);
}

function main(): void {
    let counter = 0;
    const db = new Database("test");
    const start = performance.now();
    const table = db.tables.create(
        HIDDEN_SECRET_KEY,
        "Product",
        {
            id: int()
                .primaryKey()
                .default(() => counter++),
            name: string().nonNull(),
            description: string().check(
                (value) => !value || value.length <= 256,
            ),
            price: float().nonNull(),
        },
        xorEncryptionDecryption,
        xorEncryptionDecryption,
    );

    console.log(
        `initialized table ${table.name}: ${performance.now() - start}`,
    );

    type ProductTable = typeof table;
    type ProductModel = ExtractModel<ProductTable>;
    type ProductModelRF = ModelRequiredField<ProductModel>;
    type ProductModelOF = ModelOptionalField<ProductModel>;

    type ProductPK = ModelPrimaryKey<ProductModel>;
    type ProductPKType = ModelPrimaryKeyType<ProductModel>;

    console.log([...table.query({})[1]]);
}
