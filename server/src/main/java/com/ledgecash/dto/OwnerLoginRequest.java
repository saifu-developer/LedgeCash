package com.ledgecash.dto;

import jakarta.validation.constraints.NotBlank;

public class OwnerLoginRequest {

    @NotBlank(message = "Phone number is required")
    private String phone;

    @NotBlank(message = "PIN is required")
    private String pin;

    public OwnerLoginRequest() {}

    public OwnerLoginRequest(String phone, String pin) {
        this.phone = phone;
        this.pin = pin;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getPin() {
        return pin;
    }

    public void setPin(String pin) {
        this.pin = pin;
    }
}
