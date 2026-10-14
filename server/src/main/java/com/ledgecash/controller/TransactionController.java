package com.ledgecash.controller;

import com.ledgecash.dto.EditTransactionRequest;
import com.ledgecash.dto.TransactionRequest;
import com.ledgecash.dto.TransactionResponse;
import com.ledgecash.security.UserPrincipal;
import com.ledgecash.service.TransactionService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private final TransactionService transactionService;

    public TransactionController(TransactionService transactionService) {
        this.transactionService = transactionService;
    }

    @GetMapping
    public ResponseEntity<Page<TransactionResponse>> getTransactions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {

        Page<TransactionResponse> page = transactionService.getTransactions(currentUser, from, to, pageable);
        return ResponseEntity.ok(page);
    }

    @PostMapping
    public ResponseEntity<TransactionResponse> createTransaction(
            @Valid @RequestBody TransactionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {

        TransactionResponse response = transactionService.createTransaction(request, currentUser);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<TransactionResponse> editTransaction(
            @PathVariable String id,
            @Valid @RequestBody EditTransactionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {

        TransactionResponse response = transactionService.editTransaction(id, request, currentUser);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<Void> deleteTransaction(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "Deleted by owner") String reason,
            @AuthenticationPrincipal UserPrincipal currentUser) {

        transactionService.deleteTransaction(id, reason, currentUser);
        return ResponseEntity.noContent().build();
    }
}
