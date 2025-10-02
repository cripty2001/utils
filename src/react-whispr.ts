import { Whispr, type WhisprSetter } from "@cripty2001/whispr";
import { useEffect, useRef, useState } from "react";

import { isEqual } from "lodash";

/**
 * Convert a Whispr value into a reactive react value, usable in function components with the standard react reactive system.
 * If the value is not a Whispr, it is returned as is, thus allowing for progressive migration and adoption
 * @param w A reactive react value or a Whispr containing it
 * @param computer An optional function to compute the returned value. This is useful to extract a part of a larger whispr, or to compute a derived value. It is the analog of useMemo with a single dependency (the whispr itself)
 * @returns A reactive react value
 * 
 * @remarks The value is NOT REACTIVE, and the same applies to the computer, if any. Only changes to its content will trigger a change, not changes to the object itself.
 * 
 * @example
 * export default function MyComponent(props: { value:  Whispr<string> }) {
 *   const value = useWhisprValue(props.value);
 * 
 *   return <div>{value}</div>;
 * }
 */
export function useWhisprValue<I, O = I>(
    w: Whispr<I>,
    computer: (data: I) => O = (d) => d as unknown as O
): O {
    const value_w = useRef(
        Whispr.from(
            { w },
            ({ w }) => computer(w)
        )
    ).current;

    const [value, setValue] = useState(value_w.value);

    value_w.subscribe((newValue) => {
        if (isEqual(newValue, value))
            return;

        setValue(newValue);
    }, false);  // Already got the initial value, and this will call syncronously generate a react warning as called on an not yet mounted component

    return value;
}

/**
 * Wrap a (react) value into a Whispr, if it is not one already.
 * @param data A Whispr or a normal (react reactable) value
 * @returns The whispr'd value, or the original whispr if it was one (allow for incremental adoption)
 * 
 * @remarks The returned whispr has already been ref-fed, so it can be directly used without worrying about react recreating it or similar bad things
 */
export function useWhispr<T>(data: T | Whispr<T>): Whispr<T> {
    const [w, setW] = useRef(Whispr.create(
        data instanceof Whispr ?
            data.value :
            data
    )).current;

    useEffect(() => {
        setW(data instanceof Whispr ? data.value : data);
    }, [data, setW]);

    // Hooks can't be called conditionally, so we need to do this check at the end
    if (data instanceof Whispr)
        return data;

    return w;
}

