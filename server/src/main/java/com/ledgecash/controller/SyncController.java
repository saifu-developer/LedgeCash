package com.ledgecash.controller;

import com.ledgecash.dto.SyncBatchRequest;
import com.ledgecash.dto.SyncBatchResponse;
import com.ledgecash.security.UserPrincipal;
import com.ledgecash.service.SyncService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {

    private final SyncService syncService;

    public SyncController(SyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping("/batch")
    public ResponseEntity<SyncBatchResponse> syncBatch(
            @RequestBody SyncBatchRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {

        SyncBatchResponse response = syncService.processBatchSync(request, currentUser);
        return ResponseEntity.ok(response);
    }
}
