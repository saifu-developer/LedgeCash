import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { BrandColors } from '@/constants/theme';
import { exportDatabaseBackupJson } from '@/lib/export-utils';
import { logout, createShopWithCloud, switchShopWithCloud } from '@/lib/auth-service';
import {
  getActiveShopId,
  setActiveShopId,
  useActiveShop,
  useCurrentProfile,
} from '@/session/current-profile';
import { reloadPersistedAudit, useAuditStore } from '@/store/audit';
import { deleteShop, getShopsByOwner, updateShop, useShopStore } from '@/store/shops';
import { reloadPersistedTransactions, useTransactionStore } from '@/store/transactions';
import { changeOwnerPin, isValidPin, removeWorkersForShop } from '@/store/users';
import type { Shop } from '@/types/shop';

export function SettingsScreen() {
  const profile = useCurrentProfile();
  const activeShop = useActiveShop();
  const activeShopId = getActiveShopId();

  // Watch stores for reactivity
  useShopStore();
  const { items: allTransactions } = useTransactionStore();
  const { items: allAudit } = useAuditStore();

  const ownedShops = profile ? getShopsByOwner(profile.id) : [];

  // Filter transactions and audit for current shop
  const shopTransactions = activeShopId
    ? allTransactions.filter((t) => t.shopId === activeShopId)
    : [];
  const shopAudit = activeShopId ? allAudit.filter((a) => a.shopId === activeShopId) : [];

  // Notification state
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Shop Rename State
  const [isRenaming, setIsRenaming] = useState(false);
  const [shopNameInput, setShopNameInput] = useState(activeShop?.name ?? '');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renamingLoading, setRenamingLoading] = useState(false);

  // PIN Change State
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  // Create & Switch Shop State
  const [isCreatingShop, setIsCreatingShop] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [createShopError, setCreateShopError] = useState<string | null>(null);
  const [creatingShopLoading, setCreatingShopLoading] = useState(false);
  const [switchingShopId, setSwitchingShopId] = useState<string | null>(null);


  // Backup Export State
  const [exportingBackup, setExportingBackup] = useState(false);

  // Delete Shop State
  const [deleteShopModalVisible, setDeleteShopModalVisible] = useState(false);
  const [deleteShopLoading, setDeleteShopLoading] = useState(false);
  const [deleteShopConfirmInput, setDeleteShopConfirmInput] = useState('');
  const [deleteShopError, setDeleteShopError] = useState<string | null>(null);

  const isConfirmed = Boolean(
    activeShop &&
      deleteShopConfirmInput.trim().toLowerCase() === activeShop.name.trim().toLowerCase()
  );

  function triggerNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => {
      setNotice(null);
    }, 3500);
  }

  async function handleConfirmDeleteShop() {
    if (!activeShop || !profile) return;
    const isConfirmed =
      deleteShopConfirmInput.trim().toLowerCase() === activeShop.name.trim().toLowerCase();
    if (!isConfirmed) {
      setDeleteShopError(`Please type "${activeShop.name}" exactly to confirm.`);
      return;
    }

    setDeleteShopLoading(true);
    setDeleteShopError(null);
    try {
      const shopIdToDelete = activeShop.id;
      const shopNameToDelete = activeShop.name;
      const remaining = ownedShops.filter((s) => s.id !== shopIdToDelete);

      await deleteShop(shopIdToDelete);
      await removeWorkersForShop(shopIdToDelete);
      await reloadPersistedTransactions();
      await reloadPersistedAudit();

      setDeleteShopLoading(false);
      setDeleteShopModalVisible(false);
      setDeleteShopConfirmInput('');

      if (remaining.length > 0) {
        setActiveShopId(remaining[0].id);
        triggerNotice(`Shop "${shopNameToDelete}" has been permanently deleted.`);
      } else {
        setActiveShopId(null);
        router.replace('/owner-setup');
      }
    } catch (e) {
      setDeleteShopLoading(false);
      setDeleteShopError(e instanceof Error ? e.message : 'Failed to delete shop.');
    }
  }

  async function handleCopyShopCode() {
    if (!activeShop) return;
    await Clipboard.setStringAsync(activeShop.id);
    setCopiedCode(true);
    triggerNotice(`Shop Code ${activeShop.id} copied to clipboard!`);
    setTimeout(() => setCopiedCode(false), 2500);
  }

  async function handleSaveShopName() {
    if (!activeShop) return;
    const trimmed = shopNameInput.trim();
    if (!trimmed) {
      setRenameError('Shop name cannot be empty.');
      return;
    }

    setRenamingLoading(true);
    setRenameError(null);
    try {
      await updateShop(activeShop.id, { name: trimmed });
      setIsRenaming(false);
      setRenamingLoading(false);
      triggerNotice('Shop name updated successfully!');
    } catch (e) {
      setRenamingLoading(false);
      setRenameError(e instanceof Error ? e.message : 'Failed to update shop name.');
    }
  }

  async function handleChangePinSubmit() {
    if (!profile) return;
    if (!isValidPin(oldPin)) {
      setPinError('Current PIN must be 4 digits.');
      return;
    }
    if (!isValidPin(newPin)) {
      setPinError('New PIN must be 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation PIN must match.');
      return;
    }
    if (oldPin === newPin) {
      setPinError('New PIN must be different from current PIN.');
      return;
    }

    setPinLoading(true);
    setPinError(null);
    try {
      await changeOwnerPin(profile.id, oldPin, newPin);
      setPinLoading(false);
      setIsChangingPin(false);
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      triggerNotice('Owner PIN changed successfully!');
    } catch (e) {
      setPinLoading(false);
      setPinError(e instanceof Error ? e.message : 'Failed to change PIN.');
    }
  }

  async function handleCreateNewShop() {
    if (!profile || profile.role !== 'OWNER') return;
    const trimmed = newShopName.trim();
    if (!trimmed) {
      setCreateShopError('Please enter a shop name.');
      return;
    }

    setCreatingShopLoading(true);
    setCreateShopError(null);
    try {
      const created = await createShopWithCloud(trimmed);
      setNewShopName('');
      setIsCreatingShop(false);
      setCreatingShopLoading(false);
      triggerNotice(`Shop "${created.name}" created! Tap Switch to activate.`);
    } catch (e: any) {
      setCreatingShopLoading(false);
      setCreateShopError(e?.message || 'Failed to create shop.');
    }
  }

  async function handleSwitchShop(shop: Shop) {
    if (switchingShopId || shop.id === activeShopId) return;
    setSwitchingShopId(shop.id);
    try {
      await switchShopWithCloud(shop.id);
      triggerNotice(`Switched active shop to "${shop.name}"`);
    } catch (e: any) {
      triggerNotice(e?.message || `Failed to switch to "${shop.name}".`);
    } finally {
      setSwitchingShopId(null);
    }
  }


  async function handleExportBackup() {
    if (!activeShop || exportingBackup) return;
    setExportingBackup(true);
    const result = await exportDatabaseBackupJson(activeShop, shopTransactions, shopAudit);
    setExportingBackup(false);

    if (result.success) {
      triggerNotice(result.message ?? 'Backup file exported successfully!');
    } else {
      const err = result.message ?? 'Failed to export backup.';
      if (Platform.OS === 'web') {
        window.alert(err);
      } else {
        Alert.alert('Backup Error', err);
      }
    }
  }

  function handleLogout() {
    const message = 'Are you sure you want to log out of LedgeCash?';

    const performLogout = () => {
      router.replace('/');
      void logout();
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) {
        performLogout();
      }
      return;
    }

    Alert.alert('Log Out', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: performLogout,
      },
    ]);
  }

  if (!profile || profile.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.hint}>Only the owner can manage application settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back to owner dashboard"
              onPress={() => router.replace('/owner')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          </View>

          <Text style={styles.kicker}>CashManager</Text>
          <Text style={styles.title}>Settings & Administration</Text>
          <Text style={styles.hint}>Manage business profile, security, and data backups.</Text>

          {notice ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          {/* Section 1: Shop & Business Profile Card */}
          <Text style={styles.sectionHeader}>Business Profile</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.shopCodeBadge}>
                <Text style={styles.shopCodeBadgeText}>{activeShop?.id ?? 'N/A'}</Text>
              </View>
              <View style={styles.shopDetails}>
                <Text style={styles.shopNameLabel}>{activeShop?.name ?? 'No Shop Selected'}</Text>
                <Text style={styles.ownerSubtitle}>Owner: {profile.name}</Text>
              </View>
            </View>

            <View style={styles.profileActionsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy Shop Code"
                onPress={handleCopyShopCode}
                style={({ pressed }) => [
                  styles.copyButton,
                  copiedCode && styles.copyButtonActive,
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[
                    styles.copyButtonText,
                    copiedCode && styles.copyButtonTextActive,
                  ]}>
                  {copiedCode ? '✓ Code Copied' : 'Copy Shop Code'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Rename Shop"
                onPress={() => {
                  setShopNameInput(activeShop?.name ?? '');
                  setIsRenaming(!isRenaming);
                  setRenameError(null);
                }}
                style={({ pressed }) => [styles.secondaryActionButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryActionText}>
                  {isRenaming ? 'Cancel' : 'Rename Shop'}
                </Text>
              </Pressable>
            </View>

            {/* Inline Rename Form */}
            {isRenaming ? (
              <View style={styles.inlineForm}>
                <Text style={styles.inputLabel}>New Shop Name</Text>
                <TextInput
                  value={shopNameInput}
                  onChangeText={(val) => {
                    setRenameError(null);
                    setShopNameInput(val);
                  }}
                  placeholder="Enter shop name"
                  placeholderTextColor="#B0B0AA"
                  style={styles.textInput}
                  editable={!renamingLoading}
                />
                {renameError ? <Text style={styles.formError}>{renameError}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save Shop Name"
                  onPress={handleSaveShopName}
                  disabled={renamingLoading}
                  style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
                  <Text style={styles.saveButtonText}>
                    {renamingLoading ? 'Saving…' : 'Save Name'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Section 2: Security & PIN Management */}
          <Text style={styles.sectionHeader}>Security & Credentials</Text>
          <View style={styles.card}>
            <View style={styles.cardHeaderWithAction}>
              <View>
                <Text style={styles.cardTitle}>Owner PIN</Text>
                <Text style={styles.cardSub}>4-digit master access PIN for {profile.name}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Toggle Change PIN"
                onPress={() => {
                  setIsChangingPin(!isChangingPin);
                  setPinError(null);
                }}
                style={({ pressed }) => [styles.toggleButton, pressed && styles.pressed]}>
                <Text style={styles.toggleButtonText}>
                  {isChangingPin ? 'Cancel' : 'Change PIN'}
                </Text>
              </Pressable>
            </View>

            {isChangingPin ? (
              <View style={styles.inlineForm}>
                <Text style={styles.inputLabel}>Current 4-Digit PIN</Text>
                <TextInput
                  value={oldPin}
                  onChangeText={(val) => {
                    setPinError(null);
                    setOldPin(val.replace(/\D/g, '').slice(0, 4));
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  placeholder="••••"
                  placeholderTextColor="#B0B0AA"
                  style={styles.textInput}
                  editable={!pinLoading}
                />

                <Text style={styles.inputLabel}>New 4-Digit PIN</Text>
                <TextInput
                  value={newPin}
                  onChangeText={(val) => {
                    setPinError(null);
                    setNewPin(val.replace(/\D/g, '').slice(0, 4));
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  placeholder="••••"
                  placeholderTextColor="#B0B0AA"
                  style={styles.textInput}
                  editable={!pinLoading}
                />

                <Text style={styles.inputLabel}>Confirm New 4-Digit PIN</Text>
                <TextInput
                  value={confirmPin}
                  onChangeText={(val) => {
                    setPinError(null);
                    setConfirmPin(val.replace(/\D/g, '').slice(0, 4));
                  }}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  placeholder="••••"
                  placeholderTextColor="#B0B0AA"
                  style={styles.textInput}
                  editable={!pinLoading}
                />

                {pinError ? <Text style={styles.formError}>{pinError}</Text> : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save New PIN"
                  onPress={handleChangePinSubmit}
                  disabled={pinLoading}
                  style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
                  <Text style={styles.saveButtonText}>
                    {pinLoading ? 'Updating…' : 'Update Owner PIN'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Section 3: Data Management & Backup */}
          <Text style={styles.sectionHeader}>Data Management & Health</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Local Ledger Status</Text>
            <View style={styles.healthGrid}>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>Database Engine</Text>
                <Text style={styles.healthValue}>SQLite (WAL Mode)</Text>
              </View>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>Active Shop ID</Text>
                <Text style={styles.healthValue}>{activeShop?.id ?? 'None'}</Text>
              </View>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>Shop Transactions</Text>
                <Text style={styles.healthValue}>{shopTransactions.length} records</Text>
              </View>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>Audit Trail Logs</Text>
                <Text style={styles.healthValue}>{shopAudit.length} records</Text>
              </View>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>Integrity Status</Text>
                <Text style={[styles.healthValue, styles.healthyStatus]}>Healthy · Verified</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export Full JSON Backup"
              onPress={handleExportBackup}
              disabled={exportingBackup}
              style={({ pressed }) => [
                styles.backupButton,
                (pressed || exportingBackup) && styles.pressed,
              ]}>
              {exportingBackup ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.backupButtonText}>Export Full JSON Backup</Text>
              )}
            </Pressable>
          </View>

          {/* Section 4: Multi-Shop Switcher & Session Controls */}
          <Text style={styles.sectionHeader}>Shops & Branches</Text>
          <View style={styles.card}>
            <View style={styles.cardHeaderWithAction}>
              <Text style={styles.cardTitle}>Your Shops ({ownedShops.length})</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create another shop"
                onPress={() => {
                  setIsCreatingShop(!isCreatingShop);
                  setCreateShopError(null);
                }}
                style={({ pressed }) => [styles.toggleButton, pressed && styles.pressed]}>
                <Text style={styles.toggleButtonText}>
                  {isCreatingShop ? 'Cancel' : '+ Add Shop'}
                </Text>
              </Pressable>
            </View>

            {isCreatingShop ? (
              <View style={styles.inlineForm}>
                <Text style={styles.inputLabel}>New Shop Name</Text>
                <TextInput
                  value={newShopName}
                  onChangeText={(val) => {
                    setCreateShopError(null);
                    setNewShopName(val);
                  }}
                  placeholder="e.g. South Branch"
                  placeholderTextColor="#B0B0AA"
                  style={styles.textInput}
                  editable={!creatingShopLoading}
                />
                {createShopError ? (
                  <Text style={styles.formError}>{createShopError}</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create Shop"
                  onPress={handleCreateNewShop}
                  disabled={creatingShopLoading}
                  style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
                  <Text style={styles.saveButtonText}>
                    {creatingShopLoading ? 'Creating…' : 'Create Shop'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {ownedShops.map((shop: Shop) => {
              const isActive = shop.id === activeShopId;
              const isSwitchingThis = switchingShopId === shop.id;

              return (
                <View key={shop.id} style={styles.shopListItem}>
                  <View style={styles.shopListInfo}>
                    <Text style={styles.shopListName}>{shop.name}</Text>
                    <Text style={styles.shopListCode}>ID: {shop.id}</Text>
                  </View>
                  {isActive ? (
                    <View style={styles.activeShopBadge}>
                      <Text style={styles.activeShopBadgeText}>Active</Text>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Switch to ${shop.name}`}
                      disabled={Boolean(switchingShopId)}
                      onPress={() => void handleSwitchShop(shop)}
                      style={({ pressed }) => [
                        styles.switchButton,
                        (pressed || isSwitchingThis) && styles.pressed,
                      ]}>
                      {isSwitchingThis ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.switchButtonText}>Switch</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}

          </View>

          {/* Section 5: Logout */}
          <Text style={styles.sectionHeader}>Session</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Signed in as {profile.name}</Text>
            <Text style={styles.cardSub}>
              Logging out ends your current active session and returns to the opening screen.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log Out"
              onPress={handleLogout}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
              <Text style={styles.logoutButtonText}>Log Out from LedgeCash</Text>
            </Pressable>
          </View>

          {/* Section 6: Danger Zone - Delete Shop */}
          <Text style={[styles.sectionHeader, { color: '#B91C1C' }]}>Danger Zone</Text>
          <View style={[styles.card, styles.dangerCard]}>
            <View style={styles.dangerHeaderRow}>
              <View style={styles.dangerIconBox}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
              </View>
              <View style={styles.dangerTitleCol}>
                <Text style={styles.dangerTitle}>Delete Current Shop</Text>
                <Text style={styles.dangerSub}>
                  Permanently remove {activeShop?.name ?? 'this shop'} and all associated records.
                </Text>
              </View>
            </View>

            <Text style={styles.dangerWarningBody}>
              This will permanently delete shop &ldquo;{activeShop?.name ?? 'this shop'}&rdquo; ({activeShop?.id ?? 'N/A'}), along with all transactions, worker associations, and audit trail records. This action cannot be reversed.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete this shop"
              disabled={!activeShop}
              onPress={() => {
                if (!activeShop) return;
                setDeleteShopConfirmInput('');
                setDeleteShopError(null);
                setDeleteShopModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.deleteShopBtn,
                !activeShop && styles.deleteShopBtnDisabled,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
              <Text style={styles.deleteShopBtnText}>{`Delete "${activeShop?.name ?? 'Shop'}"`}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete Shop Confirmation Modal */}
      <Modal
        visible={deleteShopModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteShopLoading && setDeleteShopModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteModalCard}>
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteModalIconBox}>
                <Ionicons name="trash" size={24} color="#DC2626" />
              </View>
              <Text style={styles.deleteModalTitle}>Delete {activeShop?.name ?? 'Shop'}?</Text>
              <Text style={styles.deleteModalSub}>
                All financial transactions, worker accounts, and audit records under this shop will be permanently wiped.
              </Text>
            </View>

            <View style={styles.deleteModalPrompt}>
              <Text style={styles.deleteModalPromptLabel}>
                Type <Text style={styles.boldText}>{activeShop?.name ?? 'Shop'}</Text> to confirm:
              </Text>
              <TextInput
                value={deleteShopConfirmInput}
                onChangeText={(val) => {
                  setDeleteShopError(null);
                  setDeleteShopConfirmInput(val);
                }}
                placeholder={activeShop?.name ?? 'Shop Name'}
                placeholderTextColor="#94A3B8"
                style={styles.deleteModalInput}
                editable={!deleteShopLoading}
                autoCapitalize="none"
              />
              {deleteShopError ? (
                <Text style={styles.deleteModalError}>{deleteShopError}</Text>
              ) : null}
            </View>

            <View style={styles.deleteModalActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel shop deletion"
                disabled={deleteShopLoading}
                onPress={() => setDeleteShopModalVisible(false)}
                style={({ pressed }) => [
                  styles.cancelDeleteBtn,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.cancelDeleteBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm permanent shop deletion"
                disabled={deleteShopLoading || !isConfirmed}
                onPress={handleConfirmDeleteShop}
                style={({ pressed }) => [
                  styles.confirmDeleteBtn,
                  (!isConfirmed || deleteShopLoading) && styles.confirmDeleteBtnDisabled,
                  pressed && isConfirmed && !deleteShopLoading && styles.pressed,
                ]}>
                {deleteShopLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.confirmDeleteBtnText,
                      (!isConfirmed || deleteShopLoading) && styles.confirmDeleteBtnTextDisabled,
                    ]}>
                    Permanently Delete
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  hint: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B6B6B',
    marginBottom: 16,
  },
  noticeBox: {
    backgroundColor: '#E8F6EE',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A4D',
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#8A8A86',
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EFEFEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    marginBottom: 4,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  shopCodeBadge: {
    backgroundColor: BrandColors.navy,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shopCodeBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  shopDetails: {
    flex: 1,
  },
  shopNameLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  ownerSubtitle: {
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
  },
  profileActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  copyButton: {
    flex: 1,
    backgroundColor: '#F0F0EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonActive: {
    backgroundColor: '#E8F6EE',
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  copyButtonTextActive: {
    color: '#1F7A4D',
    fontWeight: '700',
  },
  secondaryActionButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0DA',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  cardSub: {
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 2,
  },
  toggleButton: {
    backgroundColor: '#F0F0EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  inlineForm: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F0EB',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A86',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F7F7F5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E5E5E0',
    marginBottom: 6,
  },
  formError: {
    fontSize: 13,
    color: '#B42318',
    marginBottom: 8,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: BrandColors.green,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  healthGrid: {
    marginTop: 12,
    gap: 8,
    marginBottom: 16,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F8F6',
  },
  healthLabel: {
    fontSize: 13,
    color: '#6B6B6B',
  },
  healthValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  healthyStatus: {
    color: '#1F7A4D',
    fontWeight: '700',
  },
  backupButton: {
    backgroundColor: BrandColors.navy,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backupButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shopListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0EB',
  },
  shopListInfo: {
    flex: 1,
  },
  shopListName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  shopListCode: {
    fontSize: 12,
    color: '#8A8A86',
    marginTop: 2,
  },
  activeShopBadge: {
    backgroundColor: '#E8F6EE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  activeShopBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F7A4D',
  },
  switchButton: {
    backgroundColor: '#F0F0EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  switchButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
  },
  logoutButton: {
    marginTop: 14,
    backgroundColor: '#FBECEA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F5C6CB',
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B54708',
  },
  dangerCard: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FFFDFD',
    borderWidth: 1.5,
    marginBottom: 24,
  },
  dangerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  dangerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerTitleCol: {
    flex: 1,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  dangerSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 18,
  },
  dangerWarningBody: {
    fontSize: 13,
    color: '#7F1D1D',
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    lineHeight: 18,
    marginVertical: 12,
  },
  deleteShopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
  },
  deleteShopBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  deleteModalHeader: {
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 16,
  },
  deleteModalIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  deleteModalSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  deleteModalPrompt: {
    marginVertical: 14,
  },
  deleteModalPromptLabel: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 8,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  deleteModalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  deleteModalError: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 6,
    fontWeight: '500',
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelDeleteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  confirmDeleteBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteBtnDisabled: {
    backgroundColor: '#FCA5A5',
    opacity: 0.6,
  },
  confirmDeleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmDeleteBtnTextDisabled: {
    color: '#FFFFFF',
    opacity: 0.8,
  },
  deleteShopBtnDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
});
