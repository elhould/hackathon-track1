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
import { mockDialogue, mockLearningContent } from './mockData';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';

export function ClassroomScene() {
  const [isMonitorFocused, setIsMonitorFocused] = useState(false);
  const controlsRef = useRef<OrbitControlsType>(null);

  const handleMonitorClick = () => {
    if (controlsRef.current) {
      setIsMonitorFocused(true);
    }
  };

  const handleBackClick = () => {
    setIsMonitorFocused(false);
  };

  // Camera positions
  const defaultCamera = { position: [12, 12, 12] as const, target: [0, 1, 0] as const };
  const monitorCamera = { position: [-2, 2.5, -2] as const, target: [-4.8, 2.5, -2] as const };
  
  const currentCamera = isMonitorFocused ? monitorCamera : defaultCamera;

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
          <Furniture />
          
          {/* Characters */}
          <StudentCharacter position={[0, 0, 0]} />
          <TutorCharacter position={[2.5, 0, 0.5]} />
          
          {/* Speech bubbles */}
          <SpeechBubble
            position={[0, 3.2, 0]}
            text={mockDialogue.student}
            isStudent
          />
          <SpeechBubble
            position={[2.5, 3.8, 0.5]}
            text={mockDialogue.tutor}
          />
          
          {/* In-world monitor */}
          <ClassroomMonitor
            position={[-4.8, 2.5, -2]}
            content={mockLearningContent}
            onClick={handleMonitorClick}
            isFocused={isMonitorFocused}
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
