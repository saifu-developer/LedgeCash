package com.ledgecash.controller;

import com.ledgecash.dto.CreateShopRequest;
import com.ledgecash.dto.ShopResponse;
import com.ledgecash.security.UserPrincipal;
import com.ledgecash.service.ShopService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/shops")
public class ShopController {

    private final ShopService shopService;

    public ShopController(ShopService shopService) {
        this.shopService = shopService;
    }

    @GetMapping
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<List<ShopResponse>> getOwnerShops(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<ShopResponse> shops = shopService.getOwnerShops(currentUser);
        return ResponseEntity.ok(shops);
    }

    @PostMapping
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<ShopResponse> createShop(
            @Valid @RequestBody CreateShopRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        ShopResponse response = shopService.createShop(request, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
