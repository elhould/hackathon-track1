import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { LOCAL_STUDENTS } from '@/data/localStudents';
import type {
  Student,
  Topic,
  Subject,
  ConversationStart,
  InteractionResponse,
  ConversationMessage,
} from '@/types/studentSimulation';

export type {
  Student,
  Topic,
  Subject,
  ConversationStart,
  InteractionResponse,
  ConversationMessage,
} from '@/types/studentSimulation';

// API base URL - configurable via environment variable
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const USE_REMOTE_STUDENT_DATA = import.meta.env.VITE_STUDENT_DATA_MODE === 'remote';
const LOCAL_STUDENT_LIST: Student[] = LOCAL_STUDENTS.map(({ topics, ...student }) => student);
const LOCAL_TOPICS_BY_STUDENT = new Map<string, Topic[]>();
const LOCAL_TOPIC_MAP = new Map<string, Topic>();

for (const student of LOCAL_STUDENTS) {
  LOCAL_TOPICS_BY_STUDENT.set(student.id, student.topics);
  for (const topic of student.topics) {
    if (!LOCAL_TOPIC_MAP.has(topic.id)) {
      LOCAL_TOPIC_MAP.set(topic.id, topic);
    }
  }
}

const LOCAL_TOPICS = Array.from(LOCAL_TOPIC_MAP.values());
const LOCAL_SUBJECTS: Subject[] = Array.from(
  new Map(
    LOCAL_TOPICS.map((topic) => [
      topic.subject_id,
      { id: topic.subject_id, name: topic.subject_name },
    ])
  ).values()
);

export function useStudentSimulation() {
  const [isLoading, setIsLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ConversationStart | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);

  // Generic API call helper for local server
  const callApi = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const url = `${API_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API call failed: ${response.status}`);
    }

    return response.json();
  }, []);

  const listStudents = useCallback(async (setType?: 'mini_dev' | 'dev' | 'eval') => {
    setIsLoading(true);
    if (!USE_REMOTE_STUDENT_DATA) {
      setStudents(LOCAL_STUDENT_LIST);
      setIsLoading(false);
      return LOCAL_STUDENT_LIST;
    }
    try {
      const data = await callApi('/api/students');
      setStudents(data.students || []);
      return data.students as Student[];
    } catch (error) {
      console.warn('Student API unavailable, using local student list.', error);
      setStudents(LOCAL_STUDENT_LIST);
      return LOCAL_STUDENT_LIST;
    } finally {
      setIsLoading(false);
    }
  }, [callApi]);

  const getStudentTopics = useCallback(async (studentId: string) => {
    setIsLoading(true);
    if (!USE_REMOTE_STUDENT_DATA) {
      const localTopics = LOCAL_TOPICS_BY_STUDENT.get(studentId) || [];
      setTopics(localTopics);
      setIsLoading(false);
      return localTopics;
    }
    try {
      const data = await callApi(`/api/students/${studentId}/topics`);
      setTopics(data.topics || []);
      return data.topics as Topic[];
    } catch (error) {
      console.warn('Student topics API unavailable, using local topics.', error);
      const localTopics = LOCAL_TOPICS_BY_STUDENT.get(studentId) || [];
      setTopics(localTopics);
      return localTopics;
    } finally {
      setIsLoading(false);
    }
  }, [callApi]);

  const listSubjects = useCallback(async () => {
    setIsLoading(true);
    if (!USE_REMOTE_STUDENT_DATA) {
      setSubjects(LOCAL_SUBJECTS);
      setIsLoading(false);
      return LOCAL_SUBJECTS;
    }
    try {
      const data = await callApi('/api/subjects');
      setSubjects(data.subjects || []);
      return data.subjects as Subject[];
    } catch (error) {
      console.warn('Subjects API unavailable, using local subjects.', error);
      setSubjects(LOCAL_SUBJECTS);
      return LOCAL_SUBJECTS;
    } finally {
      setIsLoading(false);
    }
  }, [callApi]);

  const listTopics = useCallback(async (subjectId?: string) => {
    setIsLoading(true);
    if (!USE_REMOTE_STUDENT_DATA) {
      const localTopics = subjectId
        ? LOCAL_TOPICS.filter((topic) => topic.subject_id === subjectId)
        : LOCAL_TOPICS;
      setTopics(localTopics);
      setIsLoading(false);
      return localTopics;
    }
    try {
      const endpoint = subjectId ? `/api/topics?subject_id=${subjectId}` : '/api/topics';
      const data = await callApi(endpoint);
      setTopics(data.topics || []);
      return data.topics as Topic[];
    } catch (error) {
      console.warn('Topics API unavailable, using local topics.', error);
      const localTopics = subjectId
        ? LOCAL_TOPICS.filter((topic) => topic.subject_id === subjectId)
        : LOCAL_TOPICS;
      setTopics(localTopics);
      return localTopics;
    } finally {
      setIsLoading(false);
    }
  }, [callApi]);

  const startConversation = useCallback(async (studentId: string, topicId: string) => {
    setIsLoading(true);
    try {
      const data = await callApi('/api/interact/start', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          topic_id: topicId,
        }),
      });
      setCurrentConversation(data);
      setMessages([]);
      setCurrentTurn(0);
      toast.success('Conversation started!');
      return data as ConversationStart;
    } catch (error) {
      toast.error(`Failed to start conversation: ${(error as Error).message}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [callApi]);

  const sendMessage = useCallback(async (tutorMessage: string) => {
    if (!currentConversation) {
      toast.error('No active conversation');
      throw new Error('No active conversation');
    }

    setIsLoading(true);
    try {
      // Add tutor message to local state immediately
      const newTutorMessage: ConversationMessage = {
        role: 'tutor',
        content: tutorMessage,
        turn_number: currentTurn + 1,
      };
      setMessages(prev => [...prev, newTutorMessage]);

      const data = await callApi('/api/interact', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: currentConversation.conversation_id,
          tutor_message: tutorMessage,
        }),
      });

      // Add student response
      const studentMessage: ConversationMessage = {
        role: 'student',
        content: data.student_response,
        turn_number: data.turn_number,
      };
      setMessages(prev => [...prev, studentMessage]);
      setCurrentTurn(data.turn_number);

      if (data.is_complete) {
        toast.info('Conversation complete - maximum turns reached');
      }

      return {
        ...data,
        estimated_level: data.estimated_level as number | null,
      } as InteractionResponse;
    } catch (error) {
      // Remove the tutor message if the API call failed
      setMessages(prev => prev.slice(0, -1));
      toast.error(`Failed to send message: ${(error as Error).message}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [callApi, currentConversation, currentTurn]);

  const endConversation = useCallback(() => {
    setCurrentConversation(null);
    setMessages([]);
    setCurrentTurn(0);
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const data = await callApi('/api/health');
      return data;
    } catch (error) {
      toast.error('API health check failed');
      throw error;
    }
  }, [callApi]);

  // Generate an AI tutor response
  const generateTutorResponse = useCallback(async () => {
    if (!currentConversation) {
      throw new Error('No active conversation');
    }

    const data = await callApi('/api/tutor-response', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: currentConversation.conversation_id,
      }),
    });

    return {
      tutorResponse: data.tutor_response as string,
      turnNumber: data.turn_number as number,
      phase: data.phase as 'diagnostic' | 'tutoring',
      estimatedLevel: data.estimated_level as number | null,
      isLastTurn: data.is_last_turn as boolean,
    };
  }, [callApi, currentConversation]);

  // Run a complete auto-tutor turn: generate tutor message, send it, get student response
  const autoTutorTurn = useCallback(async () => {
    if (!currentConversation) {
      toast.error('No active conversation');
      throw new Error('No active conversation');
    }

    setIsLoading(true);
    try {
      // Generate tutor response
      const tutorData = await generateTutorResponse();

      // Add tutor message to local state
      const newTutorMessage: ConversationMessage = {
        role: 'tutor',
        content: tutorData.tutorResponse,
        turn_number: tutorData.turnNumber,
      };
      setMessages(prev => [...prev, newTutorMessage]);

      // Send tutor message and get student response
      const data = await callApi('/api/interact', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: currentConversation.conversation_id,
          tutor_message: tutorData.tutorResponse,
        }),
      });

      // Add student response
      const studentMessage: ConversationMessage = {
        role: 'student',
        content: data.student_response,
        turn_number: data.turn_number,
      };
      setMessages(prev => [...prev, studentMessage]);
      setCurrentTurn(data.turn_number);

      if (data.is_complete) {
        toast.info('Conversation complete - maximum turns reached');
      }

      return {
        tutorMessage: tutorData.tutorResponse,
        studentResponse: data.student_response as string,
        turnNumber: data.turn_number as number,
        phase: tutorData.phase,
        estimatedLevel: tutorData.estimatedLevel,
        isComplete: data.is_complete as boolean,
      };
    } catch (error) {
      toast.error(`Auto-tutor failed: ${(error as Error).message}`);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [callApi, currentConversation, generateTutorResponse]);

  return {
    // State
    isLoading,
    students,
    topics,
    subjects,
    currentConversation,
    messages,
    currentTurn,
    
    // Actions
    listStudents,
    getStudentTopics,
    listSubjects,
    listTopics,
    startConversation,
    sendMessage,
    endConversation,
    checkHealth,
    // Auto-tutor
    generateTutorResponse,
    autoTutorTurn,
  };
}
