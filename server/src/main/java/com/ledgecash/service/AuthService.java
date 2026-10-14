package com.ledgecash.service;

import com.ledgecash.dto.AuthResponse;
import com.ledgecash.dto.CreateWorkerRequest;
import com.ledgecash.dto.LoginRequest;
import com.ledgecash.dto.RegisterOwnerRequest;
import com.ledgecash.exception.BadRequestException;
import com.ledgecash.exception.ForbiddenException;
import com.ledgecash.exception.ResourceNotFoundException;
import com.ledgecash.model.Shop;
import com.ledgecash.model.User;
import com.ledgecash.model.UserRole;
import com.ledgecash.model.UserStatus;
import com.ledgecash.repository.ShopRepository;
import com.ledgecash.repository.UserRepository;
import com.ledgecash.security.JwtTokenProvider;
import com.ledgecash.security.UserPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final ShopRepository shopRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final SecureRandom random = new SecureRandom();

    public AuthService(UserRepository userRepository,
                       ShopRepository shopRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider) {
        this.userRepository = userRepository;
        this.shopRepository = shopRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
    }

    @Transactional
    public AuthResponse registerOwner(RegisterOwnerRequest request) {
        if (userRepository.existsByPhone(request.getPhone())) {
            throw new BadRequestException("Phone number is already registered: " + request.getPhone());
        }

        String shopCode = generateUniqueShopCode();
        String userId = UUID.randomUUID().toString();

        Shop shop = new Shop(shopCode, request.getShopName().trim(), userId, Instant.now());
        shopRepository.save(shop);

        String pinHash = passwordEncoder.encode(request.getPin().trim());
        User owner = new User(
                userId,
                request.getName().trim(),
                request.getPhone().trim(),
                pinHash,
                UserRole.OWNER,
                UserStatus.ACTIVE,
                shopCode,
                Instant.now()
        );
        userRepository.save(owner);

        String token = tokenProvider.generateToken(owner.getId(), owner.getPhone(), owner.getName(), shopCode, owner.getRole());

        return new AuthResponse(token, owner.getId(), owner.getName(), owner.getPhone(), shopCode, shop.getName(), owner.getRole());
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String shopId = request.getShopId().trim().toUpperCase();
        Shop shop = shopRepository.findById(shopId)
                .orElseThrow(() -> new ResourceNotFoundException("Shop not found with code: " + shopId));

        User user = userRepository.findByPhoneAndShopId(request.getPhone().trim(), shopId)
                .orElseThrow(() -> new BadRequestException("Invalid credentials for this shop"));

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ForbiddenException("Account is inactive");
        }

        if (!passwordEncoder.matches(request.getPin().trim(), user.getPinHash())) {
            throw new BadRequestException("Invalid credentials for this shop");
        }

        String token = tokenProvider.generateToken(user.getId(), user.getPhone(), user.getName(), shopId, user.getRole());

        return new AuthResponse(token, user.getId(), user.getName(), user.getPhone(), shopId, shop.getName(), user.getRole());
    }

    @Transactional
    public AuthResponse createWorker(CreateWorkerRequest request, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only the shop owner can create worker accounts");
        }

        String shopId = currentUser.getShopId();
        if (userRepository.findByPhoneAndShopId(request.getPhone().trim(), shopId).isPresent()) {
            throw new BadRequestException("A worker with phone " + request.getPhone() + " already exists in this shop");
        }

        Shop shop = shopRepository.findById(shopId)
                .orElseThrow(() -> new ResourceNotFoundException("Shop not found"));

        String userId = UUID.randomUUID().toString();
        String pinHash = passwordEncoder.encode(request.getPin().trim());

        User worker = new User(
                userId,
                request.getName().trim(),
                request.getPhone().trim(),
                pinHash,
                UserRole.WORKER,
                UserStatus.ACTIVE,
                shopId,
                Instant.now()
        );
        userRepository.save(worker);

        String token = tokenProvider.generateToken(worker.getId(), worker.getPhone(), worker.getName(), shopId, worker.getRole());

        return new AuthResponse(token, worker.getId(), worker.getName(), worker.getPhone(), shopId, shop.getName(), worker.getRole());
    }

    private String generateUniqueShopCode() {
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
