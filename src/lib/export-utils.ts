import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { formatTime } from '@/lib/money';
import { transactionTypeLabel } from '@/lib/transactions';
import type { AuditEntry } from '@/types/audit';
import type { Transaction } from '@/types/transaction';

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateLedgerCsv(transactions: Transaction[]): string {
  const headers = ['Date', 'Time', 'Type', 'Amount', 'Category', 'Handled By', 'Description'];
  const rows: string[] = [headers.join(',')];

  for (const t of transactions) {
    const dateStr = t.createdAt.split('T')[0] ?? t.createdAt;
    const timeStr = formatTime(t.createdAt);
    const typeStr = transactionTypeLabel(t.type);
    const amountStr = t.amount.toFixed(2);
    const categoryStr = t.category ?? '';
    const handledByStr = t.createdBy.name;
    const descStr = t.description ?? '';

    const row = [
      escapeCsvField(dateStr),
      escapeCsvField(timeStr),
      escapeCsvField(typeStr),
      escapeCsvField(amountStr),
      escapeCsvField(categoryStr),
      escapeCsvField(handledByStr),
      escapeCsvField(descStr),
    ];

    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}

export type ExportResult = {
  success: boolean;
  message?: string;
  uri?: string;
};

export async function exportLedgerCsv(
  transactions: Transaction[],
  options?: {
    shopName?: string;
    periodLabel?: string;
  }
): Promise<ExportResult> {
  if (transactions.length === 0) {
    return {
      success: false,
      message: 'No transactions found for the selected period to export.',
    };
  }

  const csvContent = generateLedgerCsv(transactions);
  const rawShop = (options?.shopName ?? 'shop').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const rawPeriod = (options?.periodLabel ?? 'all').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStamp = new Date().toISOString().split('T')[0];
  const fileName = `ledger_${rawShop}_${rawPeriod}_${dateStamp}.csv`;

  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return { success: true, message: `Downloaded ${fileName}` };
      }
      return { success: false, message: 'Web environment does not support downloads.' };
    }

    // Native implementation (iOS / Android)
    const file = new File(Paths.cache, fileName);
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(csvContent);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Ledger CSV',
        UTI: 'public.comma-separated-values-text',
      });
      return { success: true, uri: file.uri, message: 'Exported successfully' };
    }

    // Fallback if sharing extension is not available
    await Share.share({
      title: fileName,
      message: csvContent,
    });
    return { success: true, message: 'Exported successfully via standard share' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to export CSV file.';
    return { success: false, message: msg };
  }
}

export type JsonBackupData = {
  version: number;
  exportedAt: string;
  shop: {
    id: string;
    name: string;
  };
  transactions: Transaction[];
  audit: AuditEntry[];
};

export async function exportDatabaseBackupJson(
  shop: { id: string; name: string },
  transactions: Transaction[],
  audit: AuditEntry[]
): Promise<ExportResult> {
  const data: JsonBackupData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    shop,
    transactions,
    audit,
  };

  const jsonContent = JSON.stringify(data, null, 2);
  const rawShop = shop.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStamp = new Date().toISOString().split('T')[0];
  const fileName = `backup_${rawShop}_${shop.id}_${dateStamp}.json`;

  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return { success: true, message: `Downloaded ${fileName}` };
      }
      return { success: false, message: 'Web environment does not support downloads.' };
    }

    const file = new File(Paths.cache, fileName);
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(jsonContent);

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Database JSON Backup',
        UTI: 'public.json',
      });
      return { success: true, uri: file.uri, message: 'Backup exported successfully' };
    }

    await Share.share({
      title: fileName,
      message: jsonContent,
    });
    return { success: true, message: 'Backup shared successfully' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to export backup file.';
    return { success: false, message: msg };
  }
}

