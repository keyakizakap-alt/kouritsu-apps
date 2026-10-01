import { SymbolView, type SymbolWeight } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

export type IconName = SFSymbol;

/** SF Symbols。文字と同じ太さ・大きさの体系で揃う（HIG: Typography / SF Symbols） */
export function Icon({
  name,
  size = 22,
  color,
  weight = 'regular',
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: SymbolWeight;
}) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} style={{ width: size, height: size }} />;
}
