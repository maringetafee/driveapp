import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { colors, radius } from '../../theme/colors';

interface Props {
  /** Valores entre 0 y 1. */
  start: number;
  end: number;
  /** Separación mínima entre los dos extremos (0-1). */
  minGap?: number;
  onChange: (start: number, end: number) => void;
}

const THUMB = 28;

/** Selector de rango con dos tiradores, sin dependencias nativas. */
export default function RangeSlider({ start, end, minGap = 0.02, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const state = useRef({ start, end, width, dragStart: 0, onChange, minGap });
  state.current = { ...state.current, start, end, width, onChange, minGap };

  const makeResponder = (thumb: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        state.current.dragStart = state.current[thumb];
      },
      onPanResponderMove: (_, gesture) => {
        const s = state.current;
        if (!s.width) return;
        const value = Math.max(0, Math.min(1, s.dragStart + gesture.dx / s.width));
        if (thumb === 'start') s.onChange(Math.min(value, s.end - s.minGap), s.end);
        else s.onChange(s.start, Math.max(value, s.start + s.minGap));
      },
    });

  const startResponder = useRef(makeResponder('start')).current;
  const endResponder = useRef(makeResponder('end')).current;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - THUMB);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.track} />
      {width > 0 && (
        <>
          <View style={[styles.fill, { left: THUMB / 2 + start * width, width: (end - start) * width }]} />
          <View {...startResponder.panHandlers} hitSlop={12} style={[styles.thumb, { left: start * width }]} />
          <View {...endResponder.panHandlers} hitSlop={12} style={[styles.thumb, { left: end * width }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: THUMB + 8, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  fill: { position: 'absolute', height: 6, borderRadius: radius.pill, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    borderWidth: 4,
    borderColor: colors.accent,
  },
});
