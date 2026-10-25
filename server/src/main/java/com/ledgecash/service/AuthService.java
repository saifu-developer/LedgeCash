package com.ledgecash.service;

import com.ledgecash.dto.*;
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
import java.util.List;
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

    @Transactional(readOnly = true)
    public ShopWorkersResponse getShopWorkers(String shopCode) {
        if (shopCode == null || shopCode.trim().isEmpty()) {
            throw new BadRequestException("Shop code is required");
        }
        String normalizedCode = shopCode.trim().toUpperCase();
        Shop shop = shopRepository.findById(normalizedCode)
                .orElseThrow(() -> new ResourceNotFoundException("Shop not found with code: " + normalizedCode));

        List<User> workers = userRepository.findByShopIdAndRoleAndStatus(
                normalizedCode,
                UserRole.WORKER,
                UserStatus.ACTIVE
        );

        List<WorkerSummaryDto> workerDtos = workers.stream()
                .map(w -> new WorkerSummaryDto(w.getId(), w.getName(), w.getRole(), w.getStatus(), normalizedCode))
                .toList();

        return new ShopWorkersResponse(shop.getId(), shop.getName(), shop.getOwnerId(), workerDtos);
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

        User user;
        if (request.getUserId() != null && !request.getUserId().trim().isEmpty()) {
            user = userRepository.findByIdAndShopId(request.getUserId().trim(), shopId)
                    .orElseThrow(() -> new BadRequestException("Invalid credentials for this shop"));
        } else if (request.getPhone() != null && !request.getPhone().trim().isEmpty()) {
            user = userRepository.findByPhoneAndShopId(request.getPhone().trim(), shopId)
                    .orElseThrow(() -> new BadRequestException("Invalid credentials for this shop"));
        } else {
            throw new BadRequestException("User ID or phone number is required");
        }

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ForbiddenException("Account is inactive");
        }

        if (!passwordEncoder.matches(request.getPin().trim(), user.getPinHash())) {
            throw new BadRequestException("Invalid credentials for this shop");
        }

        String phone = user.getPhone() != null ? user.getPhone() : "";
        String token = tokenProvider.generateToken(user.getId(), phone, user.getName(), shopId, user.getRole());

        return new AuthResponse(token, user.getId(), user.getName(), user.getPhone(), shopId, shop.getName(), user.getRole());
    }

    @Transactional(readOnly = true)
    public OwnerLoginResponse ownerLogin(OwnerLoginRequest request) {
        if (request.getPhone() == null || request.getPhone().trim().isEmpty()) {
            throw new BadRequestException("Phone number is required");
        }
        if (request.getPin() == null || request.getPin().trim().isEmpty()) {
            throw new BadRequestException("PIN is required");
        }

        String phone = request.getPhone().trim();
        User owner = userRepository.findByPhone(phone)
                .orElseThrow(() -> new BadRequestException("Invalid credentials"));

        if (owner.getRole() != UserRole.OWNER) {
            throw new BadRequestException("Invalid credentials");
        }

        if (owner.getStatus() != UserStatus.ACTIVE) {
            throw new ForbiddenException("Account is inactive");
        }

        if (!passwordEncoder.matches(request.getPin().trim(), owner.getPinHash())) {
            throw new BadRequestException("Invalid credentials");
        }

        List<Shop> ownedShops = shopRepository.findByOwnerId(owner.getId());

        Shop defaultShop = null;
        if (owner.getShopId() != null && !owner.getShopId().isBlank()) {
            defaultShop = ownedShops.stream()
                    .filter(s -> s.getId().equals(owner.getShopId()))
                    .findFirst()
                    .orElse(null);
        }
        if (defaultShop == null && !ownedShops.isEmpty()) {
            defaultShop = ownedShops.get(0);
        }

        String activeShopId = defaultShop != null ? defaultShop.getId() : "";
        String activeShopName = defaultShop != null ? defaultShop.getName() : "";

        String token = tokenProvider.generateToken(
                owner.getId(),
                owner.getPhone(),
                owner.getName(),
                activeShopId,
                owner.getRole()
        );

        List<ShopResponse> shopResponses = ownedShops.stream()
                .map(ShopResponse::fromEntity)
                .toList();

        return new OwnerLoginResponse(
                token,
                owner.getId(),
                owner.getName(),
                owner.getPhone(),
                owner.getRole(),
                activeShopId,
                activeShopName,
                shopResponses
        );
    }

    @Transactional(readOnly = true)
    public SwitchShopResponse switchShop(SwitchShopRequest request, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only the shop owner can switch shops");
        }

        if (request.getShopId() == null || request.getShopId().trim().isEmpty()) {
            throw new BadRequestException("Shop ID is required");
        }

        String targetShopId = request.getShopId().trim().toUpperCase();
        Shop shop = shopRepository.findByIdAndOwnerId(targetShopId, currentUser.getId())
                .orElseThrow(() -> new ForbiddenException("You are not authorized to access this shop: " + targetShopId));

        String newToken = tokenProvider.generateToken(
                currentUser.getId(),
                currentUser.getPhone(),
                currentUser.getName(),
                shop.getId(),
                currentUser.getRole()
        );

        return new SwitchShopResponse(
                newToken,
                currentUser.getId(),
                currentUser.getName(),
                currentUser.getPhone(),
                shop.getId(),
                shop.getName(),
                currentUser.getRole()
        );
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

    @Transactional
    public WorkerSummaryDto updateWorkerStatus(String workerId, UpdateWorkerStatusRequest request, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only the shop owner can update worker status");
        }

        User worker = userRepository.findById(workerId)
                .orElseThrow(() -> new ResourceNotFoundException("Worker not found: " + workerId));

        if (worker.getRole() != UserRole.WORKER) {
            throw new BadRequestException("Target user is not a worker");
        }

        if (!currentUser.getShopId().equals(worker.getShopId())) {
            throw new ForbiddenException("Cannot modify a worker belonging to another shop");
        }

        worker.setStatus(request.getStatus());
        User saved = userRepository.save(worker);

        return new WorkerSummaryDto(saved.getId(), saved.getName(), saved.getRole(), saved.getStatus(), saved.getShopId());
    }

    @Transactional
    public WorkerSummaryDto updateWorkerPin(String workerId, UpdateWorkerPinRequest request, UserPrincipal currentUser) {
        if (!currentUser.isOwner()) {
            throw new ForbiddenException("Only the shop owner can update worker PIN");
        }

        User worker = userRepository.findById(workerId)
                .orElseThrow(() -> new ResourceNotFoundException("Worker not found: " + workerId));

        if (worker.getRole() != UserRole.WORKER) {
            throw new BadRequestException("Target user is not a worker");
        }

        if (!currentUser.getShopId().equals(worker.getShopId())) {
            throw new ForbiddenException("Cannot modify a worker belonging to another shop");
        }

        String pinHash = passwordEncoder.encode(request.getPin().trim());
        worker.setPinHash(pinHash);
        User saved = userRepository.save(worker);

        return new WorkerSummaryDto(saved.getId(), saved.getName(), saved.getRole(), saved.getStatus(), saved.getShopId());
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
