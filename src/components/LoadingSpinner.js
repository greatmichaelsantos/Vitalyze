import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Typography } from '../utils/constants';

export default function LoadingSpinner({ fullScreen = false, message = 'Loading...' }) {
  const { colors } = useTheme();

  if (fullScreen) {
    return (
      <View
        style={[styles.fullScreen, { backgroundColor: colors.background }]}
        accessible={true}
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={[styles.message, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.5}
          importantForAccessibility="no"
          accessibilityElementsHidden={true}
        >
          {message}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.inline}
      accessible={true}
      accessibilityLiveRegion="polite"
      accessibilityLabel={message}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      {message ? (
        <Text
          style={[styles.inlineMessage, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.5}
          importantForAccessibility="no"
          accessibilityElementsHidden={true}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  message: {
    ...Typography.body,
    marginTop: 8,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  inlineMessage: {
    ...Typography.bodySmall,
  },
});
