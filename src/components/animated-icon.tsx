import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BrandColors } from '@/constants/theme';

const DURATION = 600;
const { width } = Dimensions.get('window');

// 25% of the screen width for the logo
const LOGO_SIZE = width * 0.25;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const content = (
    <View style={styles.contentContainer}>
      <View style={styles.glassPanel}>
        <Image 
          style={styles.logo} 
          source={require('@/assets/images/logo-icon.png')} 
          contentFit="contain" 
        />
        <View style={styles.textContainer}>
          <Text style={styles.title}>LedgeCash</Text>
          <Text style={styles.subtitle}>Simple money management</Text>
        </View>
      </View>
    </View>
  );

  return animate ? (
    <Animated.View
      entering={FadeIn.duration(DURATION)}
      exiting={FadeOut.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      <BackgroundEffects />
      {content}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
          // Auto-hide the splash after a delay since this is a mock loading screen
          setTimeout(() => setVisible(false), 2000);
        });
      }}
      style={styles.splashOverlay}>
      <BackgroundEffects />
      {content}
    </View>
  );
}

function BackgroundEffects() {
  return (
    <>
      <View style={styles.glowTopRight} />
      <View style={styles.glowBottomLeft} />
    </>
  );
}

export function AnimatedIcon() {
  // We don't use this anymore as per the instructions, but we keep it here
  // in case other parts of the app import it, returning null or the new splash.
  return null;
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BrandColors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    overflow: 'hidden',
  },
  glowTopRight: {
    position: 'absolute',
    top: -200,
    right: -150,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: BrandColors.green,
    opacity: 0.15,
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -250,
    left: -200,
    width: 600,
    height: 600,
    borderRadius: 300,
    backgroundColor: BrandColors.green,
    opacity: 0.1,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  glassPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    marginBottom: 24,
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
});
