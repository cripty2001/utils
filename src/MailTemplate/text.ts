import { Type, type Static } from "@cripty2001/utils/appserver/server";

export const SCHEMA = Type.Object({
    type: Type.Literal("text"),
    size: Type.Number(),
    weight: Type.Number(),
    color: Type.String(),
    padding: Type.Object({
        top: Type.Number()
    }),
    content: Type.Array(Type.String())
});

export type T = Static<typeof SCHEMA>;

export function build(config: T): string {
    return `
    <mj-section padding="0">
      <mj-column width="100%" padding-top="${config.padding.top}px">
        ${config.content.map(item => `
          <mj-text font-size="${config.size}px" font-weight="${config.weight}" color="${config.color}">
            ${item}
          </mj-text>
        `).join('')}
      </mj-column>
    </mj-section>
  `;
}

