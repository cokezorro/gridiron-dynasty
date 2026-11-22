import React from 'react';
import { Pressable, PressableProps, PressableStateCallbackType, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, LEDGE, SINK, shade } from './theme';

/**
 * Tactile 3D button. Every button in the app is a `Btn`.
 *
 * Rest:    a raised slab with a thick, darker ledge under it.
 * Pressed: the face drops down onto the ledge (ledge shrinks, face translates
 *          down by the same amount) so the button physically sinks in.
 *
 * Authors write a normal Pressable style (background colour, padding, …).
 * Btn strips thin outlines + rounded corners and adds the ledge automatically.
 */
export const Btn: React.FC<PressableProps & { plain?: boolean }> = ({ style, plain, children, ...rest }) => {
  if (plain) {
    return (
      <Pressable style={style} {...rest}>
        {children}
      </Pressable>
    );
  }
  return (
    <Pressable
      {...rest}
      style={(state: PressableStateCallbackType) => {
        const resolved = typeof style === 'function' ? style(state) : style;
        const flat = (StyleSheet.flatten(resolved) || {}) as ViewStyle;
        const face = (typeof flat.backgroundColor === 'string' ? flat.backgroundColor : COLORS.cardHi) as string;
        const slabColor =
          flat.borderWidth && flat.borderColor && flat.borderColor !== COLORS.border ? (flat.borderColor as string) : null;
        const pressed = state.pressed;
        const out: ViewStyle = {
          ...flat,
          backgroundColor: pressed ? shade(face, 0.12) : face,
          borderRadius: 0,
          borderWidth: 0,
          borderTopWidth: 0,
          borderRightWidth: 0,
          borderLeftWidth: slabColor ? 6 : 0,
          borderLeftColor: slabColor ?? undefined,
          borderColor: undefined,
          borderBottomWidth: pressed ? LEDGE - SINK : LEDGE,
          borderBottomColor: shade(face, 0.55),
          transform: [{ translateY: pressed ? SINK : 0 }],
          marginBottom: ((flat.marginBottom as number) || 0) + (pressed ? SINK : 0),
        };
        return out;
      }}
    >
      {children}
    </Pressable>
  );
};
