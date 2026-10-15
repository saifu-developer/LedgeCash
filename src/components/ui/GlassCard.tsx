import React from 'react';

import { AppCard, AppCardProps } from './AppCard';

export type GlassCardProps = AppCardProps;

/**
 * Standardized card component. Delegates to pure React Native AppCard
 * to ensure visual consistency and prevent blur artifacts on Android.
 */
export function GlassCard(props: GlassCardProps) {
  return <AppCard {...props} />;
}
