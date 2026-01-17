import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

// Voice IDs from ElevenLabs
const VOICE_IDS = {
  student: 'TX3LPaxmHKxFdv7VOQHJ', // Liam - young, natural
  tutor: 'nPczCjzI2devNBz1zQrb',   // Brian - warm, authoritative
};

interface DialogueData {
  student: string;
  tutor: string;
}

export function useTextToSpeech() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<'student' | 'tutor' | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generateSpeech = async (text: string, voiceId: string): Promise<string> => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text, voiceId }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `TTS request failed: ${response.status}`);
    }

    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
  };

  const playAudio = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      
      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed'));
      };
      
      audio.play().catch(reject);
    });
  };

  const playDialogue = useCallback(async (dialogue: DialogueData) => {
    if (isPlaying) return;
    
    setIsPlaying(true);
    
    try {
      // Play student line
      setCurrentSpeaker('student');
      toast.info('Student speaking...');
      const studentAudioUrl = await generateSpeech(dialogue.student, VOICE_IDS.student);
      await playAudio(studentAudioUrl);
      
      // Brief pause between speakers
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Play tutor line
      setCurrentSpeaker('tutor');
      toast.info('Tutor speaking...');
      const tutorAudioUrl = await generateSpeech(dialogue.tutor, VOICE_IDS.tutor);
      await playAudio(tutorAudioUrl);
      
      toast.success('Dialogue complete!');
    } catch (error) {
      console.error('TTS error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to play dialogue');
    } finally {
      setIsPlaying(false);
      setCurrentSpeaker(null);
      audioRef.current = null;
    }
  }, [isPlaying]);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
    setCurrentSpeaker(null);
  }, []);

  return {
    isPlaying,
    currentSpeaker,
    playDialogue,
    stopPlayback,
  };
}
