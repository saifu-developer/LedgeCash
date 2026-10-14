package com.ledgecash.service;

import com.ledgecash.dto.EditTransactionRequest;
import com.ledgecash.dto.TransactionRequest;
import com.ledgecash.dto.TransactionResponse;
import com.ledgecash.exception.BadRequestException;
import com.ledgecash.exception.ForbiddenException;
import com.ledgecash.exception.ResourceNotFoundException;
import com.ledgecash.model.AuditAction;
import com.ledgecash.model.AuditLog;
import com.ledgecash.model.Transaction;
import com.ledgecash.model.TransactionType;
import com.ledgecash.repository.AuditLogRepository;
import com.ledgecash.repository.TransactionRepository;
import com.ledgecash.security.UserPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.UUID;

@Service
public class TransactionService {

    private final TransactionRepository transactionRepository;
    private final AuditLogRepository auditLogRepository;

    public TransactionService(TransactionRepository transactionRepository,
                              AuditLogRepository auditLogRepository) {
        this.transactionRepository = transactionRepository;
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional(readOnly = true)
    public Page<TransactionResponse> getTransactions(UserPrincipal currentUser, Instant from, Instant to, Pageable pageable) {
        String shopId = currentUser.getShopId();
        Page<Transaction> page;

        if (from != null && to != null) {
            page = transactionRepository.findByShopIdAndIsDeletedFalseAndCreatedAtBetween(shopId, from, to, pageable);
        } else {
            page = transactionRepository.findByShopIdAndIsDeletedFalse(shopId, pageable);
        }

        return page.map(TransactionResponse::fromEntity);
    }

    @Transactional
    public TransactionResponse createTransaction(TransactionRequest request, UserPrincipal currentUser) {
        if (request.getType() == TransactionType.CASH_OUT && !currentUser.isOwner()) {
            throw new ForbiddenException("Only shop owners are authorized to perform Cash Out transactions");
        }

        String id = StringUtils.hasText(request.getId()) ? request.getId() : UUID.randomUUID().toString();
        Instant createdAt = request.getCreatedAt() != null ? request.getCreatedAt() : Instant.now();

        Transaction tx = new Transaction(
                id,
                currentUser.getShopId(),
                request.getType(),
                request.getAmount(),
                request.getCategory(),
                request.getDescription(),
                currentUser.getId(),
                currentUser.getName(),
                createdAt,
                null,
                false
        );

        Transaction saved = transactionRepository.save(tx);
        return TransactionResponse.fromEntity(saved);
    }

    @Transactional
    public TransactionResponse editTransaction(String id, EditTransactionRequest request, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only shop owners can edit transactions");
        }

        Transaction tx = transactionRepository.findByIdAndShopId(id, currentUser.getShopId())
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found or access denied: " + id));

        if (tx.isDeleted()) {
            throw new BadRequestException("Cannot edit a deleted transaction");
        }

        // Record Audit Log
        AuditLog auditLog = new AuditLog(
                UUID.randomUUID().toString(),
                currentUser.getShopId(),
                tx.getId(),
                AuditAction.EDIT,
                tx.getAmount(),
                request.getAmount(),
                tx.getType().name(),
                currentUser.getId(),
                currentUser.getName(),
                Instant.now(),
                request.getReason()
        );
        auditLogRepository.save(auditLog);

        // Update transaction
        tx.setType(request.getType());
        tx.setAmount(request.getAmount());
        tx.setCategory(request.getCategory());
        tx.setDescription(request.getDescription());
        tx.setUpdatedAt(Instant.now());

        Transaction saved = transactionRepository.save(tx);
        return TransactionResponse.fromEntity(saved);
    }

    @Transactional
    public void deleteTransaction(String id, String reason, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only shop owners can delete transactions");
        }

        Transaction tx = transactionRepository.findByIdAndShopId(id, currentUser.getShopId())
                .orElseThrow(() -> new ResourceNotFoundException("Transaction not found or access denied: " + id));

        if (tx.isDeleted()) {
            return; // Already deleted
        }

        // Record Audit Log
        AuditLog auditLog = new AuditLog(
                UUID.randomUUID().toString(),
                currentUser.getShopId(),
                tx.getId(),
                AuditAction.DELETE,
                tx.getAmount(),
                null,
                tx.getType().name(),
                currentUser.getId(),
                currentUser.getName(),
                Instant.now(),
                reason
        );
        auditLogRepository.save(auditLog);

        // Soft delete
        tx.setDeleted(true);
        tx.setUpdatedAt(Instant.now());
        transactionRepository.save(tx);
    }
}
