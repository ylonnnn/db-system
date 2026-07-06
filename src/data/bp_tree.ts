import { Result } from "../utils";

export class BPlusTree<T> {
    private root: Node<T>;

    public constructor(private n: number) {
        this.root = new LeafNode(this.n);
    }

    public toString(): string {
        return this.root.toString();
    }

    public add(key: Key, data: T): BPlusTree<T> {
        return ((this.root = this.root.add(key, data)), this);
    }

    public remove(key: Key): BPlusTree<T> {
        this.root.remove(key);
        if (
            !(this.root instanceof InternalNode) ||
            this.root.keys.length !== 0 ||
            this.root.children.length !== 1
        )
            return this;

        const root = this.root as InternalNode<T>;
        const child = root.children[0];

        child.parent = undefined;
        this.root = child;

        return this;
    }

    public find(min: any, max?: any): [key: Key, data: T][] {
        const less = this.root.find(new Key(min), Approximation.ExactOrGreater),
            greater = this.root.find(
                max ? new Key(max) : new Key(min),
                max ? Approximation.Less : Approximation.Greater,
            );

        console.log(less?.[1], greater?.[1]);
        console.log(less?.[0], greater?.[0]);

        const entries: [Key, T][] = [];
        let curr: LeafNode<T> | null = less?.[1] ?? null;

        while (curr !== null) {
            const start = curr === less?.[1] ? less[0] : 0,
                end = curr === greater?.[1] ? greater?.[0] : curr.keyCount();
            for (let i = start; i < end; ++i) entries.push(curr.entry(i));

            if (curr === greater?.[1]) break;
            curr = curr.next;
        }

        return entries;
    }
}

export enum Comparison {
    Equal,
    NotEqual,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
}

export enum Approximation {
    // Exact matches
    ExactOnly,

    // Exact or less approximate
    ExactOrLess,

    // Exact or greater approximate
    ExactOrGreater,

    // First approximate lesser than expected
    Less,

    // First approximate greater than expected
    Greater,
}

export class Key {
    public constructor(
        public primary: any,
        public readonly secondary?: any,
    ) {}

    public repr(): string {
        return `${this.primary}${this.secondary ? `_${this.secondary}` : ""}`;
    }

    protected compareValues(a: any, b: any): -1 | 0 | 1 {
        if (typeof a !== typeof b)
            throw new Error("two values of different types are incomparable");

        if (a instanceof Date && b instanceof Date) {
            const diff = a.getTime() - b.getTime();
            return diff < 0 ? -1 : diff > 0 ? 1 : 0;
        }

        if (a < b) return -1;
        if (a > b) return 1;

        return 0;
    }

    public compare(other: Key): -1 | 0 | 1 {
        if (this.primary !== other.primary)
            return this.compareValues(this.primary, other.primary);
        return this.secondary && other.secondary
            ? this.compareValues(this.secondary, other.secondary)
            : 0;
    }
}

export enum NodeOperationError {
    InvalidSplit,
    InvalidMerge,
    InvalidBorrow,
}

export abstract class Node<T> {
    // NOTE: This field is utilized for operations and is not consistently maintained,
    // and will only update during the usage of the node.
    public currentIndex: number = -1;

    public constructor(
        protected readonly n: number,
        public parent: InternalNode<T> | undefined,
        protected keys: Key[] = [],
    ) {}

    public abstract repr(): Record<string, any>;
    public toString(): string {
        return JSON.stringify(this.repr(), null, 4).replace(
            /\[([^\[\]]*)\]/g,
            (match) => match.replace(/\s+/g, " "),
        );
    }

    public keyCount(): number {
        return this.keys.length;
    }

    public left(): Node<T> | undefined {
        return this.parent && this.currentIndex > 0
            ? this.parent.children[this.currentIndex - 1]
            : undefined;
    }

    public right(): Node<T> | undefined {
        return this.parent &&
            this.currentIndex < this.parent.children.length - 1
            ? this.parent.children[this.currentIndex + 1]
            : undefined;
    }

    public abstract minKeys(): number;

    public abstract add(key: Key, data: T): Node<T>;
    public abstract remove(key: Key): void;

    public abstract split(): Result<InternalNode<T>, NodeOperationError>;
    protected splitKeys(
        offset: number = 1,
    ): Result<[mid: number, left: Key[], right: Key[]], NodeOperationError> {
        if (this.keys.length <= this.n)
            return Result.Err(NodeOperationError.InvalidSplit);

        const mid = Math.floor(this.n / 2) + offset;
        const rightKeys = this.keys.splice(mid);

        return Result.Ok([mid, this.keys, rightKeys]);
    }

    // public abstract arbitraryMerge(node: Node<T>): Result<void, NodeOperationError>
    public abstract mergeLeft(left: Node<T>): Result<void, NodeOperationError>;
    public abstract mergeRight(
        right: Node<T>,
    ): Result<void, NodeOperationError>;

    public abstract borrowLeft(): Result<void, NodeOperationError>;
    public abstract borrowRight(): Result<void, NodeOperationError>;

    public abstract find(
        key: Key,
        approximation?: Approximation,
    ): [index: number, node: LeafNode<T>] | undefined;
}

export class LeafNode<T> extends Node<T> {
    public constructor(
        n: number,
        parent?: InternalNode<T>,
        keys: Key[] = [],
        private data: T[] = [],
        public next: LeafNode<T> | null = null,
        public prev: LeafNode<T> | null = null,
    ) {
        super(n, parent, keys);
    }

    public repr(): Record<string, any> {
        const { keys, data } = this;
        return { keys: keys.map((key) => key.repr()), data };
    }

    private findInsertPos(key: Key) {
        const m = this.keys.length;
        if (m == 0) return m;

        let left = 0,
            right = m - 1;
        while (left <= right) {
            const mid = (left + right) >> 1;
            const cmp = this.keys[mid].compare(key);

            if (cmp === 0) return mid;
            cmp < 0 ? (left = mid + 1) : (right = mid - 1);
        }

        return left;
    }

    private findLowerBound(key: Key): number {
        const m = this.keys.length;
        if (m == 0) return -1;

        let left = 0,
            right = m - 1;
        while (left <= right) {
            const mid = (left + right) >> 1;
            const cmp = this.keys[mid].compare(key);
            console.log(this.keys[mid], key, cmp);

            if (cmp === 0) return mid;
            cmp < 0 ? (left = mid + 1) : (right = mid - 1);
        }

        return left;
    }

    public entry(index: number): [key: Key, data: T] {
        return [this.keys[index], this.data[index]];
    }

    public minKeys(): number {
        return Math.ceil(this.n / 2);
    }

    public add(key: Key, data: T): Node<T> {
        // const pos = this.findPos(key)
        const insPos = this.findInsertPos(key);

        this.keys.splice(insPos, 0, key);
        this.data.splice(insPos, 0, data);

        // if (pos === -1) {
        //     this.keys.splice(insPos, 0, key)
        //     this.data.splice(insPos, 0, [data])
        // } else {
        //     this.data.splice(pos, 1, [...this.data[pos], data])
        // }

        const result = this.split();
        if (result.isErr()) return this;

        return result.unwrapOk();
    }

    public remove(key: Key) {
        const pos = this.findLowerBound(key);
        if (this.keys[pos].compare(key) !== 0) return;

        this.keys.splice(pos, 1);
        this.data.splice(pos, 1);

        const min = this.minKeys();
        if (this.keys.length >= min || !this.parent) return;

        const leftRes = this.borrowLeft();
        if (leftRes.isOk()) return;

        const rightRes = this.borrowRight();
        if (rightRes.isOk()) return;

        // Fallback, if none is borrowed from either of the siblings
        const left = this.left(),
            right = this.right();

        if (left) this.mergeLeft(left);
        else if (right) this.mergeRight(right);
    }

    public split(): Result<InternalNode<T>, NodeOperationError> {
        const result = this.splitKeys();
        if (result.isErr()) return result.asErr();

        const [mid, _, right] = result.unwrapOk();
        const rightData = this.data.splice(mid);
        const rightLeaf = new LeafNode(
            this.n,
            this.parent,
            right,
            rightData,
            this.next,
            this,
        );

        if (this.next) this.next.prev = rightLeaf;
        this.next = rightLeaf;

        const internal = new InternalNode(
            this.n,
            this.parent,
            [right[0]],
            [this, rightLeaf],
        );
        if (!this.parent) this.parent = rightLeaf.parent = internal;

        return Result.Ok(internal);
    }

    public mergeLeft(left: Node<T>): Result<void, NodeOperationError> {
        if (!(left instanceof LeafNode) || !this.parent || this.left() !== left)
            return Result.Err(NodeOperationError.InvalidMerge);

        const node = left as LeafNode<T>;

        this.keys = [...node.keys, ...this.keys];
        this.data = [...node.data, ...this.data];

        this.prev = left.prev;
        if (this.prev) this.prev.next = this;

        // this.parent.keys.splice(this.currentIndex - 1, 1, this.keys[0]);
        this.parent.keys.splice(this.currentIndex - 1, 1);
        this.parent.children.splice(this.currentIndex - 1, 1);

        return Result.Ok(undefined);
    }

    public mergeRight(right: Node<T>): Result<void, NodeOperationError> {
        if (
            !(right instanceof LeafNode) ||
            !this.parent ||
            this.right() !== right
        )
            return Result.Err(NodeOperationError.InvalidMerge);

        const node = right as LeafNode<T>;

        this.keys.push(...node.keys);
        this.data.push(...node.data);

        this.next = right.next;
        if (this.next) this.next.prev = this;

        // this.parent.keys.splice(this.currentIndex, 1, this.keys[0]);
        this.parent.keys.splice(this.currentIndex, 1);
        this.parent.children.splice(this.currentIndex + 1, 1);

        return Result.Ok(undefined);
    }

    public borrowLeft(): Result<void, NodeOperationError> {
        const min = this.minKeys();
        const left = this.left() as LeafNode<T> | undefined;
        if (!this.parent || !left)
            return Result.Err(NodeOperationError.InvalidBorrow);

        if (left.keys.length <= min)
            return Result.Err(NodeOperationError.InvalidBorrow);

        const borrowedKey = left.keys.pop() as Key;
        const borrowedData = left.data.pop() as T;

        this.keys.unshift(borrowedKey);
        this.data.unshift(borrowedData);

        this.parent.keys[this.currentIndex - 1] = borrowedKey;
        return Result.Ok(undefined);
    }

    public borrowRight(): Result<void, NodeOperationError> {
        const min = this.minKeys();
        const right = this.right() as LeafNode<T> | undefined;
        if (!this.parent || !right)
            return Result.Err(NodeOperationError.InvalidBorrow);

        if (right.keys.length <= min)
            return Result.Err(NodeOperationError.InvalidBorrow);

        const borrowedKey = right.keys.shift() as Key;
        const borrowedData = right.data.shift() as T;

        this.keys.push(borrowedKey);
        this.data.push(borrowedData);

        this.parent.keys[this.currentIndex] = right.keys[0];
        return Result.Ok(undefined);
    }

    public find(
        key: Key,
        approximation: Approximation = Approximation.ExactOnly,
    ): [index: number, node: LeafNode<T>] | undefined {
        const pos = this.findLowerBound(key);
        if (pos >= this.keys.length) return undefined;

        const exact = this.keys[pos].compare(key) === 0;
        switch (approximation) {
            case Approximation.ExactOnly:
                return exact ? [pos, this] : undefined;
            case Approximation.ExactOrLess:
                return exact
                    ? [pos, this]
                    : pos > 0
                      ? [pos - 1, this]
                      : undefined;
            case Approximation.ExactOrGreater:
                return [pos, this];
            case Approximation.Less:
                return pos > 0 ? [pos, this] : undefined;
            case Approximation.Greater: {
                const idx = exact ? pos + 1 : pos;
                console.log("idx", idx);
                console.log(exact);
                console.log(key, this.keys[pos]);
                return idx < this.keys.length ? [idx, this] : undefined;
            }
        }
    }
}

export class InternalNode<T> extends Node<T> {
    public constructor(
        n: number,
        parent?: InternalNode<T>,
        public keys: Key[] = [],
        public children: Node<T>[] = [],
    ) {
        super(n, parent, keys);
    }

    public repr(): Record<string, any> {
        const { keys, children } = this;
        return {
            keys: keys.map((key) => key.repr()),
            children: children.map((child) => child.repr()),
        };
    }

    public findChildPos(key: Key) {
        const m = this.keys.length;
        if (m == 0) return 0;

        let left = 0,
            right = m;
        while (left < right) {
            const mid = (left + right) >> 1;
            const cmp = this.keys[mid].compare(key);

            if (cmp === 0) return mid + 1;
            cmp < 0 ? (left = mid + 1) : (right = mid);
        }

        return left;
    }

    public minKeys(): number {
        return Math.floor(this.n / 2);
    }

    public add(key: Key, data: T): Node<T> {
        const pos = this.findChildPos(key);
        const child = this.children[pos].add(key as Key, data);

        child.currentIndex = pos;

        if (child === this.children[pos] || !(child instanceof InternalNode))
            return this as Node<T>;

        const node = child as InternalNode<T>;

        this.keys.splice(pos, 0, ...node.keys);
        this.children.splice(pos, 1, ...node.children);

        const result = this.split();
        if (result.isErr()) return this;

        return result.unwrapOk();
    }

    public remove(key: Key) {
        const pos = this.findChildPos(key);
        const child = this.children[pos];

        if (!child) return;

        child.currentIndex = pos;
        child.remove(key);

        const min = this.minKeys();
        if (
            (this.keys.length >= min && this.children.length >= min + 1) ||
            !this.parent
        )
            return;

        const leftRes = this.borrowLeft();
        if (leftRes.isOk()) return;

        const rightRes = this.borrowRight();
        if (rightRes.isOk()) return;

        // Fallback, if none is borrowed from either of the siblings
        const left = this.left(),
            right = this.right();
        if (left) this.mergeLeft(left);
        else if (right) this.mergeRight(right);
    }

    public split(): Result<InternalNode<T>, NodeOperationError> {
        const result = this.splitKeys(0);
        if (result.isErr()) return result.asErr();

        const [mid, _, right] = result.unwrapOk();
        const rightChildren = this.children.splice(mid + 1);

        const rightInternal = new InternalNode(
            this.n,
            this.parent,
            right.slice(1),
            rightChildren,
        );
        const parent = new InternalNode(
            this.n,
            this.parent,
            [right[0]],
            [this, rightInternal],
        );
        if (!this.parent) {
            this.parent = rightInternal.parent = parent;
            for (const child of rightInternal.children)
                child.parent = rightInternal;
        }

        return Result.Ok(parent);
    }

    public mergeLeft(left: Node<T>): Result<void, NodeOperationError> {
        if (
            !(left instanceof InternalNode) ||
            !this.parent ||
            this.left() !== left
        )
            return Result.Err(NodeOperationError.InvalidMerge);

        const node = left as InternalNode<T>;

        this.keys = [
            ...node.keys,
            this.parent.keys.splice(this.currentIndex - 1, 1)[0],
            ...this.keys,
        ];
        this.children = [
            ...node.children.map((child) => ((child.parent = this), child)),
            ...this.children,
        ];

        // this.parent.keys.splice(this.currentIndex - 1, 1, this.keys[0]);
        // this.parent.keys.splice(this.currentIndex - 1, 1);
        this.parent.children.splice(this.currentIndex - 1, 1);

        return Result.Ok(undefined);
    }

    public mergeRight(right: Node<T>): Result<void, NodeOperationError> {
        if (
            !(right instanceof InternalNode) ||
            !this.parent ||
            this.right() !== right
        )
            return Result.Err(NodeOperationError.InvalidMerge);

        const node = right as InternalNode<T>;

        this.keys.push(
            this.parent.keys.splice(this.currentIndex, 1)[0],
            ...node.keys,
        );
        this.children.push(
            ...node.children.map((child) => ((child.parent = this), child)),
        );

        // this.parent.keys.splice(this.currentIndex, 1, this.keys[0]);
        // this.parent.keys.splice(this.currentIndex, 1);
        this.parent.children.splice(this.currentIndex + 1, 1);

        return Result.Ok(undefined);
    }

    public borrowLeft(): Result<void, NodeOperationError> {
        const min = this.minKeys();
        const left = this.left() as InternalNode<T> | undefined;
        if (!this.parent || !left)
            return Result.Err(NodeOperationError.InvalidBorrow);

        if (left.keys.length <= min)
            return Result.Err(NodeOperationError.InvalidBorrow);

        const separator = this.parent.keys[this.currentIndex - 1];
        const borrowedChild = left.children.pop() as Node<T>;

        this.keys.unshift(separator);
        this.children.unshift(borrowedChild);

        borrowedChild.parent = this;
        this.parent.keys[this.currentIndex - 1] = left.keys.pop() as Key;

        return Result.Ok(undefined);
    }

    public borrowRight(): Result<void, NodeOperationError> {
        const min = this.minKeys();
        const right = this.right() as InternalNode<T> | undefined;
        if (!this.parent || !right)
            return Result.Err(NodeOperationError.InvalidBorrow);

        if (right.keys.length <= min)
            return Result.Err(NodeOperationError.InvalidBorrow);

        const separator = this.parent.keys[this.currentIndex];
        const borrowedChild = right.children.shift() as Node<T>;

        this.keys.push(separator);
        this.children.push(borrowedChild);

        borrowedChild.parent = this;
        this.parent.keys[this.currentIndex] = right.keys.shift() as Key;

        return Result.Ok(undefined);
    }

    public find(
        key: Key,
        approximation: Approximation = Approximation.ExactOnly,
    ): [index: number, node: LeafNode<T>] | undefined {
        return this.children[this.findChildPos(key)]?.find(key, approximation);
    }
}
