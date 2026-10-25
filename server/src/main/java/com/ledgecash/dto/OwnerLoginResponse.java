package com.ledgecash.dto;

import com.ledgecash.model.UserRole;

import java.util.ArrayList;
import java.util.List;

public class OwnerLoginResponse {

    private String token;
    private String tokenType = "Bearer";
    private String userId;
    private String name;
    private String phone;
    private UserRole role;
    private String activeShopId;
    private String activeShopName;
    private List<ShopResponse> shops = new ArrayList<>();

    public OwnerLoginResponse() {}

    public OwnerLoginResponse(String token, String userId, String name, String phone,
                              UserRole role, String activeShopId, String activeShopName,
                              List<ShopResponse> shops) {
        this.token = token;
        this.tokenType = "Bearer";
        this.userId = userId;
        this.name = name;
        this.phone = phone;
        this.role = role;
        this.activeShopId = activeShopId;
        this.activeShopName = activeShopName;
        this.shops = shops != null ? shops : new ArrayList<>();
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

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }

    public String getActiveShopId() {
        return activeShopId;
    }

    public void setActiveShopId(String activeShopId) {
        this.activeShopId = activeShopId;
    }

    public String getActiveShopName() {
        return activeShopName;
    }

    public void setActiveShopName(String activeShopName) {
        this.activeShopName = activeShopName;
    }

    public List<ShopResponse> getShops() {
        return shops;
    }

    public void setShops(List<ShopResponse> shops) {
        this.shops = shops;
    }
}
