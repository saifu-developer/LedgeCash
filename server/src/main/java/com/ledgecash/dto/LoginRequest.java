package com.ledgecash.dto;

import jakarta.validation.constraints.NotBlank;

public class LoginRequest {

    @NotBlank(message = "Shop ID is required")
    private String shopId;

    private String phone;

    private String userId;

    @NotBlank(message = "PIN is required")
    private String pin;

    public LoginRequest() {}

    public LoginRequest(String shopId, String phone, String pin) {
        this.shopId = shopId;
        this.phone = phone;
        this.pin = pin;
    }

    public LoginRequest(String shopId, String phone, String userId, String pin) {
        this.shopId = shopId;
        this.phone = phone;
        this.userId = userId;
        this.pin = pin;
    }

    public String getShopId() {
        return shopId;
    }

    public void setShopId(String shopId) {
        this.shopId = shopId;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getPin() {
        return pin;
    }

    public void setPin(String pin) {
        this.pin = pin;
    }
}

