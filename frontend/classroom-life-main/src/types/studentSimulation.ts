export interface Student {
  id: string;
  name: string;
  grade_level: number;
}

export interface Topic {
  id: string;
  subject_id: string;
  subject_name: string;
  name: string;
  grade_level: number;
}

export interface Subject {
  id: string;
  name: string;
}

export interface ConversationStart {
  conversation_id: string;
  student_id: string;
  topic_id: string;
  max_turns: number;
  conversations_remaining?: number;
}

export interface InteractionResponse {
  conversation_id: string;
  interaction_id: string;
  student_response: string;
  turn_number: number;
  is_complete: boolean;
  estimated_level: number | null;
}

export interface ConversationMessage {
  role: 'tutor' | 'student';
  content: string;
  turn_number: number;
}

export interface StudentWithTopics extends Student {
  topics: Topic[];
}
