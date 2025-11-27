import { Type, type Static } from "@cripty2001/utils/appserver/server";

export const SCHEMA = Type.Object({
    type: Type.Literal("raw"),
    data: Type.String()
});

export type T = Static<typeof SCHEMA>;

export function build(config: T): string {
    return config.data;
}

