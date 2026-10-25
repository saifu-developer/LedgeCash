package com.ledgecash.dto;

import jakarta.validation.constraints.NotBlank;

public class SwitchShopRequest {

    @NotBlank(message = "Shop ID is required")
    private String shopId;

    public SwitchShopRequest() {}

    public SwitchShopRequest(String shopId) {
        this.shopId = shopId;
    }

    public String getShopId() {
        return shopId;
    }

    public void setShopId(String shopId) {
        this.shopId = shopId;
    }
}
