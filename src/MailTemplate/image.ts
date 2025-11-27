import { Type, type Static } from "@cripty2001/utils/appserver/server";

export const SCHEMA = Type.Object({
    type: Type.Literal("image"),
    mobile: Type.String(),
    desktop: Type.Union([Type.String(), Type.Null()]),
    link: Type.Union([Type.String(), Type.Null()]),
    alt: Type.String()
});
export type T = Static<typeof SCHEMA>;
export function build(config: T): string {
    const img = (breakpoint: "onlyMobile" | "onlyDesktop" | null, url: string) => `
    <mj-image
      css-class="${breakpoint ?? ''}"
      src="${url}"
      alt="${config.alt}"
      ${config.link ? `href="${config.link}"` : ''}
      padding="0"
    />
  `;

    const imgs = config.desktop === null ?
        img(null, config.mobile) :
        [
            img("onlyDesktop", config.desktop),
            img("onlyMobile", config.mobile)
        ].join('\n')

    const toReturn = `
    <mj-section padding="0">
      <mj-column width="100%" padding="0">
        ${imgs}
      </mj-column>
    </mj-section>
  `;

    return toReturn;
}
