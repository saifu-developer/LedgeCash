package com.ledgecash.dto;

import java.util.List;

public class ShopWorkersResponse {

    private String shopId;
    private String shopName;
    private String ownerId;
    private List<WorkerSummaryDto> workers;

    public ShopWorkersResponse() {}

    public ShopWorkersResponse(String shopId, String shopName, String ownerId, List<WorkerSummaryDto> workers) {
        this.shopId = shopId;
        this.shopName = shopName;
        this.ownerId = ownerId;
        this.workers = workers;
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

    public String getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(String ownerId) {
        this.ownerId = ownerId;
    }

    public List<WorkerSummaryDto> getWorkers() {
        return workers;
    }

    public void setWorkers(List<WorkerSummaryDto> workers) {
        this.workers = workers;
    }
}
