package com.ledgecash.service;

import com.ledgecash.dto.SyncBatchRequest;
import com.ledgecash.dto.SyncBatchResponse;
import com.ledgecash.dto.SyncTransactionItem;
import com.ledgecash.dto.TransactionResponse;
import com.ledgecash.exception.ForbiddenException;
import com.ledgecash.model.Transaction;
import com.ledgecash.model.TransactionType;
import com.ledgecash.repository.TransactionRepository;
import com.ledgecash.security.UserPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public class SyncService {

    private final TransactionRepository transactionRepository;

    public SyncService(TransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    @Transactional
    public SyncBatchResponse processBatchSync(SyncBatchRequest request, UserPrincipal currentUser) {
        String shopId = currentUser.getShopId();
        int syncedCount = 0;

        if (request.getTransactions() != null) {
            for (SyncTransactionItem item : request.getTransactions()) {
                if (item.getId() == null || item.getId().isBlank()) {
                    continue;
                }

                // Security: prevent cross-tenant ID collision or takeover
                Optional<Transaction> existingOpt = transactionRepository.findByIdAndShopId(item.getId(), shopId);
                if (transactionRepository.existsById(item.getId()) && existingOpt.isEmpty()) {
                    throw new ForbiddenException("Transaction belongs to another shop");
                }

                // Security: enforce role restrictions on mutations
                if (item.getType() == TransactionType.CASH_OUT && !currentUser.isOwner()) {
                    throw new ForbiddenException("Workers cannot sync CASH_OUT transactions");
                }

                if (item.isDeleted() && !currentUser.isOwner()) {
                    throw new ForbiddenException("Only the shop owner can delete transactions");
                }

                if (existingOpt.isPresent()) {
                    Transaction existing = existingOpt.get();

                    boolean hasChanges = existing.getAmount().compareTo(item.getAmount()) != 0
                            || existing.getType() != item.getType()
                            || !java.util.Objects.equals(existing.getCategory(), item.getCategory())
                            || !java.util.Objects.equals(existing.getDescription(), item.getDescription())
                            || existing.isDeleted() != item.isDeleted();

                    if (hasChanges && !currentUser.isOwner()) {
                        throw new ForbiddenException("Only the shop owner can edit transactions");
                    }

                    Instant clientTime = item.getUpdatedAt() != null ? item.getUpdatedAt() : item.getCreatedAt();
                    Instant serverTime = existing.getUpdatedAt() != null ? existing.getUpdatedAt() : existing.getCreatedAt();

                    // Only update if client has newer or equal modification time with actual changes
                    if (hasChanges && clientTime != null && (serverTime == null || !clientTime.isBefore(serverTime))) {
                        existing.setType(item.getType());
                        existing.setAmount(item.getAmount());
                        existing.setCategory(item.getCategory());
                        existing.setDescription(item.getDescription());
                        existing.setDeleted(item.isDeleted());
                        existing.setUpdatedAt(Instant.now());
                        transactionRepository.save(existing);
                        syncedCount++;
                    }
                } else {
                    String createdById = StringUtils.hasText(item.getCreatedById()) ? item.getCreatedById() : currentUser.getId();
                    String createdByName = StringUtils.hasText(item.getCreatedByName()) ? item.getCreatedByName() : currentUser.getName();
                    Instant createdAt = item.getCreatedAt() != null ? item.getCreatedAt() : Instant.now();
                    Instant updatedAt = item.getUpdatedAt() != null ? item.getUpdatedAt() : createdAt;

                    Transaction newTx = new Transaction(
                            item.getId(),
                            shopId,
                            item.getType(),
                            item.getAmount(),
                            item.getCategory(),
                            item.getDescription(),
                            createdById,
                            createdByName,
                            createdAt,
                            updatedAt,
                            item.isDeleted()
                    );
                    transactionRepository.save(newTx);
                    syncedCount++;
                }
            }
        }

        Instant since = request.getLastSyncTimestamp() != null ? request.getLastSyncTimestamp() : Instant.EPOCH;
        List<Transaction> serverChangesEntities = transactionRepository.findChangesSince(shopId, since);

        List<TransactionResponse> serverChanges = new ArrayList<>();
        for (Transaction tx : serverChangesEntities) {
            serverChanges.add(TransactionResponse.fromEntity(tx));
        }

        return new SyncBatchResponse(syncedCount, serverChanges, Instant.now());
    }
}
