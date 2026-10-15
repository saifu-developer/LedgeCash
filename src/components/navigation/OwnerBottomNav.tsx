import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandColors } from '@/constants/theme';

export type OwnerNavTab = 'workers' | 'reports' | 'home' | 'audit' | 'settings';

interface OwnerBottomNavProps {
  activeTab?: OwnerNavTab;
}

export function OwnerBottomNav({ activeTab = 'home' }: OwnerBottomNavProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const bottomPadding = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : Math.max(insets.bottom, 10);

  function handleNavigate(tab: OwnerNavTab) {
    if (tab === 'home') {
      router.push('/owner');
      return;
    }
    if (tab === 'workers') {
      router.push({
        pathname: '/owner/[action]',
        params: { action: 'workers' },
      });
      return;
    }
    if (tab === 'reports') {
      router.push({
        pathname: '/owner/[action]',
        params: { action: 'reports' },
      });
      return;
    }
    if (tab === 'audit') {
      router.push({
        pathname: '/owner/[action]',
        params: { action: 'correction-history' },
      });
      return;
    }
    if (tab === 'settings') {
      router.push({
        pathname: '/owner/[action]',
        params: { action: 'settings' },
      });
      return;
    }
  }

  return (
    <View style={[styles.navWrapper, { paddingBottom: bottomPadding }]}>
      <View style={styles.navBar}>
        {/* 1. Workers */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Workers & Staff"
          onPress={() => handleNavigate('workers')}
          style={({ pressed }) => [
            styles.tabItem,
            pressed && styles.tabPressed,
          ]}>
          <Ionicons
            name={activeTab === 'workers' ? 'people' : 'people-outline'}
            size={22}
            color={activeTab === 'workers' ? BrandColors.green : '#64748B'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'workers' && styles.tabLabelActive,
            ]}>
            Workers
          </Text>
        </Pressable>

        {/* 2. Reports */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reports & Analytics"
          onPress={() => handleNavigate('reports')}
          style={({ pressed }) => [
            styles.tabItem,
            pressed && styles.tabPressed,
          ]}>
          <Ionicons
            name={activeTab === 'reports' ? 'bar-chart' : 'bar-chart-outline'}
            size={22}
            color={activeTab === 'reports' ? BrandColors.green : '#64748B'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'reports' && styles.tabLabelActive,
            ]}>
            Reports
          </Text>
        </Pressable>

        {/* 3. Home (Center Elevated) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Home Dashboard"
          onPress={() => handleNavigate('home')}
          style={({ pressed }) => [
            styles.centerTabItem,
            pressed && styles.centerTabPressed,
          ]}>
          <View style={styles.centerButton}>
            <Ionicons name="home" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.centerTabLabel}>Home</Text>
        </Pressable>

        {/* 4. Audit */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Audit & Corrections"
          onPress={() => handleNavigate('audit')}
          style={({ pressed }) => [
            styles.tabItem,
            pressed && styles.tabPressed,
          ]}>
          <Ionicons
            name={activeTab === 'audit' ? 'time' : 'time-outline'}
            size={22}
            color={activeTab === 'audit' ? BrandColors.green : '#64748B'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'audit' && styles.tabLabelActive,
            ]}>
            Audit
          </Text>
        </Pressable>

        {/* 5. Settings */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings & Profile"
          onPress={() => handleNavigate('settings')}
          style={({ pressed }) => [
            styles.tabItem,
            pressed && styles.tabPressed,
          ]}>
          <Ionicons
            name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
            size={22}
            color={activeTab === 'settings' ? BrandColors.green : '#64748B'}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === 'settings' && styles.tabLabelActive,
            ]}>
            Settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 58,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 3,
  },
  tabLabelActive: {
    color: BrandColors.green,
    fontWeight: '700',
  },
  centerTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
  },
  centerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#062B55',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#062B55',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  centerTabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#062B55',
    marginTop: 2,
  },
  tabPressed: {
    opacity: 0.7,
  },
  centerTabPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
});
