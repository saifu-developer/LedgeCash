import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '@/constants/theme';

type PinDotsProps = {
  length?: number;
  valueLength: number;
  hasError?: boolean;
};

export function PinDots({ length = 4, valueLength, hasError = false }: PinDotsProps) {
  return (
    <View
      style={styles.dotsContainer}
      accessibilityLabel={`PIN entered: ${valueLength} of ${length} digits`}>
      {Array.from({ length }, (_, index) => {
        const isFilled = index < valueLength;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              isFilled && styles.dotFilled,
              hasError && styles.dotError,
            ]}
          />
        );
      })}
    </View>
  );
}

type NumericKeypadProps = {
  onDigitPress: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
};

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
] as const;

export function NumericKeypad({
  onDigitPress,
  onBackspace,
  disabled = false,
}: NumericKeypadProps) {
  return (
    <View style={styles.keypad}>
      {KEYPAD_ROWS.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((item, colIndex) => {
            if (item === '') {
              return <View key={colIndex} style={styles.keySlot} />;
            }

            if (item === '⌫') {
              return (
                <Pressable
                  key={colIndex}
                  accessibilityRole="button"
                  accessibilityLabel="Delete last digit"
                  disabled={disabled}
                  onPress={onBackspace}
                  style={({ pressed }) => [
                    styles.keySlot,
                    styles.keyButton,
                    styles.actionKey,
                    pressed && styles.keyPressed,
                  ]}>
                  <Text style={styles.backspaceLabel}>⌫</Text>
                </Pressable>
              );
            }

            return (
              <Pressable
                key={colIndex}
                accessibilityRole="button"
                accessibilityLabel={`Digit ${item}`}
                disabled={disabled}
                onPress={() => onDigitPress(item)}
                style={({ pressed }) => [
                  styles.keySlot,
                  styles.keyButton,
                  pressed && styles.keyPressed,
                ]}>
                <Text style={styles.digitLabel}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginVertical: 20,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
  },
  dotFilled: {
    backgroundColor: BrandColors.green,
    borderColor: BrandColors.green,
    transform: [{ scale: 1.15 }],
  },
  dotError: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  keypad: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  keySlot: {
    width: 76,
    height: 76,
  },
  keyButton: {
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  actionKey: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  digitLabel: {
    fontSize: 26,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  backspaceLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: '#6B7280',
  },
  keyPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
    backgroundColor: '#F3F4F6',
  },
});
