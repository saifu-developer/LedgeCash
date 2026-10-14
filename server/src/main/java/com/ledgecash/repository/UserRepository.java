package com.ledgecash.repository;

import com.ledgecash.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByPhone(String phone);
    Optional<User> findByPhoneAndShopId(String phone, String shopId);
    List<User> findByShopId(String shopId);
    boolean existsByPhone(String phone);
}
