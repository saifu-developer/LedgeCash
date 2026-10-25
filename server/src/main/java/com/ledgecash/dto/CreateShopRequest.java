package com.ledgecash.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateShopRequest {

    @NotBlank(message = "Shop name is required")
    @Size(max = 255, message = "Shop name must not exceed 255 characters")
    private String name;

    public CreateShopRequest() {}

    public CreateShopRequest(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
