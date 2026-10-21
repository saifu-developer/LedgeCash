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
import java.time.Instant;
import java.util.List;
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

    @Autowired
    private com.ledgecash.repository.UserRepository userRepository;

    @Autowired
    private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

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

    @Test
    @DisplayName("Verify Cloud-based Worker Discovery, PIN Login, and Shop Isolation")
    void testWorkerCloudDiscoveryAndLoginFlow() throws Exception {
        // 1. Owner registers a shop
        RegisterOwnerRequest ownerReq = new RegisterOwnerRequest("Discovery Owner", "9811100007", "7777", "Discovery Store");
        MvcResult ownerRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerReq)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode ownerJson = objectMapper.readTree(ownerRes.getResponse().getContentAsString());
        String ownerToken = ownerJson.get("token").asText();
        String shopId1 = ownerJson.get("shopId").asText();

        // 2. Owner adds a worker
        CreateWorkerRequest workerReq = new CreateWorkerRequest("Deepak Cashier", "9811100008", "8888");
        MvcResult workerRes = mockMvc.perform(post("/api/v1/auth/create-worker")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerReq)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode workerJson = objectMapper.readTree(workerRes.getResponse().getContentAsString());
        String workerId = workerJson.get("userId").asText();

        // 3. Unauthenticated Device B discovers workers by shop code
        MvcResult discoveryRes = mockMvc.perform(get("/api/v1/auth/shop/" + shopId1 + "/workers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shopId").value(shopId1))
                .andExpect(jsonPath("$.shopName").value("Discovery Store"))
                .andExpect(jsonPath("$.workers[0].id").value(workerId))
                .andExpect(jsonPath("$.workers[0].name").value("Deepak Cashier"))
                .andExpect(jsonPath("$.workers[0].role").value("WORKER"))
                .andExpect(jsonPath("$.workers[0].pin").doesNotExist())
                .andExpect(jsonPath("$.workers[0].pinHash").doesNotExist())
                .andReturn();

        // 4. Non-existent shop code returns 404
        mockMvc.perform(get("/api/v1/auth/shop/LC-999999/workers"))
                .andExpect(status().isNotFound());

        // 5. Worker logs in on Device B using userId + shopId + PIN
        LoginRequest validLogin = new LoginRequest(shopId1, null, workerId, "8888");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validLogin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.userId").value(workerId))
                .andExpect(jsonPath("$.shopId").value(shopId1))
                .andExpect(jsonPath("$.role").value("WORKER"));

        // 6. Worker fails with invalid PIN
        LoginRequest invalidPinLogin = new LoginRequest(shopId1, null, workerId, "9999");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidPinLogin)))
                .andExpect(status().isBadRequest());

        // 7. Security: Worker cannot authenticate into another shop (Shop Isolation)
        RegisterOwnerRequest owner2Req = new RegisterOwnerRequest("Other Owner", "9811100009", "1212", "Other Store");
        MvcResult owner2Res = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(owner2Req)))
                .andExpect(status().isCreated())
                .andReturn();
        String shopId2 = objectMapper.readTree(owner2Res.getResponse().getContentAsString()).get("shopId").asText();

        // Worker from Shop 1 attempting to authenticate into Shop 2
        LoginRequest crossShopLogin = new LoginRequest(shopId2, null, workerId, "8888");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(crossShopLogin)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Verify Full Multi-Device Transaction Synchronization (Scenarios 1-8)")
    void testMultiDeviceTransactionSynchronizationFlow() throws Exception {
        // --- Setup Shop A & Device A (Owner A) ---
        RegisterOwnerRequest ownerAReq = new RegisterOwnerRequest("Owner Device A", "9811100010", "1010", "Store Alpha");
        MvcResult ownerARes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerAReq)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode ownerAJson = objectMapper.readTree(ownerARes.getResponse().getContentAsString());
        String tokenA = ownerAJson.get("token").asText();
        String shopIdA = ownerAJson.get("shopId").asText();

        // --- Setup Device B (Worker in Shop A) ---
        CreateWorkerRequest workerReq = new CreateWorkerRequest("Worker Device B", "9811100011", "1111");
        mockMvc.perform(post("/api/v1/auth/create-worker")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerReq)))
                .andExpect(status().isCreated());

        LoginRequest workerLogin = new LoginRequest(shopIdA, "9811100011", "1111");
        MvcResult workerLoginRes = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerLogin)))
                .andExpect(status().isOk())
                .andReturn();
        String tokenB = objectMapper.readTree(workerLoginRes.getResponse().getContentAsString()).get("token").asText();

        // --- Setup Shop B (Tenant Isolation verification) ---
        RegisterOwnerRequest ownerBReq = new RegisterOwnerRequest("Owner Shop B", "9811100012", "1212", "Store Beta");
        MvcResult ownerBRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerBReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String tokenShopB = objectMapper.readTree(ownerBRes.getResponse().getContentAsString()).get("token").asText();

        // 1. Scenario 1: Device A creates transaction -> sync -> server
        String tx1Id = "txn-device-a-" + UUID.randomUUID();
        SyncTransactionItem itemTx1 = new SyncTransactionItem();
        itemTx1.setId(tx1Id);
        itemTx1.setType(TransactionType.CASH_IN);
        itemTx1.setAmount(new BigDecimal("1500.00"));
        itemTx1.setCategory("Sales");
        itemTx1.setDescription("Morning sales on Device A");
        itemTx1.setCreatedAt(Instant.now());
        itemTx1.setUpdatedAt(Instant.now());

        SyncBatchRequest syncReqA1 = new SyncBatchRequest(null, List.of(itemTx1));
        MvcResult syncResA1 = mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReqA1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.syncedCount").value(1))
                .andExpect(jsonPath("$.serverChanges[0].id").value(tx1Id))
                .andExpect(jsonPath("$.serverChanges[0].amount").value(1500.00))
                .andReturn();
        JsonNode syncJsonA1 = objectMapper.readTree(syncResA1.getResponse().getContentAsString());
        String deviceASyncTime1 = syncJsonA1.get("syncTimestamp").asText();

        // 2. Scenario 2: Device B syncs -> receives transaction from Device A
        SyncBatchRequest syncReqB1 = new SyncBatchRequest(null, List.of());
        MvcResult syncResB1 = mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReqB1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverChanges[0].id").value(tx1Id))
                .andExpect(jsonPath("$.serverChanges[0].amount").value(1500.00))
                .andExpect(jsonPath("$.serverChanges[0].type").value("CASH_IN"))
                .andReturn();
        String deviceBSyncTime1 = objectMapper.readTree(syncResB1.getResponse().getContentAsString()).get("syncTimestamp").asText();

        // 3. Scenario 3: Device B creates transaction -> sync -> Device A receives it
        String tx2Id = "txn-device-b-" + UUID.randomUUID();
        SyncTransactionItem itemTx2 = new SyncTransactionItem();
        itemTx2.setId(tx2Id);
        itemTx2.setType(TransactionType.UPI_IN);
        itemTx2.setAmount(new BigDecimal("450.00"));
        itemTx2.setDescription("UPI payment on Device B");
        itemTx2.setCreatedAt(Instant.now());
        itemTx2.setUpdatedAt(Instant.now());

        SyncBatchRequest syncReqB2 = new SyncBatchRequest(Instant.parse(deviceBSyncTime1), List.of(itemTx2));
        MvcResult syncResB2 = mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReqB2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.syncedCount").value(1))
                .andReturn();
        String deviceBSyncTime2 = objectMapper.readTree(syncResB2.getResponse().getContentAsString()).get("syncTimestamp").asText();

        // Device A syncs and receives tx2
        SyncBatchRequest syncReqA2 = new SyncBatchRequest(Instant.parse(deviceASyncTime1), List.of());
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReqA2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverChanges[0].id").value(tx2Id))
                .andExpect(jsonPath("$.serverChanges[0].amount").value(450.00));

        // 4. Scenario 4: Same transaction synced repeatedly -> no duplicates
        SyncBatchRequest duplicateSyncReq = new SyncBatchRequest(Instant.parse(deviceASyncTime1), List.of(itemTx1));
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(duplicateSyncReq)))
                .andExpect(status().isOk());

        // Verify total active transactions in Shop A is exactly 2
        mockMvc.perform(get("/api/v1/transactions")
                        .header("Authorization", "Bearer " + tokenA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.totalElements").value(2));

        // 5. Scenario 6: Edit transaction on Device A -> Device B receives update
        itemTx1.setAmount(new BigDecimal("2500.00"));
        itemTx1.setUpdatedAt(Instant.now());

        SyncBatchRequest editSyncReq = new SyncBatchRequest(null, List.of(itemTx1));
        MvcResult editSyncRes = mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(editSyncReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.syncedCount").value(1))
                .andReturn();
        String deviceASyncTime3 = objectMapper.readTree(editSyncRes.getResponse().getContentAsString()).get("syncTimestamp").asText();

        // Device B syncs since deviceBSyncTime2 -> receives updated amount (2500.00)
        SyncBatchRequest syncReqB3 = new SyncBatchRequest(Instant.parse(deviceBSyncTime2), List.of());
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReqB3)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverChanges[0].id").value(tx1Id))
                .andExpect(jsonPath("$.serverChanges[0].amount").value(2500.00));

        // 6. Scenario 7: Delete transaction on Device A -> Device B receives deletion
        itemTx2.setDeleted(true);
        itemTx2.setUpdatedAt(Instant.now());

        SyncBatchRequest deleteSyncReq = new SyncBatchRequest(null, List.of(itemTx2));
        MvcResult deleteSyncRes = mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(deleteSyncReq)))
                .andExpect(status().isOk())
                .andReturn();
        String deviceASyncTime4 = objectMapper.readTree(deleteSyncRes.getResponse().getContentAsString()).get("syncTimestamp").asText();

        // Device B receives deletion indication (deleted == true)
        SyncBatchRequest syncReqB4 = new SyncBatchRequest(Instant.parse(deviceASyncTime3), List.of());
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(syncReqB4)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverChanges[0].id").value(tx2Id))
                .andExpect(jsonPath("$.serverChanges[0].deleted").value(true));

        // 7. Scenario 8: Shop A cannot access Shop B transactions (Tenant Isolation)
        // Shop B syncs -> must NOT see Shop A transactions
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenShopB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new SyncBatchRequest(null, List.of()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serverChanges").isEmpty());

        // Shop B attempts to hijack Shop A's transaction id -> 403 Forbidden
        SyncTransactionItem hijackedItem = new SyncTransactionItem();
        hijackedItem.setId(tx1Id);
        hijackedItem.setType(TransactionType.CASH_IN);
        hijackedItem.setAmount(new BigDecimal("9999.00"));
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenShopB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new SyncBatchRequest(null, List.of(hijackedItem)))))
                .andExpect(status().isForbidden());

        // 8. Role Enforcement: Worker cannot delete transactions via sync
        SyncTransactionItem workerIllegalDelete = new SyncTransactionItem();
        workerIllegalDelete.setId(tx1Id);
        workerIllegalDelete.setType(TransactionType.CASH_IN);
        workerIllegalDelete.setAmount(new BigDecimal("2500.00"));
        workerIllegalDelete.setDeleted(true);
        mockMvc.perform(post("/api/v1/sync/batch")
                        .header("Authorization", "Bearer " + tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new SyncBatchRequest(null, List.of(workerIllegalDelete)))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Verify Worker Creation Returns Server UserId and Direct Login by UserId Works While Mismatched ID Is Rejected")
    void testWorkerIdConsistencyAndAuthentication() throws Exception {
        // 1. Register Owner for Shop A
        RegisterOwnerRequest ownerReq = new RegisterOwnerRequest("WorkerId Owner", "9811100091", "1234", "WorkerId Store");
        MvcResult ownerRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerReq)))
                .andExpect(status().isCreated())
                .andReturn();

        JsonNode ownerJson = objectMapper.readTree(ownerRes.getResponse().getContentAsString());
        String ownerToken = ownerJson.get("token").asText();
        String shopIdA = ownerJson.get("shopId").asText();

        // 2. Owner creates worker
        CreateWorkerRequest workerReq = new CreateWorkerRequest("Sita Staff", "9811100092", "4321");
        MvcResult workerRes = mockMvc.perform(post("/api/v1/auth/create-worker")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").isString())
                .andExpect(jsonPath("$.role").value("WORKER"))
                .andExpect(jsonPath("$.shopId").value(shopIdA))
                .andReturn();

        JsonNode workerJson = objectMapper.readTree(workerRes.getResponse().getContentAsString());
        String serverWorkerUserId = workerJson.get("userId").asText();
        org.junit.jupiter.api.Assertions.assertFalse(serverWorkerUserId.startsWith("worker-"),
                "Server generated worker userId should be a UUID, not a local worker-* ID");

        // 3. Worker authenticates successfully using the exact server-generated userId (without phone)
        LoginRequest validLoginWithUserId = new LoginRequest(shopIdA, null, serverWorkerUserId, "4321");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validLoginWithUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(serverWorkerUserId))
                .andExpect(jsonPath("$.shopId").value(shopIdA))
                .andExpect(jsonPath("$.role").value("WORKER"));

        // 4. Client attempting to log in using a mismatched/local ID (e.g. worker-174000...) is rejected
        String mismatchedLocalId = "worker-" + System.currentTimeMillis() + "-abc123";
        LoginRequest mismatchedLogin = new LoginRequest(shopIdA, null, mismatchedLocalId, "4321");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(mismatchedLogin)))
                .andExpect(status().isBadRequest());

        // 5. Register Shop B to verify shop isolation with the valid serverWorkerUserId
        RegisterOwnerRequest ownerBReq = new RegisterOwnerRequest("Other Owner 93", "9811100093", "5678", "Other Store 93");
        MvcResult ownerBRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerBReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String shopIdB = objectMapper.readTree(ownerBRes.getResponse().getContentAsString()).get("shopId").asText();

        // 6. Worker attempting to authenticate into Shop B using their valid serverWorkerUserId is rejected (Shop Isolation)
        LoginRequest crossShopLogin = new LoginRequest(shopIdB, null, serverWorkerUserId, "4321");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(crossShopLogin)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Verify Cloud-Backed Worker Status Management: Owner Activation/Deactivation, Role Checks, Cross-Shop Protection, and Deactivated Worker Block")
    void testWorkerStatusManagementAndSecurity() throws Exception {
        // 1. Owner A registers Shop A
        RegisterOwnerRequest ownerReq = new RegisterOwnerRequest("Status Owner", "9811100111", "1234", "Status Shop A");
        MvcResult ownerRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerReq)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode ownerJson = objectMapper.readTree(ownerRes.getResponse().getContentAsString());
        String ownerToken = ownerJson.get("token").asText();
        String shopIdA = ownerJson.get("shopId").asText();

        // 2. Owner A creates Worker W1 in Shop A
        CreateWorkerRequest workerReq = new CreateWorkerRequest("Raju Worker", "9811100112", "1111");
        MvcResult workerRes = mockMvc.perform(post("/api/v1/auth/create-worker")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerReq)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode workerJson = objectMapper.readTree(workerRes.getResponse().getContentAsString());
        String workerId = workerJson.get("userId").asText();
        String workerToken = workerJson.get("token").asText();

        // 3. Worker cannot change status (403 Forbidden)
        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/status")
                        .header("Authorization", "Bearer " + workerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerStatusRequest(com.ledgecash.model.UserStatus.INACTIVE))))
                .andExpect(status().isForbidden());

        // 4. Owner B from another shop cannot change Worker W1's status (403 Forbidden)
        RegisterOwnerRequest ownerBReq = new RegisterOwnerRequest("Status Owner B", "9811100113", "5678", "Status Shop B");
        MvcResult ownerBRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerBReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String ownerBToken = objectMapper.readTree(ownerBRes.getResponse().getContentAsString()).get("token").asText();

        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/status")
                        .header("Authorization", "Bearer " + ownerBToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerStatusRequest(com.ledgecash.model.UserStatus.INACTIVE))))
                .andExpect(status().isForbidden());

        // 5. Owner A deactivates own-shop Worker W1 (200 OK)
        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/status")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerStatusRequest(com.ledgecash.model.UserStatus.INACTIVE))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(workerId))
                .andExpect(jsonPath("$.status").value("INACTIVE"))
                .andExpect(jsonPath("$.pin").doesNotExist())
                .andExpect(jsonPath("$.pinHash").doesNotExist());

        // 6. Deactivated Worker W1 cannot authenticate (403 Forbidden)
        LoginRequest loginAttempt = new LoginRequest(shopIdA, null, workerId, "1111");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginAttempt)))
                .andExpect(status().isForbidden());

        // 7. Deactivated worker is excluded from shop worker discovery
        mockMvc.perform(get("/api/v1/auth/shop/" + shopIdA + "/workers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workers").isArray())
                .andExpect(jsonPath("$.workers.length()").value(0));

        // 8. Owner A reactivates Worker W1 (200 OK)
        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/status")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerStatusRequest(com.ledgecash.model.UserStatus.ACTIVE))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(workerId))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // 9. Reactivated worker can now authenticate again (200 OK)
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginAttempt)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(workerId));
    }

    @Test
    @DisplayName("Verify Cloud-Backed Worker PIN Management: Owner Modification, BCrypt Security, Old PIN Invalidation, and New PIN Authentication")
    void testWorkerPinManagementAndSecurity() throws Exception {
        // 1. Owner A registers Shop A
        RegisterOwnerRequest ownerReq = new RegisterOwnerRequest("Pin Owner", "9811100221", "1234", "Pin Shop A");
        MvcResult ownerRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerReq)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode ownerJson = objectMapper.readTree(ownerRes.getResponse().getContentAsString());
        String ownerToken = ownerJson.get("token").asText();
        String shopIdA = ownerJson.get("shopId").asText();

        // 2. Owner A creates Worker W1 with PIN 2222
        CreateWorkerRequest workerReq = new CreateWorkerRequest("Gopal Worker", "9811100222", "2222");
        MvcResult workerRes = mockMvc.perform(post("/api/v1/auth/create-worker")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(workerReq)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode workerJson = objectMapper.readTree(workerRes.getResponse().getContentAsString());
        String workerId = workerJson.get("userId").asText();
        String workerToken = workerJson.get("token").asText();

        // 3. Worker cannot change PIN via owner endpoint (403 Forbidden)
        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/pin")
                        .header("Authorization", "Bearer " + workerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerPinRequest("9876"))))
                .andExpect(status().isForbidden());

        // 4. Cross-shop owner cannot change worker PIN (403 Forbidden)
        RegisterOwnerRequest ownerBReq = new RegisterOwnerRequest("Pin Owner B", "9811100223", "5678", "Pin Shop B");
        MvcResult ownerBRes = mockMvc.perform(post("/api/v1/auth/register-owner")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(ownerBReq)))
                .andExpect(status().isCreated())
                .andReturn();
        String ownerBToken = objectMapper.readTree(ownerBRes.getResponse().getContentAsString()).get("token").asText();

        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/pin")
                        .header("Authorization", "Bearer " + ownerBToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerPinRequest("9876"))))
                .andExpect(status().isForbidden());

        // 5. Owner A changes Worker W1's PIN to 9876 (200 OK)
        mockMvc.perform(patch("/api/v1/auth/workers/" + workerId + "/pin")
                        .header("Authorization", "Bearer " + ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateWorkerPinRequest("9876"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(workerId))
                .andExpect(jsonPath("$.name").value("Gopal Worker"))
                .andExpect(jsonPath("$.pin").doesNotExist())
                .andExpect(jsonPath("$.pinHash").doesNotExist());

        // 6. Old PIN fails after change (400 Bad Request)
        LoginRequest oldPinLogin = new LoginRequest(shopIdA, null, workerId, "2222");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(oldPinLogin)))
                .andExpect(status().isBadRequest());

        // 7. New PIN succeeds (200 OK)
        LoginRequest newPinLogin = new LoginRequest(shopIdA, null, workerId, "9876");
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newPinLogin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(workerId));

        // 8. Verify PIN remains BCrypt-hashed in database and not plaintext
        com.ledgecash.model.User savedWorker = userRepository.findById(workerId).orElseThrow();
        assertNotEquals("9876", savedWorker.getPinHash(), "PIN must not be stored in plaintext");
        assertTrue(savedWorker.getPinHash().startsWith("$2a$") || savedWorker.getPinHash().startsWith("$2b$"),
                "PIN hash must be a valid BCrypt hash");
        assertTrue(passwordEncoder.matches("9876", savedWorker.getPinHash()),
                "BCrypt password encoder must match the new PIN");
        assertFalse(passwordEncoder.matches("2222", savedWorker.getPinHash()),
                "Old PIN must not match the new BCrypt hash");
    }
}


