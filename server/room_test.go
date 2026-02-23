package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// ============================================================================
// Lens 1: Deletion Immunity - These tests verify room functions actually work
// Lens 2: Assumption Audit - Tests verify assumptions about room behavior
// Lens 3: Edge Case Flood - Tests empty rooms, many participants, edge IDs
// Lens 4: Death by a Thousand Users - Concurrency tests for race conditions
// ============================================================================

// upgrader for test WebSocket connections
var testUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// createTestWebSocket creates a test WebSocket connection
func createTestWebSocket(t *testing.T) (*websocket.Conn, *httptest.Server) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := testUpgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("WebSocket upgrade error: %v", err)
			return
		}
		// Keep connection open
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}))

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to create WebSocket connection: %v", err)
	}

	return conn, server
}

// ============================================================================
// Room Tests
// ============================================================================

func TestNewRoom(t *testing.T) {
	room := NewRoom("test-room-123")

	if room == nil {
		t.Fatal("NewRoom should not return nil")
	}
	if room.ID != "test-room-123" {
		t.Errorf("Expected room ID 'test-room-123', got %s", room.ID)
	}
	if room.Participants == nil {
		t.Error("Participants map should be initialized")
	}
	if len(room.Participants) != 0 {
		t.Error("New room should have no participants")
	}
}

func TestRoom_AddParticipant(t *testing.T) {
	room := NewRoom("test-room")
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	p := &Participant{
		ID:   "participant-1",
		Conn: conn,
	}

	room.AddParticipant(p)

	if len(room.Participants) != 1 {
		t.Errorf("Expected 1 participant, got %d", len(room.Participants))
	}

	if room.Participants["participant-1"] != p {
		t.Error("Participant should be in the map")
	}
}

func TestRoom_AddParticipant_UpdatesLastActivity(t *testing.T) {
	room := NewRoom("test-room")
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	originalTime := room.LastActivity
	time.Sleep(time.Millisecond * 10) // Ensure time difference

	p := &Participant{ID: "p1", Conn: conn}
	room.AddParticipant(p)

	if !room.LastActivity.After(originalTime) {
		t.Error("LastActivity should be updated when adding participant")
	}
}

func TestRoom_RemoveParticipant(t *testing.T) {
	room := NewRoom("test-room")
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	p := &Participant{ID: "p1", Conn: conn}
	room.AddParticipant(p)

	room.RemoveParticipant("p1")

	if len(room.Participants) != 0 {
		t.Errorf("Expected 0 participants after removal, got %d", len(room.Participants))
	}
}

func TestRoom_RemoveParticipant_NonExistent(t *testing.T) {
	room := NewRoom("test-room")

	// Should not panic when removing non-existent participant
	room.RemoveParticipant("nonexistent")

	if len(room.Participants) != 0 {
		t.Error("Removing non-existent participant should have no effect")
	}
}

func TestRoom_GetParticipant(t *testing.T) {
	room := NewRoom("test-room")
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	p := &Participant{ID: "p1", Conn: conn}
	room.AddParticipant(p)

	got, ok := room.GetParticipant("p1")
	if !ok {
		t.Error("GetParticipant should return ok=true for existing participant")
	}
	if got != p {
		t.Error("GetParticipant should return the correct participant")
	}
}

func TestRoom_GetParticipant_NotFound(t *testing.T) {
	room := NewRoom("test-room")

	_, ok := room.GetParticipant("nonexistent")
	if ok {
		t.Error("GetParticipant should return ok=false for non-existent participant")
	}
}

func TestRoom_GetOtherParticipants(t *testing.T) {
	room := NewRoom("test-room")
	conn1, server1 := createTestWebSocket(t)
	defer server1.Close()
	defer conn1.Close()
	conn2, server2 := createTestWebSocket(t)
	defer server2.Close()
	defer conn2.Close()
	conn3, server3 := createTestWebSocket(t)
	defer server3.Close()
	defer conn3.Close()

	room.AddParticipant(&Participant{ID: "p1", Conn: conn1})
	room.AddParticipant(&Participant{ID: "p2", Conn: conn2})
	room.AddParticipant(&Participant{ID: "p3", Conn: conn3})

	others := room.GetOtherParticipants("p1")

	if len(others) != 2 {
		t.Errorf("Expected 2 other participants, got %d", len(others))
	}

	for _, p := range others {
		if p.ID == "p1" {
			t.Error("GetOtherParticipants should exclude the specified participant")
		}
	}
}

func TestRoom_GetOtherParticipants_AllExcluded(t *testing.T) {
	room := NewRoom("test-room")
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	room.AddParticipant(&Participant{ID: "only", Conn: conn})

	others := room.GetOtherParticipants("only")

	if len(others) != 0 {
		t.Errorf("Expected 0 other participants, got %d", len(others))
	}
}

func TestRoom_IsEmpty(t *testing.T) {
	room := NewRoom("test-room")

	if !room.IsEmpty() {
		t.Error("New room should be empty")
	}

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	room.AddParticipant(&Participant{ID: "p1", Conn: conn})

	if room.IsEmpty() {
		t.Error("Room with participant should not be empty")
	}

	room.RemoveParticipant("p1")

	if !room.IsEmpty() {
		t.Error("Room after removing all participants should be empty")
	}
}

func TestRoom_ParticipantCount(t *testing.T) {
	room := NewRoom("test-room")

	if room.ParticipantCount() != 0 {
		t.Errorf("Expected 0 participants, got %d", room.ParticipantCount())
	}

	conn1, server1 := createTestWebSocket(t)
	defer server1.Close()
	defer conn1.Close()
	conn2, server2 := createTestWebSocket(t)
	defer server2.Close()
	defer conn2.Close()

	room.AddParticipant(&Participant{ID: "p1", Conn: conn1})
	room.AddParticipant(&Participant{ID: "p2", Conn: conn2})

	if room.ParticipantCount() != 2 {
		t.Errorf("Expected 2 participants, got %d", room.ParticipantCount())
	}
}

// ============================================================================
// RoomManager Tests
// ============================================================================

func TestNewRoomManager(t *testing.T) {
	ttl := 30 * time.Minute
	rm := NewRoomManager(ttl)
	defer rm.Stop()

	if rm == nil {
		t.Fatal("NewRoomManager should not return nil")
	}
	if rm.ttl != ttl {
		t.Errorf("Expected TTL %v, got %v", ttl, rm.ttl)
	}
}

func TestRoomManager_GetOrCreate_NewRoom(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	room := rm.GetOrCreate("new-room")

	if room == nil {
		t.Fatal("GetOrCreate should return a room")
	}
	if room.ID != "new-room" {
		t.Errorf("Expected room ID 'new-room', got %s", room.ID)
	}
}

func TestRoomManager_GetOrCreate_ExistingRoom(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	room1 := rm.GetOrCreate("same-room")
	room2 := rm.GetOrCreate("same-room")

	if room1 != room2 {
		t.Error("GetOrCreate should return the same room for same ID")
	}
}

func TestRoomManager_Get(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	// Get non-existent room
	room := rm.Get("nonexistent")
	if room != nil {
		t.Error("Get should return nil for non-existent room")
	}

	// Create and get
	rm.GetOrCreate("test-room")
	room = rm.Get("test-room")
	if room == nil {
		t.Error("Get should return existing room")
	}
}

func TestRoomManager_AddParticipant(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	room, _ := rm.AddParticipant("room-1", "participant-1", conn)

	if room == nil {
		t.Fatal("AddParticipant should return the room")
	}
	if room.ParticipantCount() != 1 {
		t.Errorf("Expected 1 participant, got %d", room.ParticipantCount())
	}
}

func TestRoomManager_AddParticipant_CreatesRoom(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	// Room doesn't exist yet
	room := rm.Get("new-room")
	if room != nil {
		t.Fatal("Room should not exist yet")
	}

	// AddParticipant should create the room
	rm.AddParticipant("new-room", "p1", conn)

	room = rm.Get("new-room")
	if room == nil {
		t.Error("Room should be created")
	}
}

func TestRoomManager_RemoveParticipant(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	rm.AddParticipant("room-1", "p1", conn)
	rm.RemoveParticipant("room-1", "p1")

	room := rm.Get("room-1")
	if room != nil {
		t.Error("Room should be deleted when empty")
	}
}

func TestRoomManager_RemoveParticipant_RoomNotDeletedIfNotEmpty(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	conn1, server1 := createTestWebSocket(t)
	defer server1.Close()
	defer conn1.Close()
	conn2, server2 := createTestWebSocket(t)
	defer server2.Close()
	defer conn2.Close()

	rm.AddParticipant("room-1", "p1", conn1)
	rm.AddParticipant("room-1", "p2", conn2)
	rm.RemoveParticipant("room-1", "p1")

	room := rm.Get("room-1")
	if room == nil {
		t.Error("Room should not be deleted if not empty")
	}
	if room.ParticipantCount() != 1 {
		t.Errorf("Expected 1 participant, got %d", room.ParticipantCount())
	}
}

func TestRoomManager_RemoveParticipant_NonExistentRoom(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	// Should not panic
	rm.RemoveParticipant("nonexistent", "p1")
}

func TestRoomManager_RoomCount(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	if rm.RoomCount() != 0 {
		t.Errorf("Expected 0 rooms, got %d", rm.RoomCount())
	}

	conn1, server1 := createTestWebSocket(t)
	defer server1.Close()
	defer conn1.Close()
	conn2, server2 := createTestWebSocket(t)
	defer server2.Close()
	defer conn2.Close()

	rm.GetOrCreate("room-1")
	rm.GetOrCreate("room-2")

	if rm.RoomCount() != 2 {
		t.Errorf("Expected 2 rooms, got %d", rm.RoomCount())
	}
}

func TestRoomManager_Broadcast(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	// Create test server that captures messages
	msgReceived := make(chan []byte, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, _ := testUpgrader.Upgrade(w, r, nil)
		defer conn.Close()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			select {
			case msgReceived <- msg:
			default:
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	conn1, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	defer conn1.Close()
	conn2, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	defer conn2.Close()

	rm.AddParticipant("room-1", "p1", conn1)
	rm.AddParticipant("room-1", "p2", conn2)

	// Broadcast from p1 - should reach p2
	message := []byte(`{"type":"test"}`)
	rm.Broadcast("room-1", "p1", message)

	// p2 should receive the message
	select {
	case msg := <-msgReceived:
		if string(msg) != string(message) {
			t.Errorf("Expected message '%s', got '%s'", message, msg)
		}
	case <-time.After(time.Second):
		t.Error("Broadcast message should be received")
	}
}

func TestRoomManager_SendTo(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	msgReceived := make(chan []byte, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, _ := testUpgrader.Upgrade(w, r, nil)
		defer conn.Close()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			select {
			case msgReceived <- msg:
			default:
			}
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	defer conn.Close()

	rm.AddParticipant("room-1", "p1", conn)

	message := []byte(`{"type":"direct"}`)
	err := rm.SendTo("room-1", "p1", message)
	if err != nil {
		t.Errorf("SendTo should not return error: %v", err)
	}

	select {
	case msg := <-msgReceived:
		if string(msg) != string(message) {
			t.Errorf("Expected message '%s', got '%s'", message, msg)
		}
	case <-time.After(time.Second):
		t.Error("SendTo message should be received")
	}
}

func TestRoomManager_SendTo_NonExistentRoom(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	// Should not panic or error
	err := rm.SendTo("nonexistent", "p1", []byte("test"))
	if err != nil {
		t.Errorf("SendTo should not error for non-existent room: %v", err)
	}
}

func TestRoomManager_SendTo_NonExistentParticipant(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	rm.AddParticipant("room-1", "p1", conn)

	// Send to non-existent participant
	err := rm.SendTo("room-1", "nonexistent", []byte("test"))
	if err != nil {
		t.Errorf("SendTo should not error for non-existent participant: %v", err)
	}
}

// ============================================================================
// Concurrency Tests - Lens 4: Death by a Thousand Users
// ============================================================================

func TestRoomManager_GetOrCreate_Concurrent(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	roomID := "concurrent-room"
	numGoroutines := 100

	var wg sync.WaitGroup
	rooms := make([]*Room, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			rooms[idx] = rm.GetOrCreate(roomID)
		}(i)
	}

	wg.Wait()

	// All goroutines should get the same room
	firstRoom := rooms[0]
	for i, room := range rooms {
		if room != firstRoom {
			t.Errorf("Goroutine %d got different room instance", i)
		}
	}
}

func TestRoomManager_AddParticipant_Concurrent(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	numParticipants := 50
	var wg sync.WaitGroup

	// Create a pool of connections
	conns := make([]*websocket.Conn, numParticipants)
	servers := make([]*httptest.Server, numParticipants)

	for i := 0; i < numParticipants; i++ {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			conn, _ := testUpgrader.Upgrade(w, r, nil)
			defer conn.Close()
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}))
		servers[i] = server
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
		conn, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
		conns[i] = conn
	}

	defer func() {
		for _, s := range servers {
			s.Close()
		}
		for _, c := range conns {
			c.Close()
		}
	}()

	// Add participants concurrently
	for i := 0; i < numParticipants; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			rm.AddParticipant("room-1", string(rune(idx)), conns[idx])
		}(i)
	}

	wg.Wait()

	room := rm.Get("room-1")
	if room == nil {
		t.Fatal("Room should exist")
	}

	// All participants should be added (no race condition losses)
	if room.ParticipantCount() != numParticipants {
		t.Errorf("Expected %d participants, got %d", numParticipants, room.ParticipantCount())
	}
}

func TestRoom_AddRemove_Concurrent(t *testing.T) {
	room := NewRoom("test-room")

	numOperations := 1000
	var wg sync.WaitGroup

	// Create connections
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	for i := 0; i < numOperations; i++ {
		wg.Add(2)

		// Add
		go func(idx int) {
			defer wg.Done()
			p := &Participant{ID: string(rune(idx)), Conn: conn}
			room.AddParticipant(p)
		}(i)

		// Remove
		go func(idx int) {
			defer wg.Done()
			room.RemoveParticipant(string(rune(idx)))
		}(i)
	}

	wg.Wait()

	// Should complete without race condition (detected by race detector)
}

func TestRoomManager_RoomCount_Concurrent(t *testing.T) {
	rm := NewRoomManager(time.Hour)
	defer rm.Stop()

	numGoroutines := 100
	var wg sync.WaitGroup

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			roomID := string(rune('A' + idx%26))
			rm.GetOrCreate(roomID)
		}(i)
	}

	wg.Wait()

	count := rm.RoomCount()
	if count < 1 || count > 26 {
		t.Errorf("Room count should be between 1 and 26, got %d", count)
	}
}

// ============================================================================
// TTL and Cleanup Tests
// ============================================================================

func TestRoomManager_CleanupExpired(t *testing.T) {
	// Use very short TTL for testing
	ttl := 100 * time.Millisecond
	rm := NewRoomManager(ttl)
	defer rm.Stop()

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	rm.AddParticipant("room-1", "p1", conn)
	rm.RemoveParticipant("room-1", "p1") // Room becomes empty

	// Wait for cleanup
	time.Sleep(200 * time.Millisecond)

	// Manually trigger cleanup (since the ticker runs every minute)
	rm.cleanupExpired()

	// Empty room should be cleaned up
	room := rm.Get("room-1")
	if room != nil {
		t.Error("Empty room should be cleaned up")
	}
}

func TestRoomManager_Cleanup_KeepsActiveRooms(t *testing.T) {
	ttl := 100 * time.Millisecond
	rm := NewRoomManager(ttl)
	defer rm.Stop()

	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	rm.AddParticipant("room-1", "p1", conn)

	time.Sleep(50 * time.Millisecond)
	rm.cleanupExpired()

	// Active room should still exist
	room := rm.Get("room-1")
	if room == nil {
		t.Error("Active room should not be cleaned up")
	}
}

// ============================================================================
// Edge Cases - Lens 3: Edge Case Flood
// ============================================================================

func TestNewRoom_EmptyID(t *testing.T) {
	room := NewRoom("")

	if room.ID != "" {
		t.Errorf("Expected empty ID, got %s", room.ID)
	}
	// Should still work with empty ID
	if room.Participants == nil {
		t.Error("Participants map should be initialized even with empty ID")
	}
}

func TestNewRoom_UnicodeID(t *testing.T) {
	roomID := "部屋-🔥-测试-😀"
	room := NewRoom(roomID)

	if room.ID != roomID {
		t.Errorf("Expected room ID '%s', got %s", roomID, room.ID)
	}
}

func TestNewRoom_VeryLongID(t *testing.T) {
	// 1000 character room ID
	roomID := strings.Repeat("a", 1000)
	room := NewRoom(roomID)

	if room.ID != roomID {
		t.Error("Room should handle very long ID")
	}
}

func TestRoom_ParticipantWithNilConnection(t *testing.T) {
	room := NewRoom("test-room")

	// Participant with nil connection (edge case)
	p := &Participant{
		ID:   "p1",
		Conn: nil,
	}

	room.AddParticipant(p)

	if room.ParticipantCount() != 1 {
		t.Error("Should add participant even with nil connection")
	}
}

func TestRoom_LastActivity_Update(t *testing.T) {
	room := NewRoom("test-room")
	conn, server := createTestWebSocket(t)
	defer server.Close()
	defer conn.Close()

	// Track LastActivity updates
	activities := []time.Time{room.LastActivity}

	p1 := &Participant{ID: "p1", Conn: conn}
	room.AddParticipant(p1)
	activities = append(activities, room.LastActivity)

	room.RemoveParticipant("p1")
	activities = append(activities, room.LastActivity)

	// Each operation should update LastActivity
	for i := 1; i < len(activities); i++ {
		if !activities[i].After(activities[i-1]) && !activities[i].Equal(activities[i-1]) {
			t.Errorf("Activity %d should be >= activity %d", i, i-1)
		}
	}
}

// ============================================================================
// extractIP function tests (from turn.go but related to room participants)
// ============================================================================

func TestExtractIP_UDPAddr(t *testing.T) {
	addr := &net.UDPAddr{IP: net.ParseIP("192.168.1.1"), Port: 12345}
	ip := extractIP(addr)

	if ip != "192.168.1.1" {
		t.Errorf("Expected IP '192.168.1.1', got %s", ip)
	}
}

func TestExtractIP_TCPAddr(t *testing.T) {
	addr := &net.TCPAddr{IP: net.ParseIP("10.0.0.1"), Port: 80}
	ip := extractIP(addr)

	if ip != "10.0.0.1" {
		t.Errorf("Expected IP '10.0.0.1', got %s", ip)
	}
}

func TestExtractIP_CustomAddrType(t *testing.T) {
	// Custom address type
	addr := &mockAddr{addr: "192.168.2.1:8080"}
	ip := extractIP(addr)

	if ip != "192.168.2.1" {
		t.Errorf("Expected IP '192.168.2.1', got %s", ip)
	}
}

func TestExtractIP_IPv6(t *testing.T) {
	addr := &net.UDPAddr{IP: net.ParseIP("::1"), Port: 12345}
	ip := extractIP(addr)

	if ip != "::1" {
		t.Errorf("Expected IP '::1', got %s", ip)
	}
}

// mockAddr for testing extractIP with unknown address types
type mockAddr struct {
	addr string
}

func (m *mockAddr) Network() string { return "mock" }
func (m *mockAddr) String() string  { return m.addr }
