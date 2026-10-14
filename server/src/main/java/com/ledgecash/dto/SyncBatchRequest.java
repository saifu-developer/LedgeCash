package com.ledgecash.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class SyncBatchRequest {

    private Instant lastSyncTimestamp;
    private List<SyncTransactionItem> transactions = new ArrayList<>();

    public SyncBatchRequest() {}

    public SyncBatchRequest(Instant lastSyncTimestamp, List<SyncTransactionItem> transactions) {
        this.lastSyncTimestamp = lastSyncTimestamp;
        this.transactions = transactions != null ? transactions : new ArrayList<>();
    }

    public Instant getLastSyncTimestamp() {
        return lastSyncTimestamp;
    }

    public void setLastSyncTimestamp(Instant lastSyncTimestamp) {
        this.lastSyncTimestamp = lastSyncTimestamp;
    }

    public List<SyncTransactionItem> getTransactions() {
        return transactions;
    }

    public void setTransactions(List<SyncTransactionItem> transactions) {
        this.transactions = transactions;
    }
}
