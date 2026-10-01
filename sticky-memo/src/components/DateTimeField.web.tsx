import { Text, View } from 'react-native';

import { formatDateTime, type } from './theme';

// Web プレビュー専用：iOS ではここに標準のカレンダー＋時刻ピッカーが表示される
export function DateTimeField({ value }: { value: Date; minimum: Date; onChange: (d: Date) => void; scheme: 'light' | 'dark' }) {
  return (
    <View style={{ height: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(118,118,128,0.12)' }}>
      <Text style={[type.headline, { color: '#5C5C63' }]}>{formatDateTime(value.getTime())}</Text>
      <Text style={[type.footnote, { color: '#5C5C63' }]}>（iPhone では標準のカレンダーが表示されます）</Text>
    </View>
  );
}
