import { useState, useRef, useEffect, useCallback } from 'react';
import { useTutoringContext } from '@/contexts/TutoringContext';
import { ConversationMessage } from '@/hooks/useStudentSimulation';
import { Mic, MicOff, Send, Loader2, Volume2, StopCircle, ChevronDown, User, GraduationCap, Image, X, Sparkles, Play, Pause, Bot } from 'lucide-react';
import { toast } from 'sonner';

// API base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Voice configuration for ElevenLabs - each student has a unique voice
interface VoiceConfig {
  voiceId: string;
  stability: number;      // 0-1: lower = more expressive/emotional
  similarityBoost: number; // 0-1: how close to original voice
  style?: number;         // 0-1: style exaggeration (for v2)
}

interface PreparedSpeech {
  text: string;
  audioUrl: string;
  audio: HTMLAudioElement;
  durationMs: number;
}

// Student-specific voice configurations matched to personalities
const STUDENT_VOICES: Record<string, VoiceConfig> = {
  // Tim Weber - Grade 8, easily distracted, young energetic male
  '55cf65c1-9ddf-4d16-a301-41121d93b079': {
    voiceId: 'ErXwobaYiN019PkySvjV', // Antoni - young, energetic
    stability: 0.35,                  // Lower stability for scattered energy
    similarityBoost: 0.75,
  },
  // Lena Schmidt - Grade 9, anxious perfectionist, young female
  '654b4823-23a0-4c1f-a9cb-3c2d5f0e403a': {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - soft young female
    stability: 0.40,                  // Slightly nervous quality
    similarityBoost: 0.80,
  },
  // Felix Hoffmann - Grade 8, unmotivated/cool, laid-back male
  '99e2ce0b-5773-4d01-b084-05c663438d3c': {
    voiceId: 'yoZ06aMxZJJ28mfd3POQ', // Sam - raspy young male
    stability: 0.65,                  // More monotone, less enthusiastic
    similarityBoost: 0.70,
  },
  // Niklas Bauer - Grade 12, overconfident, deep confident male
  'c011d01c-29d4-4452-8fd7-fe84c3372f6d': {
    voiceId: 'TxGEqnHWrfWFTfGW9XjX', // Josh - deep, confident
    stability: 0.70,                  // Confident, steady delivery
    similarityBoost: 0.75,
  },
  // Amir Hassan - Grade 10, shy/uncertain, soft hesitant male
  '5417fe47-35aa-46b7-a811-566b14546422': {
    voiceId: 'SOYHLrjzK2X1ezoPC6cr', // Harry - anxious young male
    stability: 0.30,                  // Very expressive for hesitancy
    similarityBoost: 0.80,
  },
};

// Default student voice (fallback)
const DEFAULT_STUDENT_VOICE: VoiceConfig = {
  voiceId: 'TX3LPaxmHKxFdv7VOQHJ', // Liam
  stability: 0.5,
  similarityBoost: 0.75,
};

// Tutor voice - warm, authoritative teacher
const TUTOR_VOICE: VoiceConfig = {
  voiceId: 'nPczCjzI2devNBz1zQrb', // Brian - warm, authoritative narrator
  stability: 0.60,
  similarityBoost: 0.75,
};

// Helper to get voice config for current student
function getStudentVoice(studentId: string | undefined): VoiceConfig {
  if (!studentId) return DEFAULT_STUDENT_VOICE;
  return STUDENT_VOICES[studentId] || DEFAULT_STUDENT_VOICE;
}

interface GeneratedImage {
  url: string;
  description: string;
}

export function TutoringChat() {
  const {
    isLoading,
    students,
    topics,
    currentConversation,
    messages,
    currentTurn,
    selectedStudent,
    selectedTopic,
    setSelectedStudent,
    setSelectedTopic,
    setLiveStudentText,
    setLiveTutorText,
    setCurrentImage,
    setEstimatedLevel,
    listStudents,
    getStudentTopics,
    startConversation,
    sendMessage,
    endConversation,
    autoTutorTurn,
  } = useTutoringContext();

  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoTutorMode, setAutoTutorMode] = useState(false);
  const [isAutoTutoring, setIsAutoTutoring] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [messageImages, setMessageImages] = useState<Record<number, string>>({});
  const autoTutorRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load students on mount
  useEffect(() => {
    listStudents('mini_dev');
  }, [listStudents]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load topics when student is selected
  useEffect(() => {
    if (selectedStudent) {
      getStudentTopics(selectedStudent.id);
      setSelectedTopic(null);
    }
  }, [selectedStudent, getStudentTopics, setSelectedTopic]);

  // Clear live text when conversation ends
  useEffect(() => {
    if (!currentConversation) {
      setLiveStudentText('');
      setLiveTutorText('');
      setCurrentImage(null);
    }
  }, [currentConversation, setLiveStudentText, setLiveTutorText, setCurrentImage]);

  const prepareSpeechAudio = useCallback(async (text: string, voice: VoiceConfig): Promise<PreparedSpeech> => {
    const response = await fetch(`${API_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceId: voice.voiceId,
        stability: voice.stability,
        similarityBoost: voice.similarityBoost,
        style: voice.style,
      }),
    });

    if (!response.ok) throw new Error('TTS failed');

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error('Audio metadata failed'));
      audio.load();
    });

    const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;

    return {
      text,
      audioUrl,
      audio,
      durationMs,
    };
  }, []);

  const playPreparedSpeech = useCallback(async (prepared: PreparedSpeech, isStudent: boolean) => {
    const setText = isStudent ? setLiveStudentText : setLiveTutorText;
    setIsSpeaking(true);
    setText('...');

    try {
      const words = prepared.text.split(' ').filter(Boolean);
      const wordCount = Math.max(words.length, 1);
      const msPerWord = prepared.durationMs / wordCount;

      const playbackDone = new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          prepared.audio.onended = null;
          prepared.audio.onpause = null;
          prepared.audio.onerror = null;
        };

        const resolveOnce = () => {
          cleanup();
          resolve();
        };

        prepared.audio.onended = resolveOnce;
        prepared.audio.onpause = resolveOnce;
        prepared.audio.onerror = () => {
          cleanup();
          reject(new Error('Audio playback failed'));
        };
      });

      audioRef.current = prepared.audio;
      prepared.audio.currentTime = 0;
      await prepared.audio.play();

      let currentText = '';
      if (words.length === 0 || msPerWord <= 0) {
        setText(prepared.text);
      } else {
        for (let i = 0; i < words.length; i++) {
          if (prepared.audio.ended || prepared.audio.paused) {
            break;
          }
          currentText += (i > 0 ? ' ' : '') + words[i];
          setText(currentText);
          await new Promise(resolve => setTimeout(resolve, msPerWord));
        }
      }

      await playbackDone;
      setText(prepared.text);
    } catch (error) {
      console.error('TTS error:', error);
      setText(prepared.text);
    } finally {
      URL.revokeObjectURL(prepared.audioUrl);
      if (audioRef.current === prepared.audio) {
        audioRef.current = null;
      }
      setIsSpeaking(false);
    }
  }, [setLiveStudentText, setLiveTutorText]);

  const handleStartConversation = async () => {
    if (!selectedStudent || !selectedTopic) {
      toast.error('Please select a student and topic');
      return;
    }
    setEstimatedLevel(null); // Reset level for new conversation
    await startConversation(selectedStudent.id, selectedTopic.id);
  };

  const speakTextWithAnimation = useCallback(async (
    text: string,
    voice: VoiceConfig,
    isStudent: boolean,
    preparedSpeech?: PreparedSpeech
  ) => {
    try {
      const prepared = preparedSpeech ?? await prepareSpeechAudio(text, voice);
      await playPreparedSpeech(prepared, isStudent);
    } catch (error) {
      console.error('TTS error:', error);
      // On error, just show the full text
      if (isStudent) {
        setLiveStudentText(text);
      } else {
        setLiveTutorText(text);
      }
      setIsSpeaking(false);
    }
  }, [prepareSpeechAudio, playPreparedSpeech, setLiveStudentText, setLiveTutorText]);

  const speakText = useCallback(async (text: string, voice: VoiceConfig) => {
    try {
      setIsSpeaking(true);
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voiceId: voice.voiceId,
          stability: voice.stability,
          similarityBoost: voice.similarityBoost,
          style: voice.style,
        }),
      });

      if (!response.ok) throw new Error('TTS failed');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
        audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Helper to parse and handle image requests in tutor messages
  const processImageRequest = useCallback(async (message: string): Promise<string> => {
    const imageMatch = message.match(/\[IMAGE:\s*([^\]]+)\]/i);
    if (!imageMatch) return message;

    const imageDescription = imageMatch[1].trim();
    const cleanMessage = message.replace(/\[IMAGE:\s*[^\]]+\]/i, '').trim();

    // Generate image in background
    try {
      toast.info('🎨 Generating visual aid...');
      const response = await fetch(`${API_URL}/api/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: imageDescription,
          topic: selectedTopic?.name,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentImage(data.imageUrl);
        toast.success('📺 Image displayed on monitor!');
      }
    } catch (error) {
      console.error('Image generation failed:', error);
    }

    return cleanMessage;
  }, [selectedTopic, setCurrentImage]);

  // Run a single auto-tutor turn with speech
  const runAutoTutorTurn = useCallback(async () => {
    if (!currentConversation || isAutoTutoring) return;

    setIsAutoTutoring(true);
    try {
      const result = await autoTutorTurn();
      const studentVoice = getStudentVoice(selectedStudent?.id);

      // Update estimated understanding level
      setEstimatedLevel(result.estimatedLevel);

      // Process tutor message for image requests
      const cleanTutorMessage = await processImageRequest(result.tutorMessage);

      // Speak tutor message (without image tag)
      setLiveTutorText(cleanTutorMessage);
      if (autoSpeak) {
        const studentSpeechPromise = prepareSpeechAudio(result.studentResponse, studentVoice)
          .catch((error) => {
            console.error('TTS error:', error);
            return null;
          });

        let tutorSpeech: PreparedSpeech | null = null;
        try {
          tutorSpeech = await prepareSpeechAudio(cleanTutorMessage, TUTOR_VOICE);
        } catch (error) {
          console.error('TTS error:', error);
        }

        if (tutorSpeech) {
          await speakTextWithAnimation(cleanTutorMessage, TUTOR_VOICE, false, tutorSpeech);
        }

        // Small pause
        await new Promise(resolve => setTimeout(resolve, 500));

        const studentSpeech = await studentSpeechPromise;
        if (studentSpeech) {
          await speakTextWithAnimation(result.studentResponse, studentVoice, true, studentSpeech);
        } else {
          setLiveStudentText(result.studentResponse);
        }
      } else {
        setLiveStudentText(result.studentResponse);
      }

      return result;
    } catch (error) {
      console.error('Auto-tutor error:', error);
      toast.error('Auto-tutor failed');
    } finally {
      setIsAutoTutoring(false);
    }
  }, [
    currentConversation,
    isAutoTutoring,
    autoTutorTurn,
    autoSpeak,
    prepareSpeechAudio,
    speakTextWithAnimation,
    setLiveTutorText,
    setLiveStudentText,
    selectedStudent,
    processImageRequest,
    setEstimatedLevel,
  ]);

  // Run auto-tutor continuously
  const runAutoTutorSession = useCallback(async () => {
    if (!currentConversation) return;

    autoTutorRef.current = true;
    setAutoTutorMode(true);
    toast.info('🤖 Auto-tutor started! Click Stop to pause.');

    while (autoTutorRef.current && currentConversation) {
      const result = await runAutoTutorTurn();
      if (!result || result.isComplete) {
        autoTutorRef.current = false;
        setAutoTutorMode(false);
        toast.success('📚 Tutoring session complete!');
        break;
      }
      // Small pause between turns
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, [currentConversation, runAutoTutorTurn]);

  const stopAutoTutor = useCallback(() => {
    autoTutorRef.current = false;
    setAutoTutorMode(false);
    stopSpeaking();
    toast.info('Auto-tutor stopped');
  }, [stopSpeaking]);

  const generateEducationalImage = useCallback(async () => {
    if (!inputText.trim()) {
      toast.error('Please enter a message first');
      return;
    }

    setIsGeneratingImage(true);
    toast.info('🎨 Generating educational image...');

    try {
      const response = await fetch(`${API_URL}/api/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: inputText,
          topic: selectedTopic?.name,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Image generation failed');
      }

      const data = await response.json();
      setGeneratedImage({
        url: data.imageUrl,
        description: data.description,
      });
      // Also update the monitor display
      setCurrentImage(data.imageUrl);
      toast.success('✨ Image generated! Preview it before sending.');
    } catch (error) {
      console.error('Image generation error:', error);
      toast.error((error as Error).message || 'Failed to generate image');
    } finally {
      setIsGeneratingImage(false);
    }
  }, [inputText, selectedTopic, setCurrentImage]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !currentConversation) return;
    
    const message = inputText.trim();
    const imageToSend = generatedImage?.url;
    const messageIndex = messages.length;
    
    setInputText('');
    setGeneratedImage(null);
    
    // Update tutor speech bubble immediately
    setLiveTutorText(message);
    
    try {
      // Store the image for this message index if we have one
      if (imageToSend) {
        setMessageImages(prev => ({ ...prev, [messageIndex]: imageToSend }));
      }
      
      const responsePromise = sendMessage(message);
      const tutorSpeechPromise = autoSpeak
        ? prepareSpeechAudio(message, TUTOR_VOICE)
          .then((prepared) => speakTextWithAnimation(message, TUTOR_VOICE, false, prepared))
          .catch((error) => {
            console.error('TTS error:', error);
          })
        : Promise.resolve();

      const response = await responsePromise;

      // Update estimated level if available
      if (response?.estimated_level !== undefined) {
        setEstimatedLevel(response.estimated_level);
      }

      // Auto-speak student response with their unique voice
      if (autoSpeak && response?.student_response) {
        const studentVoice = getStudentVoice(selectedStudent?.id);
        const studentSpeech = await prepareSpeechAudio(response.student_response, studentVoice)
          .catch((error) => {
            console.error('TTS error:', error);
            return null;
          });
        await tutorSpeechPromise;
        if (studentSpeech) {
          await speakTextWithAnimation(response.student_response, studentVoice, true, studentSpeech);
        } else {
          setLiveStudentText(response.student_response);
        }
      } else if (response?.student_response) {
        // Just update the speech bubble without speaking
        setLiveStudentText(response.student_response);
      }
    } catch (error) {
      console.error('Send message error:', error);
      // Remove the image if send failed
      if (imageToSend) {
        setMessageImages(prev => {
          const newImages = { ...prev };
          delete newImages[messageIndex];
          return newImages;
        });
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        // Transcribe the audio
        await transcribeAudio(audioBlob);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      toast.info('Recording... Click again to stop');
    } catch (error) {
      console.error('Recording error:', error);
      toast.error('Failed to start recording. Check microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      toast.info('Transcribing...');
      
      const response = await fetch(`${API_URL}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': audioBlob.type || 'audio/webm',
        },
        body: audioBlob,
      });

      if (!response.ok) throw new Error('Transcription failed');

      const data = await response.json();
      if (data.text) {
        setInputText(data.text);
        toast.success('Transcription complete!');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast.error('Failed to transcribe audio');
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleEndConversation = () => {
    endConversation();
    setMessageImages({});
    setEstimatedLevel(null);
  };

  const panelStyle = {
    background: 'linear-gradient(180deg, #8BC34A 0%, #689F38 100%)',
    borderRadius: '12px',
    padding: '4px',
    boxShadow: '4px 4px 0px rgba(0,0,0,0.3), inset 0 2px 0 rgba(255,255,255,0.3)',
  };

  const innerPanelStyle = {
    background: 'linear-gradient(180deg, #FFF8DC 0%, #F5DEB3 100%)',
    borderRadius: '8px',
    border: '2px solid #8B7355',
    boxShadow: 'inset 0 2px 4px rgba(139,115,85,0.2)',
  };

  const fontStyle = {
    fontFamily: '"Comic Sans MS", "Chalkboard", cursive',
  };

  // Student/Topic Selection View
  if (!currentConversation) {
    return (
      <div className="absolute bottom-4 right-4 z-10 select-none w-80" style={panelStyle}>
        <div style={innerPanelStyle} className="p-4">
          <h3 className="text-lg font-bold mb-3 text-center" style={{ ...fontStyle, color: '#5D4037' }}>
            🎓 Start Tutoring Session
          </h3>

          {/* Student Selection */}
          <div className="mb-3">
            <label className="block text-sm mb-1" style={{ ...fontStyle, color: '#795548' }}>
              Select Student:
            </label>
            <div className="relative">
              <select
                value={selectedStudent?.id || ''}
                onChange={(e) => {
                  const student = students.find(s => s.id === e.target.value);
                  setSelectedStudent(student || null);
                }}
                disabled={isLoading}
                className="w-full p-2 pr-8 rounded-lg appearance-none cursor-pointer"
                style={{
                  ...fontStyle,
                  fontSize: '13px',
                  background: '#fff',
                  border: '2px solid #C4A484',
                  color: '#4E342E',
                }}
              >
                <option value="">Choose a student...</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.name} (Grade {student.grade_level})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Topic Selection */}
          <div className="mb-4">
            <label className="block text-sm mb-1" style={{ ...fontStyle, color: '#795548' }}>
              Select Topic:
            </label>
            <div className="relative">
              <select
                value={selectedTopic?.id || ''}
                onChange={(e) => {
                  const topic = topics.find(t => t.id === e.target.value);
                  setSelectedTopic(topic || null);
                }}
                disabled={!selectedStudent || isLoading}
                className="w-full p-2 pr-8 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  ...fontStyle,
                  fontSize: '13px',
                  background: '#fff',
                  border: '2px solid #C4A484',
                  color: '#4E342E',
                }}
              >
                <option value="">Choose a topic...</option>
                {topics.map(topic => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name} ({topic.subject_name})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartConversation}
            disabled={!selectedStudent || !selectedTopic || isLoading}
            className="w-full py-2 rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(180deg, #4CAF50 0%, #388E3C 100%)',
              border: '2px solid #2E7D32',
              boxShadow: '2px 2px 0px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            <span style={{ ...fontStyle, fontSize: '14px', color: '#fff', fontWeight: 'bold' }}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '🚀 Start Session'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // Chat View
  return (
    <div className="absolute bottom-4 right-4 z-10 select-none w-96" style={panelStyle}>
      <div style={innerPanelStyle} className="flex flex-col h-[500px]">
        {/* Header */}
        <div className="p-3 flex items-center justify-between" style={{ borderBottom: '2px dashed #C4A484' }}>
          <div className="flex items-center gap-2">
            <div 
              className="w-4 h-4"
              style={{
                background: 'linear-gradient(135deg, #4CAF50 0%, #81C784 50%, #2E7D32 100%)',
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
              }}
            />
            <span style={{ ...fontStyle, fontSize: '14px', color: '#5D4037', fontWeight: 'bold' }}>
              {selectedStudent?.name} • {selectedTopic?.name}
            </span>
          </div>
          <button
            onClick={handleEndConversation}
            className="text-xs px-2 py-1 rounded hover:bg-red-100 transition-colors"
            style={{ ...fontStyle, color: '#d32f2f' }}
          >
            End
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8" style={{ ...fontStyle, color: '#9E9E9E', fontSize: '13px' }}>
              <p>👋 Start the conversation!</p>
              <p className="text-xs mt-1">Type a message or use voice input</p>
              <p className="text-xs mt-1">🎨 Generate images to help explain concepts!</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              message={msg}
              imageUrl={messageImages[idx]}
              onSpeak={() => speakText(msg.content, msg.role === 'student' ? getStudentVoice(selectedStudent?.id) : TUTOR_VOICE)}
              isSpeaking={isSpeaking}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Generated Image Preview */}
        {generatedImage && (
          <div className="px-3 pb-2">
            <div 
              className="relative rounded-lg overflow-hidden border-2"
              style={{ borderColor: '#81C784' }}
            >
              <img 
                src={generatedImage.url} 
                alt="Generated educational illustration"
                className="w-full h-32 object-cover"
              />
              <button
                onClick={() => {
                  setGeneratedImage(null);
                  setCurrentImage(null);
                }}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
              <div 
                className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 text-center"
                style={fontStyle}
              >
                ✨ Image ready to send with message
              </div>
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-3" style={{ borderTop: '2px dashed #C4A484' }}>
          {/* Auto-speak toggle */}
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="w-4 h-4"
              />
              <span style={{ ...fontStyle, fontSize: '11px', color: '#795548' }}>
                🔊 Auto-speak responses
              </span>
            </label>
            {isSpeaking && (
              <button onClick={stopSpeaking} className="text-red-500 animate-pulse">
                <StopCircle className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Auto-tutor controls */}
          <div className="flex items-center gap-2 mb-2">
            <span style={{ ...fontStyle, fontSize: '11px', color: '#795548' }}>
              🤖 Auto-Tutor:
            </span>
            <button
              onClick={runAutoTutorTurn}
              disabled={isLoading || isAutoTutoring || autoTutorMode}
              className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(180deg, #9C27B0 0%, #7B1FA2 100%)',
                boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
              }}
              title="Run single auto-tutor turn"
            >
              <Bot className="w-4 h-4 text-white" />
              <span style={{ ...fontStyle, fontSize: '10px', color: '#fff' }}>1 Turn</span>
            </button>

            {!autoTutorMode ? (
              <button
                onClick={runAutoTutorSession}
                disabled={isLoading || isAutoTutoring}
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(180deg, #4CAF50 0%, #388E3C 100%)',
                  boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
                }}
                title="Start auto-tutor session"
              >
                <Play className="w-4 h-4 text-white" />
                <span style={{ ...fontStyle, fontSize: '10px', color: '#fff' }}>Auto</span>
              </button>
            ) : (
              <button
                onClick={stopAutoTutor}
                className="flex items-center gap-1 px-2 py-1 rounded-lg transition-all animate-pulse"
                style={{
                  background: 'linear-gradient(180deg, #f44336 0%, #d32f2f 100%)',
                  boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
                }}
                title="Stop auto-tutor"
              >
                <Pause className="w-4 h-4 text-white" />
                <span style={{ ...fontStyle, fontSize: '10px', color: '#fff' }}>Stop</span>
              </button>
            )}

            {isAutoTutoring && (
              <span style={{ ...fontStyle, fontSize: '10px', color: '#9C27B0' }} className="animate-pulse">
                Tutoring...
              </span>
            )}
          </div>

          {/* Input row */}
          <div className="flex gap-2">
            <button
              onClick={handleMicClick}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-all ${isRecording ? 'bg-red-500' : 'bg-blue-500'} disabled:opacity-50`}
              style={{
                boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
              }}
              title="Voice input"
            >
              {isRecording ? (
                <MicOff className="w-5 h-5 text-white animate-pulse" />
              ) : (
                <Mic className="w-5 h-5 text-white" />
              )}
            </button>

            <button
              onClick={generateEducationalImage}
              disabled={isLoading || isGeneratingImage || !inputText.trim()}
              className="p-2 rounded-lg transition-all disabled:opacity-50"
              style={{
                background: isGeneratingImage 
                  ? 'linear-gradient(180deg, #9C27B0 0%, #7B1FA2 100%)'
                  : 'linear-gradient(180deg, #FF9800 0%, #F57C00 100%)',
                boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
              }}
              title="Generate educational image"
            >
              {isGeneratingImage ? (
                <Sparkles className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Image className="w-5 h-5 text-white" />
              )}
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 p-2 rounded-lg disabled:opacity-50"
              style={{
                ...fontStyle,
                fontSize: '13px',
                background: '#fff',
                border: '2px solid #C4A484',
                color: '#4E342E',
              }}
            />

            <button
              onClick={handleSendMessage}
              disabled={isLoading || !inputText.trim()}
              className="p-2 rounded-lg transition-all disabled:opacity-50"
              style={{
                background: 'linear-gradient(180deg, #4CAF50 0%, #388E3C 100%)',
                boxShadow: '2px 2px 0px rgba(0,0,0,0.2)',
              }}
              title="Send message"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Send className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple markdown renderer for chat messages
function renderMarkdown(text: string): React.ReactNode {
  // Strip image tags from display
  const cleanText = text.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').trim();

  // Split by newlines first to handle line breaks
  const lines = cleanText.split('\n');

  return lines.map((line, lineIndex) => {
    // Process inline markdown
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    while (remaining.length > 0) {
      // Check for **bold**
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      // Check for *italic*
      const italicMatch = remaining.match(/\*([^*]+)\*/);

      if (boldMatch && boldMatch.index !== undefined &&
          (!italicMatch || boldMatch.index <= (italicMatch.index ?? Infinity))) {
        // Add text before bold
        if (boldMatch.index > 0) {
          parts.push(remaining.slice(0, boldMatch.index));
        }
        // Add bold text
        parts.push(<strong key={`b-${lineIndex}-${keyIndex++}`}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      } else if (italicMatch && italicMatch.index !== undefined) {
        // Add text before italic
        if (italicMatch.index > 0) {
          parts.push(remaining.slice(0, italicMatch.index));
        }
        // Add italic text
        parts.push(<em key={`i-${lineIndex}-${keyIndex++}`}>{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
      } else {
        // No more markdown, add remaining text
        parts.push(remaining);
        break;
      }
    }

    return (
      <span key={lineIndex}>
        {parts}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}

function MessageBubble({
  message,
  imageUrl,
  onSpeak,
  isSpeaking,
}: {
  message: ConversationMessage;
  imageUrl?: string;
  onSpeak: () => void;
  isSpeaking: boolean;
}) {
  const isStudent = message.role === 'student';
  const fontStyle = { fontFamily: '"Comic Sans MS", "Chalkboard", cursive' };

  return (
    <div className={`flex ${isStudent ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] p-2 rounded-lg relative group ${isStudent ? 'rounded-bl-none' : 'rounded-br-none'}`}
        style={{
          background: isStudent
            ? 'linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 100%)'
            : 'linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 100%)',
          border: `2px solid ${isStudent ? '#64B5F6' : '#81C784'}`,
        }}
      >
        <div className="flex items-start gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isStudent ? 'bg-blue-400' : 'bg-green-400'}`}>
            {isStudent ? <User className="w-3 h-3 text-white" /> : <GraduationCap className="w-3 h-3 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            {imageUrl && (
              <div className="mb-2 rounded-lg overflow-hidden">
                <img
                  src={imageUrl}
                  alt="Educational illustration"
                  className="w-full h-auto max-h-40 object-cover rounded"
                />
              </div>
            )}
            <div style={{ ...fontStyle, fontSize: '12px', color: '#4E342E' }}>
              {renderMarkdown(message.content)}
            </div>
          </div>
        </div>

        {/* Speak button */}
        <button
          onClick={onSpeak}
          disabled={isSpeaking}
          className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-1 shadow-md disabled:opacity-50"
        >
          <Volume2 className="w-3 h-3 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
