// Manages conversation sessions and history for the tutoring simulation
import { v4 as uuidv4 } from 'uuid';

// In-memory storage for active conversations
const conversations = new Map();

// Maximum turns allowed per conversation
export const MAX_TURNS = 10;

// Create a new conversation
export function createConversation(studentId, topicId, student, topic) {
  const conversationId = `conv_${uuidv4()}`;

  const conversation = {
    id: conversationId,
    studentId,
    topicId,
    student,
    topic,
    messages: [],
    turnNumber: 0,
    maxTurns: MAX_TURNS,
    isComplete: false,
    createdAt: new Date().toISOString(),
    // LLM-predicted understanding level (locked at turn 5)
    lockedPrediction: null
  };

  conversations.set(conversationId, conversation);

  return {
    conversation_id: conversationId,
    student_id: studentId,
    topic_id: topicId,
    max_turns: MAX_TURNS,
    conversations_remaining: 999 // Unlimited for local simulation
  };
}

// Get a conversation by ID
export function getConversation(conversationId) {
  return conversations.get(conversationId) || null;
}

// Add a message to a conversation
export function addMessage(conversationId, role, content) {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return null;
  }

  conversation.messages.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });

  // Increment turn number on tutor message
  if (role === 'tutor') {
    conversation.turnNumber++;
  }

  // Check if conversation is complete
  if (conversation.turnNumber >= conversation.maxTurns) {
    conversation.isComplete = true;
  }

  return conversation;
}

// Get conversation history formatted for OpenAI
export function getOpenAIMessages(conversationId) {
  const conversation = conversations.get(conversationId);
  if (!conversation) {
    return [];
  }

  return conversation.messages.map(msg => ({
    role: msg.role === 'tutor' ? 'user' : 'assistant',
    content: msg.content
  }));
}

// Check if conversation is complete
export function isConversationComplete(conversationId) {
  const conversation = conversations.get(conversationId);
  return conversation ? conversation.isComplete : true;
}

// End a conversation
export function endConversation(conversationId) {
  const conversation = conversations.get(conversationId);
  if (conversation) {
    conversation.isComplete = true;
  }
  return conversation;
}

// Set the locked prediction (called at turn 5)
export function setLockedPrediction(conversationId, level, rationale) {
  const conversation = conversations.get(conversationId);
  if (conversation && !conversation.lockedPrediction) {
    conversation.lockedPrediction = {
      level,
      rationale,
      lockedAtTurn: conversation.turnNumber,
      lockedAt: new Date().toISOString()
    };
  }
  return conversation?.lockedPrediction || null;
}

// Get the locked prediction for a conversation
export function getLockedPrediction(conversationId) {
  const conversation = conversations.get(conversationId);
  return conversation?.lockedPrediction || null;
}

// Delete a conversation (cleanup)
export function deleteConversation(conversationId) {
  return conversations.delete(conversationId);
}

// Get conversation stats
export function getStats() {
  return {
    activeConversations: conversations.size,
    conversations: Array.from(conversations.values()).map(c => ({
      id: c.id,
      studentId: c.studentId,
      turnNumber: c.turnNumber,
      isComplete: c.isComplete
    }))
  };
}
