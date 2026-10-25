package com.ledgecash.dto;

import com.ledgecash.model.UserRole;

public class SwitchShopResponse {

    private String token;
    private String tokenType = "Bearer";
    private String userId;
    private String name;
    private String phone;
    private String shopId;
    private String shopName;
    private UserRole role;

    public SwitchShopResponse() {}

    public SwitchShopResponse(String token, String userId, String name, String phone,
                              String shopId, String shopName, UserRole role) {
        this.token = token;
        this.tokenType = "Bearer";
        this.userId = userId;
        this.name = name;
        this.phone = phone;
        this.shopId = shopId;
        this.shopName = shopName;
        this.role = role;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getTokenType() {
        return tokenType;
    }

    public void setTokenType(String tokenType) {
        this.tokenType = tokenType;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getShopId() {
        return shopId;
    }

    public void setShopId(String shopId) {
        this.shopId = shopId;
    }

    public String getShopName() {
        return shopName;
    }

    public void setShopName(String shopName) {
        this.shopName = shopName;
    }

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }
}
