import { Type, type Static } from "@sinclair/typebox";

export const SCHEMA = Type.Object({
    type: Type.Literal("raw"),
    data: Type.String()
});

export type T = Static<typeof SCHEMA>;

export function build(config: T): string {
    return config.data;
}

