package com.ledgecash.controller;

import com.ledgecash.dto.AuthResponse;
import com.ledgecash.dto.CreateWorkerRequest;
import com.ledgecash.dto.LoginRequest;
import com.ledgecash.dto.RegisterOwnerRequest;
import com.ledgecash.dto.ShopWorkersResponse;
import com.ledgecash.security.UserPrincipal;
import com.ledgecash.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    @PostMapping("/create-worker")
    public ResponseEntity<AuthResponse> createWorker(
            @Valid @RequestBody CreateWorkerRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        AuthResponse response = authService.createWorker(request, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}

