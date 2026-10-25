package com.ledgecash.repository;

import com.ledgecash.model.Shop;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ShopRepository extends JpaRepository<Shop, String> {
    Optional<Shop> findById(String id);
    boolean existsById(String id);
    List<Shop> findByOwnerId(String ownerId);
    Optional<Shop> findByIdAndOwnerId(String id, String ownerId);
}
