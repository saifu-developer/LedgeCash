package com.ledgecash.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_shop_created", columnList = "shopId, createdAt"),
    @Index(name = "idx_audit_tx_id", columnList = "transactionId")
})
public class AuditLog {

    @Id
    @Column(name = "id", length = 64, nullable = false, updatable = false)
    private String id;

    @Column(name = "shop_id", length = 32, nullable = false)
    private String shopId;

    @Column(name = "transaction_id", length = 64, nullable = false)
    private String transactionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", length = 20, nullable = false)
    private AuditAction action;

    @Column(name = "original_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal originalAmount;

    @Column(name = "new_amount", precision = 15, scale = 2)
    private BigDecimal newAmount;

    @Column(name = "original_type", length = 20, nullable = false)
    private String originalType;

    @Column(name = "corrected_by_id", length = 64, nullable = false)
    private String correctedById;

    @Column(name = "corrected_by_name", length = 100, nullable = false)
    private String correctedByName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "reason", length = 500)
    private String reason;

    public AuditLog() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public AuditLog(String id, String shopId, String transactionId, AuditAction action,
                    BigDecimal originalAmount, BigDecimal newAmount, String originalType,
                    String correctedById, String correctedByName, Instant createdAt, String reason) {
        this.id = id != null ? id : UUID.randomUUID().toString();
        this.shopId = shopId;
        this.transactionId = transactionId;
        this.action = action;
        this.originalAmount = originalAmount;
        this.newAmount = newAmount;
        this.originalType = originalType;
        this.correctedById = correctedById;
        this.correctedByName = correctedByName;
        this.createdAt = createdAt != null ? createdAt : Instant.now();
        this.reason = reason;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getShopId() {
        return shopId;
    }

    public void setShopId(String shopId) {
        this.shopId = shopId;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(String transactionId) {
        this.transactionId = transactionId;
    }

    public AuditAction getAction() {
        return action;
    }

    public void setAction(AuditAction action) {
        this.action = action;
    }

    public BigDecimal getOriginalAmount() {
        return originalAmount;
    }

    public void setOriginalAmount(BigDecimal originalAmount) {
        this.originalAmount = originalAmount;
    }

    public BigDecimal getNewAmount() {
        return newAmount;
    }

    public void setNewAmount(BigDecimal newAmount) {
        this.newAmount = newAmount;
    }

    public String getOriginalType() {
        return originalType;
    }

    public void setOriginalType(String originalType) {
        this.originalType = originalType;
    }

    public String getCorrectedById() {
        return correctedById;
    }

    public void setCorrectedById(String correctedById) {
        this.correctedById = correctedById;
    }

    public String getCorrectedByName() {
        return correctedByName;
    }

    public void setCorrectedByName(String correctedByName) {
        this.correctedByName = correctedByName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }
}
