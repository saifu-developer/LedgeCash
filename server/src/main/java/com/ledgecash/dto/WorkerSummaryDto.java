package com.ledgecash.dto;

import com.ledgecash.model.UserRole;
import com.ledgecash.model.UserStatus;

public class WorkerSummaryDto {

    private String id;
    private String name;
    private UserRole role;
    private UserStatus status;
    private String shopId;

    public WorkerSummaryDto() {}

    public WorkerSummaryDto(String id, String name, UserRole role, UserStatus status, String shopId) {
        this.id = id;
        this.name = name;
        this.role = role;
        this.status = status;
        this.shopId = shopId;
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

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }

    public UserStatus getStatus() {
        return status;
    }

    public void setStatus(UserStatus status) {
        this.status = status;
    }

    public String getShopId() {
        return shopId;
    }

    public void setShopId(String shopId) {
        this.shopId = shopId;
    }
}
