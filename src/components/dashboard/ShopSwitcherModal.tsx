import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppCard } from '@/components/ui/AppCard';
import { BrandColors } from '@/constants/theme';
import {
  getActiveShopId,
  setActiveShopId,
  useCurrentProfile,
} from '@/session/current-profile';
import { getShopsByOwner, useShopStore } from '@/store/shops';
import type { Shop } from '@/types/shop';

interface ShopSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ShopSwitcherModal({ visible, onClose }: ShopSwitcherModalProps) {
  const router = useRouter();
  const profile = useCurrentProfile();
  useShopStore(); // Subscribe to reactive shop updates
  const activeShopId = getActiveShopId();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!profile) return null;
  const shops = getShopsByOwner(profile.id);

  async function handleCopy(code: string) {
    await Clipboard.setStringAsync(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleSelectShop(shop: Shop) {
    setActiveShopId(shop.id);
    onClose();
  }

  function handleGoToSettings() {
    onClose();
    router.push({
      pathname: '/owner/[action]',
      params: { action: 'settings' },
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={styles.sheetContainer}>
          <AppCard style={styles.sheetCard}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerTitleGroup}>
                <View style={styles.storeIconBox}>
                  <Ionicons name="storefront" size={20} color={BrandColors.navy} />
                </View>
                <View>
                  <Text style={styles.title}>Your Stores & Outlets</Text>
                  <Text style={styles.subtitle}>
                    Select an active branch to manage
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close shop switcher"
                onPress={onClose}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </Pressable>
            </View>

            {/* Shop List */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}>
              {shops.map((shop) => {
                const isActive = shop.id === activeShopId;
                return (
                  <Pressable
                    key={shop.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select store ${shop.name}`}
                    onPress={() => handleSelectShop(shop)}
                    style={({ pressed }) => [
                      styles.shopCard,
                      isActive && styles.activeShopCard,
                      pressed && styles.pressed,
                    ]}>
                    <View style={styles.shopCardLeft}>
                      <View
                        style={[
                          styles.shopAvatar,
                          isActive && styles.activeShopAvatar,
                        ]}>
                        <Ionicons
                          name={isActive ? 'checkmark-circle' : 'business-outline'}
                          size={18}
                          color={isActive ? '#FFFFFF' : BrandColors.navy}
                        />
                      </View>
                      <View style={styles.shopInfo}>
                        <View style={styles.shopNameRow}>
                          <Text
                            style={[
                              styles.shopName,
                              isActive && styles.activeShopName,
                            ]}>
                            {shop.name}
                          </Text>
                          {isActive && (
                            <View style={styles.activePill}>
                              <Text style={styles.activePillText}>ACTIVE</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.shopCodeLabel}>Code: {shop.id}</Text>
                      </View>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Copy shop code ${shop.id}`}
                      onPress={(e) => {
                        e.stopPropagation();
                        void handleCopy(shop.id);
                      }}
                      style={({ pressed }) => [
                        styles.copyBadge,
                        copiedId === shop.id && styles.copyBadgeSuccess,
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons
                        name={copiedId === shop.id ? 'checkmark' : 'copy-outline'}
                        size={13}
                        color={copiedId === shop.id ? '#15803D' : BrandColors.navy}
                      />
                      <Text
                        style={[
                          styles.copyBadgeText,
                          copiedId === shop.id && styles.copyBadgeTextSuccess,
                        ]}>
                        {copiedId === shop.id ? 'Copied' : 'Copy'}
                      </Text>
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Bottom Actions */}
            <View style={styles.footerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage or add shops in settings"
                onPress={handleGoToSettings}
                style={({ pressed }) => [
                  styles.settingsLinkBtn,
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="settings-outline" size={16} color={BrandColors.navy} />
                <Text style={styles.settingsLinkText}>
                  Manage / Add Shops in Settings
                </Text>
              </Pressable>
            </View>
          </AppCard>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 38, 80, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    zIndex: 10,
  },
  sheetCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(6, 38, 80, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    maxHeight: 280,
  },
  listContent: {
    gap: 10,
    paddingVertical: 4,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  activeShopCard: {
    borderColor: BrandColors.green,
    backgroundColor: 'rgba(10, 157, 88, 0.05)',
  },
  shopCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  shopAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeShopAvatar: {
    backgroundColor: BrandColors.green,
  },
  shopInfo: {
    flex: 1,
  },
  shopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shopName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  activeShopName: {
    color: BrandColors.navy,
    fontWeight: '700',
  },
  activePill: {
    backgroundColor: BrandColors.green,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  shopCodeLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  copyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  copyBadgeSuccess: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  copyBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  copyBadgeTextSuccess: {
    color: '#15803D',
  },
  footerRow: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  settingsLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  settingsLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.985 }],
  },
});
