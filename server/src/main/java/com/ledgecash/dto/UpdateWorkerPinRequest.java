package com.ledgecash.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class UpdateWorkerPinRequest {

    @NotBlank(message = "New PIN is required")
    @Pattern(regexp = "^\\d{4,6}$", message = "PIN must be between 4 and 6 digits")
    private String pin;

    public UpdateWorkerPinRequest() {}

    public UpdateWorkerPinRequest(String pin) {
        this.pin = pin;
    }

    public String getPin() {
        return pin;
    }

    public void setPin(String pin) {
        this.pin = pin;
    }
}
