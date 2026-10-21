package com.ledgecash.dto;

import com.ledgecash.model.UserStatus;
import jakarta.validation.constraints.NotNull;

public class UpdateWorkerStatusRequest {

    @NotNull(message = "Worker status is required")
    private UserStatus status;

    public UpdateWorkerStatusRequest() {}

    public UpdateWorkerStatusRequest(UserStatus status) {
        this.status = status;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }
}
