import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TutorCharacterProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function TutorCharacter({ position, rotation = [0, 0, 0] }: TutorCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const armRef = useRef<THREE.Mesh>(null);
  
  // Idle animation - subtle movement and gesturing
  useFrame((state) => {
    if (groupRef.current) {
      // Weight shifting
      groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.015;
    }
    if (headRef.current) {
      // Looking at student
      headRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.1 - 0.2;
      headRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.7) * 0.04;
    }
    if (armRef.current) {
      // Gesturing arm
      armRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 1.5) * 0.15 - 0.8;
    }
  });

  const skinColor = "#ffe4d6";
  const hairColor = "#8b6914";
  const blazerColor = "#5c4033"; // Professional brown blazer
  const pantsColor = "#2d3748";
  
  return (
    <group position={position} rotation={rotation}>
      <group ref={groupRef}>
        {/* Legs - standing */}
        <mesh position={[-0.12, 0.45, 0]} castShadow>
          <boxGeometry args={[0.18, 0.9, 0.18]} />
          <meshLambertMaterial color={pantsColor} />
        </mesh>
        <mesh position={[0.12, 0.45, 0]} castShadow>
          <boxGeometry args={[0.18, 0.9, 0.18]} />
          <meshLambertMaterial color={pantsColor} />
        </mesh>
        
        {/* Shoes */}
        <mesh position={[-0.12, 0.06, 0.05]} castShadow>
          <boxGeometry args={[0.18, 0.12, 0.28]} />
          <meshLambertMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.12, 0.06, 0.05]} castShadow>
          <boxGeometry args={[0.18, 0.12, 0.28]} />
          <meshLambertMaterial color="#1a1a1a" />
        </mesh>
        
        {/* Body/Torso - taller for standing adult */}
        <mesh position={[0, 1.25, 0]} castShadow>
          <boxGeometry args={[0.55, 0.7, 0.35]} />
          <meshLambertMaterial color={blazerColor} />
        </mesh>
        
        {/* Shirt visible under blazer */}
        <mesh position={[0, 1.25, 0.15]}>
          <boxGeometry args={[0.25, 0.5, 0.08]} />
          <meshLambertMaterial color="#f5f5dc" />
        </mesh>
        
        {/* Tie */}
        <mesh position={[0, 1.2, 0.19]}>
          <boxGeometry args={[0.08, 0.4, 0.02]} />
          <meshLambertMaterial color="#8b0000" />
        </mesh>
        
        {/* Head */}
        <mesh ref={headRef} position={[0, 1.85, 0]} castShadow>
          <boxGeometry args={[0.42, 0.48, 0.38]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        
        {/* Hair - neat style */}
        <mesh position={[0, 2.02, -0.02]} castShadow>
          <boxGeometry args={[0.44, 0.18, 0.4]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
        <mesh position={[0, 1.95, 0.15]}>
          <boxGeometry args={[0.35, 0.08, 0.1]} />
          <meshLambertMaterial color={hairColor} />
        </mesh>
        
        {/* Glasses */}
        <mesh position={[0, 1.88, 0.2]}>
          <boxGeometry args={[0.38, 0.02, 0.02]} />
          <meshLambertMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[-0.12, 1.88, 0.2]}>
          <boxGeometry args={[0.12, 0.1, 0.02]} />
          <meshBasicMaterial color="#87ceeb" transparent opacity={0.3} />
        </mesh>
        <mesh position={[0.12, 1.88, 0.2]}>
          <boxGeometry args={[0.12, 0.1, 0.02]} />
          <meshBasicMaterial color="#87ceeb" transparent opacity={0.3} />
        </mesh>
        
        {/* Eyes behind glasses */}
        <mesh position={[-0.12, 1.88, 0.19]}>
          <boxGeometry args={[0.06, 0.05, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.12, 1.88, 0.19]}>
          <boxGeometry args={[0.06, 0.05, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[-0.12, 1.88, 0.195]}>
          <boxGeometry args={[0.03, 0.03, 0.02]} />
          <meshBasicMaterial color="#2d3748" />
        </mesh>
        <mesh position={[0.12, 1.88, 0.195]}>
          <boxGeometry args={[0.03, 0.03, 0.02]} />
          <meshBasicMaterial color="#2d3748" />
        </mesh>
        
        {/* Friendly smile */}
        <mesh position={[0, 1.73, 0.19]}>
          <boxGeometry args={[0.14, 0.04, 0.02]} />
          <meshBasicMaterial color="#cc8866" />
        </mesh>
        
        {/* Left arm (at side) */}
        <mesh position={[-0.38, 1.1, 0]} castShadow>
          <boxGeometry args={[0.14, 0.5, 0.14]} />
          <meshLambertMaterial color={blazerColor} />
        </mesh>
        <mesh position={[-0.38, 0.8, 0]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshLambertMaterial color={skinColor} />
        </mesh>
        
        {/* Right arm (gesturing) */}
        <group position={[0.38, 1.3, 0]}>
          <mesh ref={armRef} position={[0, -0.15, 0.2]} castShadow>
            <boxGeometry args={[0.14, 0.5, 0.14]} />
            <meshLambertMaterial color={blazerColor} />
          </mesh>
          <mesh position={[0.05, 0.1, 0.45]} castShadow>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshLambertMaterial color={skinColor} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
