import { Whispr, WhisprSetter } from '@cripty2001/whispr';

import { Dispatcher } from './Dispatcher';
import { JSONEncodable } from './index';

export type AppstorageData = Record<string, JSONEncodable>;

export type AppstorageItemData<T extends AppstorageData> = {
    key: string;
    data: T;
    rev: number;
    deleted: boolean;
};

export interface IAppstorageItem<T extends AppstorageData> {
    readonly PREFIX: string;
    readonly key: string;
    readonly data: Whispr<AppstorageItemData<T>>;
    readonly update: (data: T) => void;
    readonly remove: () => void;
    readonly flush: () => void;
}

export class Appstorage {
    private static readonly instances: Map<string, Appstorage> = new Map();
    public static getInstance(key: string): Appstorage {
        if (!this.instances.has(key))
            this.instances.set(key, new Appstorage(key));
        return this.instances.get(key)!;
    }

    public readonly PREFIX: string;
    public index: Whispr<Record<string, IAppstorageItem<any>>>;
    private _setIndex: WhisprSetter<Record<string, IAppstorageItem<any>>>;

    private readonly refreshInterval = setInterval(() => {
        this.refresh();
    }, 200);

    private constructor(PREFIX: string) {
        this.PREFIX = PREFIX;
        [this.index, this._setIndex] = Whispr.create<Record<string, IAppstorageItem<any>>>({});
        this.refresh();
    }

    public add<T extends AppstorageData>(key: string, data: T): IAppstorageItem<T> {
        const k = `${this.PREFIX}${key}`;

        if (localStorage.getItem(k) !== null)
            throw new Error(`${key} already exists in storage`);

        localStorage.setItem(k, JSON.stringify({
            key: k,
            data: data,
            rev: 0,
            deleted: false
        }));
        this.refresh();

        return this.get(key);
    }

    public get<T extends AppstorageData>(key: string): IAppstorageItem<T> {
        this.refresh();
        const toReturn = this.index.value[key];
        if (toReturn === undefined)
            throw new Error(`${key} does not exist in storage`);
        return toReturn;
    }

    private listData(): string[] {
        const toReturn: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === null || !key.startsWith(this.PREFIX))
                continue;
            toReturn.push(key.replace(this.PREFIX, ""));
        }
        return toReturn;
    }

    private refresh() {
        const newitems = this.listData()
            .filter(key => this.index.value[key] === undefined)
            .map(key => ({
                key: key,
                ref: AppstorageItem.get(this.PREFIX, key)
            }))
            .filter(item => !item.ref.data.value.deleted)
            .reduce((acc, item) => {
                acc[item.key] = item.ref;
                return acc;
            }, {} as Record<string, IAppstorageItem<any>>)

        if (Object.keys(newitems).length > 0) {
            this._setIndex({
                ...this.index.value,
                ...newitems
            });
        }
    }

    public flush() {
        Object.values(this.index.value).forEach(item => {
            item.flush();
        });
    }
}

class AppstorageItem<T extends AppstorageData> implements IAppstorageItem<T> {
    public readonly PREFIX: string;
    private static readonly instances = new Map<string, AppstorageItem<any>>();
    private static readonly refreshInterval = setInterval(() => {
        this.instances.forEach(item => item.refresh());
    }, 200);

    public readonly key: string;
    public readonly data: Whispr<AppstorageItemData<T>>;
    public readonly update: (data: T) => void;
    public readonly remove: () => void;

    private _setData: WhisprSetter<AppstorageItemData<T>>;

    /**
     * Please note: Directly using this method is UNSAFE.
     * If you need to get an item, use the Appstorage.get() method instead.
     */
    public static get(PREFIX: string, key: string): AppstorageItem<any> {
        const k = `${PREFIX}${key}`;
        if (!this.instances.has(k))
            this.instances.set(k, new AppstorageItem(PREFIX, key));
        return this.instances.get(k)!;
    }

    private constructor(PREFIX: string, key: string) {
        this.PREFIX = PREFIX;
        this.key = key;

        [this.data, this._setData] = Whispr.create<AppstorageItemData<T>>(
            this.loadData()
        );

        this.update = (data: T) => {
            this._setData({
                key: `${this.PREFIX}${this.key}`,
                rev: this.data.value.rev + 1,
                deleted: false,
                data: data
            });
        }

        this.remove = () => {
            this._setData({
                key: `${this.PREFIX}${this.key}`,
                rev: this.data.value.rev + 1,
                deleted: true,
                data: {} as T
            });
        }

        new Dispatcher<AppstorageItemData<T>, void>(this.data, async () => {
            this.flush();
        }, 500);
    }

    public flush() {
        const curr = this.loadData();
        if (this.data.value.rev > curr.rev) {
            localStorage.setItem(
                `${this.PREFIX}${this.key}`,
                JSON.stringify(this.data.value)
            );
        }
    }

    private refresh() {
        const data = this.loadData();
        if (data.rev > this.data.value.rev) {
            this._setData(data);
        }
    }
    private loadData(): AppstorageItemData<T> {
        const raw_data = localStorage.getItem(`${this.PREFIX}${this.key}`);
        if (raw_data === null)
            throw new Error(`${this.key} does not exist in storage`);

        return JSON.parse(raw_data) as AppstorageItemData<T>;
    }
}
