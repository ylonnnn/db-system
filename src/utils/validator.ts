export function isString(value: any): value is string {
    return typeof value === "string"
}

export function isNumber(value: any, intOnly: boolean = false): value is number {
    return typeof value === "number" && (!intOnly || value === Math.floor(value))
}

export function isUndefined(value: any): value is undefined {
    return typeof value === "undefined"
}

export function isObject(value: any, allowArrays: boolean = false): value is Record<any, any> {
    return typeof value === "object" && value !== null && (allowArrays || !Array.isArray(value))
}
