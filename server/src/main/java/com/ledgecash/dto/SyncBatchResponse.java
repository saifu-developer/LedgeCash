package com.ledgecash.dto;

import java.time.Instant;
import java.util.List;

public class SyncBatchResponse {

    private int syncedCount;
    private List<TransactionResponse> serverChanges;
    private Instant syncTimestamp;

    public SyncBatchResponse() {}

    public SyncBatchResponse(int syncedCount, List<TransactionResponse> serverChanges, Instant syncTimestamp) {
        this.syncedCount = syncedCount;
        this.serverChanges = serverChanges;
        this.syncTimestamp = syncTimestamp;
    }

    public int getSyncedCount() {
        return syncedCount;
    }

    public void setSyncedCount(int syncedCount) {
        this.syncedCount = syncedCount;
    }

    public List<TransactionResponse> getServerChanges() {
        return serverChanges;
    }

    public void setServerChanges(List<TransactionResponse> serverChanges) {
        this.serverChanges = serverChanges;
    }

    public Instant getSyncTimestamp() {
        return syncTimestamp;
    }

    public void setSyncTimestamp(Instant syncTimestamp) {
        this.syncTimestamp = syncTimestamp;
    }
}
