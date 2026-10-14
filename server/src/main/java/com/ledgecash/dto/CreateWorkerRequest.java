package com.ledgecash.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class CreateWorkerRequest {

    @NotBlank(message = "Worker name is required")
    private String name;

    @NotBlank(message = "Worker phone number is required")
    private String phone;

    @NotBlank(message = "Initial PIN is required")
    @Size(min = 4, max = 6, message = "PIN must be between 4 and 6 digits")
    private String pin;

    public CreateWorkerRequest() {}

    public CreateWorkerRequest(String name, String phone, String pin) {
        this.name = name;
        this.phone = phone;
        this.pin = pin;
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

    public String getPin() {
        return pin;
    }

    public void setPin(String pin) {
        this.pin = pin;
    }
}
