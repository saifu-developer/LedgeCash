package com.ledgecash.dto;

import com.ledgecash.model.Shop;

import java.time.Instant;

public class ShopResponse {

    private String id;
    private String name;
    private String ownerId;
    private Instant createdAt;

    public ShopResponse() {}

    public ShopResponse(String id, String name, String ownerId, Instant createdAt) {
        this.id = id;
        this.name = name;
        this.ownerId = ownerId;
        this.createdAt = createdAt;
    }

    public static ShopResponse fromEntity(Shop shop) {
        if (shop == null) {
            return null;
        }
        return new ShopResponse(shop.getId(), shop.getName(), shop.getOwnerId(), shop.getCreatedAt());
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(String ownerId) {
        this.ownerId = ownerId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
