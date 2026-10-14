package com.ledgecash;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgecash.dto.*;
import com.ledgecash.model.TransactionType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("dev")
public class CashManagerBackendApplicationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void contextLoads() {
        // Verifies Spring context bootstraps cleanly with H2 profile
    }

    @Test
    @DisplayName("Verify Owner Registration and JWT Issue")
    void testOwnerRegistrationAndJwt() throws Exception {
        RegisterOwnerRequest request = new RegisterOwnerRequest(
                "Anita Sharma",
                "9811100001",
                "1234",
                "Anita Kirana Store"
        );

        MvcResult result = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.shopId").isString())
                .andExpect(jsonPath("$.role").value("OWNER"))
                .andReturn();

        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertTrue(json.get("shopId").asText().startsWith("LC-"));
        assertFalse(json.get("token").asText().isBlank());
    }

    @Test
    @DisplayName("Verify Transaction Creation, Scoped Retrieval, and Multi-Tenant Isolation")
    void testShopIsolationAndTransactionFlow() throws Exception {
        // 1. Register Shop 1 (Owner 1)
        RegisterOwnerRequest owner1Req = new RegisterOwnerRequest("Shop One Owner", "9811100002", "1111", "Shop One");
        MvcResult owner1Result = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(owner1Req)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode owner1Json = objectMapper.readTree(owner1Result.getResponse().getContentAsString());
        String token1 = owner1Json.get("token").asText();
        String shopId1 = owner1Json.get("shopId").asText();

        // 2. Register Shop 2 (Owner 2)
        RegisterOwnerRequest owner2Req = new RegisterOwnerRequest("Shop Two Owner", "9811100003", "2222", "Shop Two");
        MvcResult owner2Result = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(owner2Req)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode owner2Json = objectMapper.readTree(owner2Result.getResponse().getContentAsString());
        String token2 = owner2Json.get("token").asText();
        String shopId2 = owner2Json.get("shopId").asText();
        assertNotEquals(shopId1, shopId2);

        // 3. Shop 1 Owner creates a Cash In transaction
        String tx1Id = UUID.randomUUID().toString();
        TransactionRequest txRequest = new TransactionRequest(
                tx1Id,
                TransactionType.CASH_IN,
                new BigDecimal("1500.00"),
                "Sales",
                "Morning retail sales",
                null
        );

        mockMvc.perform(post("/api/v1/transactions")
                        .header("Authorization", "Bearer " + token1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(txRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(tx1Id))
                .andExpect(jsonPath("$.shopId").value(shopId1))
                .andExpect(jsonPath("$.amount").value(1500.00));

        // 4. Shop 1 queries transactions -> should see tx1
        mockMvc.perform(get("/api/v1/transactions")
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(tx1Id));

        // 5. Shop 2 queries transactions -> should NOT see tx1 (Tenant Isolation)
        mockMvc.perform(get("/api/v1/transactions")
                        .header("Authorization", "Bearer " + token2))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty())
                .andExpect(jsonPath("$.page.totalElements").value(0));

        // 6. Shop 2 attempts to edit Shop 1's transaction -> Should be Rejected (404 Not Found)
        EditTransactionRequest editReq = new EditTransactionRequest(
                TransactionType.CASH_IN,
                new BigDecimal("2000.00"),
                "Sales",
                "Hacked amount",
                "Unauthorized edit attempt"
        );

        mockMvc.perform(put("/api/v1/transactions/" + tx1Id)
                        .header("Authorization", "Bearer " + token2)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Verify Worker Permissions and CASH_OUT Role Restrictions")
    void testWorkerRoleRestrictions() throws Exception {
        // 1. Register Owner
        RegisterOwnerRequest ownerReq = new RegisterOwnerRequest("Master Owner", "9811100004", "4444", "Master Hardware");
        MvcResult ownerRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerReq)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode ownerJson = objectMapper.readTree(ownerRes.getResponse().getContentAsString());
        String ownerToken = ownerJson.get("token").asText();
        String shopId = ownerJson.get("shopId").asText();

        // 2. Owner creates Worker
        CreateWorkerRequest workerReq = new CreateWorkerRequest("Rahul Clerk", "9811100005", "5555");
        MvcResult workerRes = mockMvc.perform(post("/api/v1/auth/create-worker")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.role").value("WORKER"))
                .andReturn();

        JsonNode workerJson = objectMapper.readTree(workerRes.getResponse().getContentAsString());
        String workerToken = workerJson.get("token").asText();

        // 3. Worker logs in to verify login endpoint
        LoginRequest loginReq = new LoginRequest(shopId, "9811100005", "5555");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("WORKER"));

        // 4. Worker logs CASH_IN -> Allowed
        TransactionRequest workerIn = new TransactionRequest(
                UUID.randomUUID().toString(),
                TransactionType.CASH_IN,
                new BigDecimal("250.00"),
                "Supplies",
                "Customer purchase",
                null
        );
        mockMvc.perform(post("/api/v1/transactions")
                        .header("Authorization", "Bearer " + workerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerIn)))
                .andExpect(status().isCreated());

        // 5. Worker attempts CASH_OUT -> Forbidden (403)
        TransactionRequest workerOut = new TransactionRequest(
                UUID.randomUUID().toString(),
                TransactionType.CASH_OUT,
                new BigDecimal("500.00"),
                "Expense",
                "Unauthorized withdrawal",
                null
        );
        mockMvc.perform(post("/api/v1/transactions")
                        .header("Authorization", "Bearer " + workerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerOut)))
                .andExpect(status().isForbidden());

        // 6. Worker attempts PUT (edit) -> Forbidden by SecurityFilterChain (403)
        EditTransactionRequest editReq = new EditTransactionRequest(
                TransactionType.CASH_IN,
                new BigDecimal("300.00"),
                "Supplies",
                "Edited",
                "Worker edit attempt"
        );
        mockMvc.perform(put("/api/v1/transactions/" + workerIn.getId())
                        .header("Authorization", "Bearer " + workerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editReq)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Verify Batch Sync Reconciliation for Offline Mobile Client")
    void testBatchSyncReconciliation() throws Exception {
        // Register Owner
        RegisterOwnerRequest ownerReq = new RegisterOwnerRequest("Sync Owner", "9811100006", "6666", "Sync Mart");
        MvcResult ownerRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerReq)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode ownerJson = objectMapper.readTree(ownerRes.getResponse().getContentAsString());
        String token = ownerJson.get("token").asText();

        // Prepare offline batch of 2 transactions
        String txAId = UUID.randomUUID().toString();
        String txBId = UUID.randomUUID().toString();

        SyncTransactionItem itemA = new SyncTransactionItem();
        itemA.setId(txAId);
        itemA.setType(TransactionType.CASH_IN);
        itemA.setAmount(new BigDecimal("1200.00"));
        itemA.setCategory("Retail");
        itemA.setDescription("Offline payment A");

        SyncTransactionItem itemB = new SyncTransactionItem();
        itemB.setId(txBId);
        itemB.setType(TransactionType.UPI_IN);
        itemB.setAmount(new BigDecimal("850.50"));
        itemB.setCategory("Online");
        itemB.setDescription("Offline QR scan B");

        SyncBatchRequest syncReq = new SyncBatchRequest(null, java.util.List.of(itemA, itemB));

        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.syncedCount").value(2))
                .andExpect(jsonPath("$.serverChanges.length()").value(2))
                .andExpect(jsonPath("$.syncTimestamp").isString());
    }
}
