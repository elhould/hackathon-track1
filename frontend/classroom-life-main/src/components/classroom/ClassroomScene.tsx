import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useState, useRef } from 'react';
import { Vector3 } from 'three';
import { Room } from './Room';
import { Furniture } from './Furniture';
import { StudentCharacter } from './StudentCharacter';
import { TutorCharacter } from './TutorCharacter';
import { SpeechBubble } from './SpeechBubble';
import { ClassroomMonitor } from './ClassroomMonitor';
import { StudentInfoPanel } from './StudentInfoPanel';
import { TutoringChat } from './TutoringChat';
import { useTutoringContext } from '@/contexts/TutoringContext';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export function ClassroomScene() {
  const [isMonitorFocused, setIsMonitorFocused] = useState(false);
  const controlsRef = useRef<OrbitControlsType>(null);
  
  const { 
    selectedStudent, 
    selectedTopic, 
    liveStudentText, 
    liveTutorText,
    currentImage,
    currentConversation,
  } = useTutoringContext();

  const handleMonitorClick = () => {
    if (controlsRef.current) {
      setIsMonitorFocused(true);
    }
  };

  const handleBackClick = () => {
    setIsMonitorFocused(false);
  };

  // Camera positions - adjusted for monitor on left wall
  const defaultCamera = { position: [12, 12, 12] as const, target: [0, 1, 0] as const };
  const monitorCamera = { position: [2, 3.5, 0] as const, target: [-5.5, 3.5, 0] as const };
  
  const currentCamera = isMonitorFocused ? monitorCamera : defaultCamera;

  // Dynamic content based on conversation state
  const chalkboardGreeting = currentConversation 
    ? `Welcome, ${selectedStudent?.name || 'Student'}!` 
    : "Welcome Class!";
  const chalkboardTopic = selectedTopic?.name || "Today's Lesson";
  const chalkboardSubject = selectedTopic?.subject_name || "Learning";

  // Monitor content - show current topic or generated image description
  const monitorContent = {
    example: currentConversation
      ? `Session with ${selectedStudent?.name}`
      : "Select a student to begin",
    title: selectedTopic?.name || "Knowunity Tutor",
    formula: selectedTopic?.subject_name || "AI-Powered Learning",

    imageUrl: currentImage || "/placeholder.svg",
  };

  // Speech bubble text - show live conversation or default
  const studentBubbleText = liveStudentText || (currentConversation ? "..." : "I'm ready to learn!");
  const tutorBubbleText = liveTutorText || (currentConversation ? "..." : "Let's start a lesson!");

  return (
    <div className="w-full h-screen bg-gradient-to-b from-[hsl(200,60%,85%)] to-[hsl(200,50%,75%)] relative">
      {/* Back button when focused on monitor */}
      {isMonitorFocused && (
        <button
          onClick={handleBackClick}
          className="absolute top-4 left-4 z-10 bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
        >
          <span>←</span>
          <span>Back to Classroom</span>
        </button>
      )}
      
      {/* Sims-style student info panel */}
      {!isMonitorFocused && <StudentInfoPanel />}
      
      {/* Tutoring chat interface */}
      {!isMonitorFocused && <TutoringChat />}
      
      <Canvas
        shadows
        camera={{
          position: [12, 12, 12],
          fov: 35,
          near: 0.1,
          far: 100,
        }}
        gl={{ antialias: true }}
        style={{ cursor: 'grab' }}
        onPointerMissed={isMonitorFocused ? handleBackClick : undefined}
      >
        <Suspense fallback={null}>
          {/* Warm ambient lighting for cozy Sims feel */}
          <ambientLight intensity={0.6} color="#fff5e6" />
          <directionalLight
            position={[10, 15, 10]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            color="#fff8f0"
          />
          <pointLight position={[-5, 8, 5]} intensity={0.3} color="#ffeedd" />
          
          {/* The classroom */}
          <Room />
          <Furniture 
            greeting={chalkboardGreeting}
            topic={chalkboardTopic}
            subject={chalkboardSubject}
          />
          
          {/* Characters - positioned and rotated to face each other */}
          <StudentCharacter position={[0, 0, 1.8]} rotation={[0, Math.PI - 0.5, 0]} />
          <TutorCharacter position={[3, 0, -4]} rotation={[0, Math.PI * 0.15, 0]} />
          
          {/* Speech bubbles - live updated, hidden when monitor focused */}
          {!isMonitorFocused && (
            <>
              <SpeechBubble
                position={[0, 3.5, 0.9]}
                text={studentBubbleText}
                isStudent
              />
              <SpeechBubble
                position={[3, 3.8, -4]}
                text={tutorBubbleText}
              />
            </>
          )}
          
          {/* In-world monitor - 3x larger, on left wall facing into room */}
          <ClassroomMonitor
            position={[-5.5, 3.5, 0]}
            content={monitorContent}
            onClick={handleMonitorClick}
            isFocused={isMonitorFocused}
            scale={2.5}
          />
          
          {/* Camera controls */}
          <CameraController
            controlsRef={controlsRef}
            cameraPosition={currentCamera.position}
            target={currentCamera.target}
            isMonitorFocused={isMonitorFocused}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Separate component for camera animation
function CameraController({
  controlsRef,
  cameraPosition,
  target,
  isMonitorFocused,
}: {
  controlsRef: React.RefObject<OrbitControlsType>;
  cameraPosition: readonly [number, number, number];
  target: readonly [number, number, number];
  isMonitorFocused: boolean;
}) {
  const { camera } = useThree();
  const targetVec = useRef(new Vector3(...target));
  const positionVec = useRef(new Vector3(...cameraPosition));
  
  useFrame(() => {
    // Smoothly interpolate camera position
    positionVec.current.set(...cameraPosition);
    camera.position.lerp(positionVec.current, 0.05);
    
    // Update target
    if (controlsRef.current) {
      targetVec.current.set(...target);
      controlsRef.current.target.lerp(targetVec.current, 0.05);
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={!isMonitorFocused}
      enablePan={!isMonitorFocused}
      enableRotate={!isMonitorFocused}
      target={[target[0], target[1], target[2]]}
      minDistance={5}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2}
    />
  );
}
