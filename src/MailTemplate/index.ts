
import Handlebars from "handlebars";

import { Type, type Static } from "@cripty2001/utils/appserver/server";

import { SCHEMA as IMAGE_SCHEMA, build as buildImage } from "./image.js";
import { SCHEMA as RAW_SCHEMA, build as buildRaw } from "./raw.js";
import { SCHEMA as TEXT_SCHEMA, build as buildText } from "./text.js";

export const TEMPLATE_SCHEMA = Type.Object({
    style: Type.Object({
        font: Type.String(),
        backgroundColor: Type.String(),
        textColor: Type.String()
    }),
    content: Type.Array(
        Type.Union([
            IMAGE_SCHEMA,
            TEXT_SCHEMA,
            RAW_SCHEMA
        ])
    )
});

export type Template = Static<typeof TEMPLATE_SCHEMA>;
export function genBuilder<T extends any>(config: Template): HandlebarsTemplateDelegate<T> {
    const mappedContent = config.content
        .map(item => {
            switch (item.type) {
                case "image":
                    return buildImage(item);
                case "raw":
                    return buildRaw(item);
                case "text":
                    return buildText(item);
                default:
                    // @ts-expect-error Should never happen
                    throw new Error(`Invalid type ${item.type}`);
            }
        })
        .join('\n');

    return Handlebars.compile(`
        <mjml>
            <mj-head>
            <mj-style>
                .onlyMobile { 
                display: none !important; 
                } 
                .onlyDesktop { 
                display: block !important; 
                } 
                @media only screen and (max-width: 500px) { 
                .onlyMobile { 
                    display: block !important; 
                } 
                .onlyDesktop { 
                    display: none !important; 
                } 
                }
            </mj-style>

            <mj-attributes>
                <mj-all
                font-family="${config.style.font}, Arial, Helvetica, sans-serif"
                />
                <mj-text
                font-size="18px"
                line-height="1.5"
                color="${config.style.textColor}"
                />
                <mj-body width="700px" />
                <mj-section width="700px" padding="0" />
            </mj-attributes>
            </mj-head>

            <mj-body background-color="${config.style.backgroundColor}">
            ${mappedContent}
            </mj-body>
        </mjml>
    `);
}