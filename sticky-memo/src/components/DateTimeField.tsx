import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle } from '@expo/ui/swift-ui/modifiers';

/** iOS 標準のカレンダー＋時刻ピッカー（SwiftUI DatePicker の graphical スタイル） */
export function DateTimeField({
  value,
  minimum,
  onChange,
  scheme,
}: {
  value: Date;
  minimum: Date;
  onChange: (d: Date) => void;
  scheme: 'light' | 'dark';
}) {
  return (
    <Host style={{ height: 400 }} colorScheme={scheme}>
      <DatePicker
        selection={value}
        range={{ start: minimum }}
        displayedComponents={['date', 'hourAndMinute']}
        onDateChange={onChange}
        modifiers={[datePickerStyle('graphical')]}
      />
    </Host>
  );
}
