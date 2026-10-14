package com.ledgecash.repository;

import com.ledgecash.model.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, String> {
    List<AuditLog> findByShopIdOrderByCreatedAtDesc(String shopId);
    List<AuditLog> findByShopIdAndTransactionIdOrderByCreatedAtDesc(String shopId, String transactionId);
}
