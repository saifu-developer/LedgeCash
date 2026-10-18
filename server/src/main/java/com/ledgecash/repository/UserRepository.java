package com.ledgecash.repository;

import com.ledgecash.model.User;
import com.ledgecash.model.UserRole;
import com.ledgecash.model.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByPhone(String phone);
    Optional<User> findByPhoneAndShopId(String phone, String shopId);
    Optional<User> findByIdAndShopId(String id, String shopId);
    List<User> findByShopId(String shopId);
    List<User> findByShopIdAndRoleAndStatus(String shopId, UserRole role, UserStatus status);
    boolean existsByPhone(String phone);
}

