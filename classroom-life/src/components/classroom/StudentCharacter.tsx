import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface StudentCharacterProps {
  position: [number, number, number];
}

export function StudentCharacter({ position }: StudentCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  
  // Idle animation - gentle swaying and head movement
  useFrame((state) => {
    if (groupRef.current) {
      // Subtle body sway
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8) * 0.02;
    }
    if (headRef.current) {
      // Head tilt animation
      headRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.2) * 0.05;
      headRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.6) * 0.03;
    }
  });

  // Sims-style pastel skin and clothing
  const skinColor = "#ffd5c8";
  const hairColor = "#4a3728";
  const shirtColor = "#7eb8da"; // Pastel blue shirt
  const pantsColor = "#4a5568";
  
  return (
    <group position={position}>
      {/* Seated on chair at desk */}
      <group ref={groupRef} position={[0, 0.9, 0.9]}>
        {/* Body/Torso */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.45, 0.5, 0.3]} />
          <meshLambertMaterial color={shirtColor} />
        </mesh>
        
        {/* Shirt collar detail */}
        <mesh position={[0, 0.62, 0.1]}>
          <boxGeometry args={[0.2, 0.08, 0.15]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
        
        {/* Head - larger for Sims proportions */}
        <mesh ref={headRef} position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[0.4, 0.45, 0.35]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        
        {/* Hair */}
        <mesh position={[0, 1.05, -0.02]} castShadow>
          <boxGeometry args={[0.42, 0.2, 0.38]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
        
        {/* Hair sides */}
        <mesh position={[-0.18, 0.95, 0]}>
          <boxGeometry args={[0.08, 0.15, 0.36]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
        <mesh position={[0.18, 0.95, 0]}>
          <boxGeometry args={[0.08, 0.15, 0.36]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
        
        {/* Eyes */}
        <mesh position={[-0.1, 0.92, 0.18]}>
          <boxGeometry args={[0.08, 0.06, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.1, 0.92, 0.18]}>
          <boxGeometry args={[0.08, 0.06, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.1, 0.92, 0.19]}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
          <meshBasicMaterial color="#2d3748" />
        </mesh>
        <mesh position={[0.1, 0.92, 0.19]}>
          <boxGeometry args={[0.04, 0.04, 0.02]} />
          <meshBasicMaterial color="#2d3748" />
        </mesh>
        
        {/* Smile */}
        <mesh position={[0, 0.78, 0.18]}>
          <boxGeometry args={[0.12, 0.03, 0.02]} />
          <meshBasicMaterial color="#cc6666" />
        </mesh>
        
        {/* Arms resting on desk */}
        {/* Left arm */}
        <mesh position={[-0.32, 0.2, 0.1]} rotation={[0.3, 0, 0.2]} castShadow>
          <boxGeometry args={[0.12, 0.35, 0.12]} />
          <meshLambertMaterial color={shirtColor} />
        </mesh>
        {/* Left hand */}
        <mesh position={[-0.35, 0.02, 0.2]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        
        {/* Right arm */}
        <mesh position={[0.32, 0.2, 0.1]} rotation={[0.3, 0, -0.2]} castShadow>
          <boxGeometry args={[0.12, 0.35, 0.12]} />
          <meshLambertMaterial color={shirtColor} />
        </mesh>
        {/* Right hand */}
        <mesh position={[0.35, 0.02, 0.2]} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        
        {/* Legs (seated) */}
        <mesh position={[-0.12, -0.1, 0.15]} rotation={[1.4, 0, 0]} castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshLambertMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0.12, -0.1, 0.15]} rotation={[1.4, 0, 0]} castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshLambertMaterial color={pantsColor} />
        </mesh>
      </group>
    </group>
  );
}
