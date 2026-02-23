package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Message types for WebSocket signaling
const (
	MsgTypeJoin         = "join"
	MsgTypeJoinAck      = "join-ack"
	MsgTypeLeave        = "leave"
	MsgTypePeerJoined   = "peer-joined"
	MsgTypePeerLeft     = "peer-left"
	MsgTypeOffer        = "offer"
	MsgTypeAnswer       = "answer"
	MsgTypeIceCandidate = "ice-candidate"
	MsgTypeError        = "error"
)

// SignalingMessage represents a WebSocket message
type SignalingMessage struct {
	Type    string          `json:"type"`
	From    string          `json:"from,omitempty"`
	To      string          `json:"to,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, validate origin properly
		return true
	},
}

// SignalingHandler handles WebSocket connections for signaling
type SignalingHandler struct {
	rooms  *RoomManager
	config *Config
}

// NewSignalingHandler creates a new signaling handler
func NewSignalingHandler(rooms *RoomManager, config *Config) *SignalingHandler {
	return &SignalingHandler{
		rooms:  rooms,
		config: config,
	}
}

// ServeHTTP handles WebSocket upgrade and message routing
func (h *SignalingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Extract roomID from path: /ws/{roomID}
	path := strings.TrimPrefix(r.URL.Path, "/ws/")
	roomID := strings.Split(path, "/")[0]
	if roomID == "" {
		http.Error(w, "room ID required", http.StatusBadRequest)
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Generate participant ID
	participantID := uuid.New().String()

	// Generate TURN credentials
	var creds TurnCredentials
	if h.config.Turn.Enabled && h.config.Turn.Secret != "" {
		creds = GenerateTurnCredentials(roomID, h.config.Turn.Secret, h.config.Turn.CredentialTTLMin)
	}

	// Add participant to room
	room, isCreator := h.rooms.AddParticipant(roomID, participantID, conn)
	log.Printf("Participant %s joined room %s (total: %d, isCreator: %v)", participantID, roomID, room.ParticipantCount(), isCreator)

	// Send join acknowledgment
	h.sendJoinAck(conn, participantID, roomID, creds, isCreator)

	// Notify others in the room
	h.broadcastPeerJoined(room, participantID)

	// Read messages until connection closes
	const readTimeout = 5 * time.Minute

	for {
		// Set read deadline to detect stale connections
		conn.SetReadDeadline(time.Now().Add(readTimeout))

		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}

		var msg SignalingMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			h.sendError(conn, "invalid message format")
			continue
		}

		msg.From = participantID
		h.handleMessage(room, participantID, msg)
	}

	// Cleanup on disconnect
	h.rooms.RemoveParticipant(roomID, participantID)
	log.Printf("Participant %s left room %s", participantID, roomID)

	// Notify remaining participants
	room = h.rooms.Get(roomID)
	if room != nil {
		h.broadcastPeerLeft(room, participantID)
	}
}

// handleMessage routes messages based on type
func (h *SignalingHandler) handleMessage(room *Room, participantID string, msg SignalingMessage) {
	switch msg.Type {
	case MsgTypeOffer, MsgTypeAnswer, MsgTypeIceCandidate:
		// Relay to target participant
		if msg.To == "" {
			return
		}
		data, _ := json.Marshal(msg)
		h.rooms.SendTo(room.ID, msg.To, data)

	default:
		// Unknown message type, ignore
	}
}

// sendMessage sends a message to a WebSocket connection
func (h *SignalingHandler) sendMessage(conn *websocket.Conn, msg SignalingMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}

// sendJoinAck sends the join acknowledgment with participant ID, TURN credentials, and initiator info
func (h *SignalingHandler) sendJoinAck(conn *websocket.Conn, participantID, roomID string, creds TurnCredentials, isCreator bool) {
	// Get existing participants
	room := h.rooms.Get(roomID)
	var existingPeers []string
	var initiatorId string

	if room != nil {
		for _, p := range room.GetOtherParticipants(participantID) {
			existingPeers = append(existingPeers, p.ID)
		}

		// Determine who should initiate connections
		// If room was empty, this participant is the initiator (creator)
		// Otherwise, the longest-connected existing participant initiates
		if isCreator {
			initiatorId = participantID
		} else {
			longest := room.GetLongestConnectedParticipant(participantID)
			if longest != nil {
				initiatorId = longest.ID
			}
		}
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"participantId":   participantID,
		"roomId":          roomID,
		"turnCredentials": creds,
		"existingPeers":   existingPeers,
		"initiatorId":     initiatorId,
	})

	msg := SignalingMessage{
		Type:    MsgTypeJoinAck,
		Payload: payload,
	}
	h.sendMessage(conn, msg)
}

// broadcastPeerJoined notifies all participants about a new peer and who should initiate
func (h *SignalingHandler) broadcastPeerJoined(room *Room, newParticipantID string) {
	// Find who should initiate connection to the new peer (longest connected)
	initiator := room.GetLongestConnectedParticipant(newParticipantID)
	initiatorId := ""
	if initiator != nil {
		initiatorId = initiator.ID
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"participantId": newParticipantID,
		"initiatorId":   initiatorId,
	})

	msg := SignalingMessage{
		Type:    MsgTypePeerJoined,
		Payload: payload,
	}

	data, _ := json.Marshal(msg)
	failed, _ := h.rooms.Broadcast(room.ID, newParticipantID, data)
	if len(failed) > 0 {
		h.rooms.RemoveFailedParticipants(room.ID, failed)
		log.Printf("Removed %d failed participants from room %s", len(failed), room.ID)
	}
}

// broadcastPeerLeft notifies all participants about a peer leaving
func (h *SignalingHandler) broadcastPeerLeft(room *Room, leftParticipantID string) {
	payload, _ := json.Marshal(map[string]string{
		"participantId": leftParticipantID,
	})

	msg := SignalingMessage{
		Type:    MsgTypePeerLeft,
		Payload: payload,
	}

	data, _ := json.Marshal(msg)
	failed, _ := h.rooms.Broadcast(room.ID, leftParticipantID, data)
	if len(failed) > 0 {
		h.rooms.RemoveFailedParticipants(room.ID, failed)
		log.Printf("Removed %d failed participants from room %s", len(failed), room.ID)
	}
}

// sendError sends an error message to a client
func (h *SignalingHandler) sendError(conn *websocket.Conn, errMsg string) {
	payload, _ := json.Marshal(map[string]string{"message": errMsg})
	msg := SignalingMessage{
		Type:    MsgTypeError,
		Payload: payload,
	}
	h.sendMessage(conn, msg)
}
