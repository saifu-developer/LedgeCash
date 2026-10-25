package com.ledgecash.service;

import com.ledgecash.dto.CreateShopRequest;
import com.ledgecash.dto.ShopResponse;
import com.ledgecash.exception.ForbiddenException;
import com.ledgecash.model.Shop;
import com.ledgecash.repository.ShopRepository;
import com.ledgecash.security.UserPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ShopService {

    private final ShopRepository shopRepository;
    private final SecureRandom random = new SecureRandom();

    public ShopService(ShopRepository shopRepository) {
        this.shopRepository = shopRepository;
    }

    @Transactional(readOnly = true)
    public List<ShopResponse> getOwnerShops(UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only the shop owner can view owned shops");
        }
        return shopRepository.findByOwnerId(currentUser.getId())
                .stream()
                .map(ShopResponse::fromEntity)
                .toList();
    }

    @Transactional
    public ShopResponse createShop(CreateShopRequest request, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only the shop owner can create shops");
        }

        String shopName = request.getName().trim();
        String shopCode = generateUniqueShopCode();

        Shop shop = new Shop(shopCode, shopName, currentUser.getId(), Instant.now());
        Shop saved = shopRepository.save(shop);

        return ShopResponse.fromEntity(saved);
    }

    public String generateUniqueShopCode() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (int attempts = 0; attempts < 100; attempts++) {
            StringBuilder sb = new StringBuilder("LC-");
            for (int i = 0; i < 6; i++) {
                sb.append(chars.charAt(random.nextInt(chars.length())));
            }
            String code = sb.toString();
            if (!shopRepository.existsById(code)) {
                return code;
            }
        }
        return "LC-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    }
}
