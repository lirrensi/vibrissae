package main

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Participant represents a connected client in a room
type Participant struct {
	ID       string
	Conn     *websocket.Conn
	JoinedAt time.Time
}

// Room represents a video chat room with multiple participants
type Room struct {
	ID           string
	Participants map[string]*Participant
	LastActivity time.Time
	mu           sync.RWMutex
}

// NewRoom creates a new room with the given ID
func NewRoom(id string) *Room {
	return &Room{
		ID:           id,
		Participants: make(map[string]*Participant),
		LastActivity: time.Now(),
	}
}

// AddParticipant adds a participant to the room
func (r *Room) AddParticipant(p *Participant) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Participants[p.ID] = p
	r.LastActivity = time.Now()
}

// RemoveParticipant removes a participant from the room
func (r *Room) RemoveParticipant(participantID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Participants, participantID)
	r.LastActivity = time.Now()
}

// GetParticipant retrieves a participant by ID
func (r *Room) GetParticipant(id string) (*Participant, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.Participants[id]
	return p, ok
}

// GetOtherParticipants returns all participants except the specified one
func (r *Room) GetOtherParticipants(excludeID string) []*Participant {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var participants []*Participant
	for id, p := range r.Participants {
		if id != excludeID {
			participants = append(participants, p)
		}
	}
	return participants
}

// IsEmpty returns true if the room has no participants
func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Participants) == 0
}

// ParticipantCount returns the number of participants
func (r *Room) ParticipantCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Participants)
}

// RoomManager manages all rooms with TTL-based cleanup
type RoomManager struct {
	rooms       sync.Map // map[string]*Room
	ttl         time.Duration
	stopCleanup chan struct{}
}

// NewRoomManager creates a new room manager with the specified TTL
func NewRoomManager(ttl time.Duration) *RoomManager {
	rm := &RoomManager{
		ttl:         ttl,
		stopCleanup: make(chan struct{}),
	}
	go rm.cleanupLoop()
	return rm
}

// GetOrCreate returns an existing room or creates a new one
func (rm *RoomManager) GetOrCreate(roomID string) *Room {
	// Try to load existing room
	if val, ok := rm.rooms.Load(roomID); ok {
		return val.(*Room)
	}

	// Create new room
	newRoom := NewRoom(roomID)
	actual, loaded := rm.rooms.LoadOrStore(roomID, newRoom)
	if loaded {
		// Another goroutine created the room first
		return actual.(*Room)
	}
	return newRoom
}

// Get retrieves a room by ID, returns nil if not found
func (rm *RoomManager) Get(roomID string) *Room {
	if val, ok := rm.rooms.Load(roomID); ok {
		return val.(*Room)
	}
	return nil
}

// AddParticipant adds a participant to a room, creating the room if needed
func (rm *RoomManager) AddParticipant(roomID, participantID string, conn *websocket.Conn) *Room {
	room := rm.GetOrCreate(roomID)
	participant := &Participant{
		ID:       participantID,
		Conn:     conn,
		JoinedAt: time.Now(),
	}
	room.AddParticipant(participant)
	return room
}

// RemoveParticipant removes a participant from a room
func (rm *RoomManager) RemoveParticipant(roomID, participantID string) {
	room := rm.Get(roomID)
	if room == nil {
		return
	}

	room.RemoveParticipant(participantID)

	// Delete room if empty
	if room.IsEmpty() {
		rm.rooms.Delete(roomID)
	}
}

// Broadcast sends a message to all participants in a room except the sender
// Returns list of participant IDs that failed to receive (for cleanup)
func (rm *RoomManager) Broadcast(roomID, excludeParticipantID string, message []byte) ([]string, error) {
	room := rm.Get(roomID)
	if room == nil {
		return nil, nil
	}

	var failed []string
	for _, p := range room.GetOtherParticipants(excludeParticipantID) {
		if err := p.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			failed = append(failed, p.ID)
		}
	}
	return failed, nil
}

// SendTo sends a message to a specific participant
func (rm *RoomManager) SendTo(roomID, participantID string, message []byte) error {
	room := rm.Get(roomID)
	if room == nil {
		return nil
	}

	if p, ok := room.GetParticipant(participantID); ok {
		return p.Conn.WriteMessage(websocket.TextMessage, message)
	}
	return nil
}

// RemoveFailedParticipants removes participants that failed to receive messages
func (rm *RoomManager) RemoveFailedParticipants(roomID string, participantIDs []string) {
	room := rm.Get(roomID)
	if room == nil {
		return
	}
	for _, id := range participantIDs {
		room.RemoveParticipant(id)
	}
}

// cleanupLoop periodically removes expired rooms
func (rm *RoomManager) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rm.cleanupExpired()
		case <-rm.stopCleanup:
			return
		}
	}
}

// cleanupExpired removes rooms that have exceeded their TTL
func (rm *RoomManager) cleanupExpired() {
	now := time.Now()
	rm.rooms.Range(func(key, value interface{}) bool {
		room := value.(*Room)
		room.mu.RLock()
		lastActivity := room.LastActivity
		isEmpty := len(room.Participants) == 0
		room.mu.RUnlock()

		// Delete if empty or expired
		if isEmpty || now.Sub(lastActivity) > rm.ttl {
			rm.rooms.Delete(key)
		}
		return true
	})
}

// Stop stops the cleanup goroutine
func (rm *RoomManager) Stop() {
	close(rm.stopCleanup)
}

// RoomCount returns the number of active rooms
func (rm *RoomManager) RoomCount() int {
	count := 0
	rm.rooms.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}
