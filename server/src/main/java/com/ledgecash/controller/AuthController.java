package com.ledgecash.controller;

import com.ledgecash.dto.AuthResponse;
import com.ledgecash.dto.CreateWorkerRequest;
import com.ledgecash.dto.LoginRequest;
import com.ledgecash.dto.OwnerLoginRequest;
import com.ledgecash.dto.OwnerLoginResponse;
import com.ledgecash.dto.RegisterOwnerRequest;
import com.ledgecash.dto.ShopWorkersResponse;
import com.ledgecash.dto.SwitchShopRequest;
import com.ledgecash.dto.SwitchShopResponse;
import com.ledgecash.dto.UpdateWorkerPinRequest;
import com.ledgecash.dto.UpdateWorkerStatusRequest;
import com.ledgecash.dto.WorkerSummaryDto;
import com.ledgecash.security.UserPrincipal;
import com.ledgecash.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/shop/{shopCode}/workers")
    public ResponseEntity<ShopWorkersResponse> getShopWorkers(@PathVariable String shopCode) {
        ShopWorkersResponse response = authService.getShopWorkers(shopCode);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/register-owner")
    public ResponseEntity<AuthResponse> registerOwner(@Valid @RequestBody RegisterOwnerRequest request) {
        AuthResponse response = authService.registerOwner(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/owner-login")
    public ResponseEntity<OwnerLoginResponse> ownerLogin(@Valid @RequestBody OwnerLoginRequest request) {
        OwnerLoginResponse response = authService.ownerLogin(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/switch-shop")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<SwitchShopResponse> switchShop(
            @Valid @RequestBody SwitchShopRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        SwitchShopResponse response = authService.switchShop(request, currentUser);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/create-worker")
    public ResponseEntity<AuthResponse> createWorker(
            @Valid @RequestBody CreateWorkerRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        AuthResponse response = authService.createWorker(request, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PatchMapping("/workers/{workerId}/status")
    public ResponseEntity<WorkerSummaryDto> updateWorkerStatus(
            @PathVariable String workerId,
            @Valid @RequestBody UpdateWorkerStatusRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        WorkerSummaryDto response = authService.updateWorkerStatus(workerId, request, currentUser);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/workers/{workerId}/pin")
    public ResponseEntity<WorkerSummaryDto> updateWorkerPin(
            @PathVariable String workerId,
            @Valid @RequestBody UpdateWorkerPinRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        WorkerSummaryDto response = authService.updateWorkerPin(workerId, request, currentUser);
        return ResponseEntity.ok(response);
    }
}

