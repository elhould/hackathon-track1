import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useStudentSimulation, Student, Topic, ConversationMessage } from '@/hooks/useStudentSimulation';

interface TutoringContextValue {
  // State from useStudentSimulation
  isLoading: boolean;
  students: Student[];
  topics: Topic[];
  currentConversation: ReturnType<typeof useStudentSimulation>['currentConversation'];
  messages: ConversationMessage[];
  currentTurn: number;

  // Selected items
  selectedStudent: Student | null;
  selectedTopic: Topic | null;
  setSelectedStudent: (student: Student | null) => void;
  setSelectedTopic: (topic: Topic | null) => void;

  // Live dialogue state for speech bubbles
  liveStudentText: string;
  liveTutorText: string;
  setLiveStudentText: (text: string) => void;
  setLiveTutorText: (text: string) => void;

  // Generated image for display
  currentImage: string | null;
  setCurrentImage: (url: string | null) => void;

  // Estimated understanding level (1-5)
  estimatedLevel: number | null;
  setEstimatedLevel: (level: number | null) => void;

  // Actions
  listStudents: (setType?: 'mini_dev' | 'dev' | 'eval') => Promise<Student[]>;
  getStudentTopics: (studentId: string) => Promise<Topic[]>;
  startConversation: (studentId: string, topicId: string) => Promise<any>;
  sendMessage: (message: string) => Promise<any>;
  endConversation: () => void;

  // Auto-tutor
  autoTutorTurn: () => Promise<{
    tutorMessage: string;
    studentResponse: string;
    turnNumber: number;
    phase: 'diagnostic' | 'tutoring';
    estimatedLevel: number | null;
    isComplete: boolean;
  }>;
}

const TutoringContext = createContext<TutoringContextValue | null>(null);

export function TutoringProvider({ children }: { children: ReactNode }) {
  const simulation = useStudentSimulation();
  
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [liveStudentText, setLiveStudentText] = useState('');
  const [liveTutorText, setLiveTutorText] = useState('');
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [estimatedLevel, setEstimatedLevel] = useState<number | null>(null);

  const value: TutoringContextValue = {
    ...simulation,
    selectedStudent,
    selectedTopic,
    setSelectedStudent,
    setSelectedTopic,
    liveStudentText,
    liveTutorText,
    setLiveStudentText,
    setLiveTutorText,
    currentImage,
    setCurrentImage,
    estimatedLevel,
    setEstimatedLevel,
  };

  return (
    <TutoringContext.Provider value={value}>
      {children}
    </TutoringContext.Provider>
  );
}

export function useTutoringContext() {
  const context = useContext(TutoringContext);
  if (!context) {
    throw new Error('useTutoringContext must be used within a TutoringProvider');
  }
  return context;
}
