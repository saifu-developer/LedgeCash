package com.ledgecash.repository;

import com.ledgecash.model.Transaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface TransactionRepository extends JpaRepository<Transaction, String> {

    Page<Transaction> findByShopIdAndIsDeletedFalse(String shopId, Pageable pageable);

    Page<Transaction> findByShopIdAndIsDeletedFalseAndCreatedAtBetween(
            String shopId, Instant from, Instant to, Pageable pageable);

    Optional<Transaction> findByIdAndShopId(String id, String shopId);

    @Query("SELECT t FROM Transaction t WHERE t.shopId = :shopId AND " +
           "(t.createdAt >= :since OR (t.updatedAt IS NOT NULL AND t.updatedAt >= :since)) " +
           "ORDER BY t.createdAt ASC")
    List<Transaction> findChangesSince(@Param("shopId") String shopId, @Param("since") Instant since);
}
