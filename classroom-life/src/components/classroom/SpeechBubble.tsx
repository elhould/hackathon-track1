import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

interface SpeechBubbleProps {
  position: [number, number, number];
  text: string;
  isStudent?: boolean;
}

export function SpeechBubble({ position, text, isStudent = false }: SpeechBubbleProps) {
  const groupRef = useRef<THREE.Group>(null);
  
  // Gentle floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.5 + (isStudent ? 0 : 1)) * 0.05;
    }
  });
  
  const bubbleColor = isStudent ? "#e8f4fd" : "#fff8e8";
  const borderColor = isStudent ? "#7eb8da" : "#e8c170";
  
  return (
    <Billboard position={position} follow={true}>
      <group ref={groupRef}>
        {/* Bubble background */}
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.2, 0.8]} />
          <meshBasicMaterial color={borderColor} />
        </mesh>
        <mesh>
          <planeGeometry args={[2.1, 0.7]} />
          <meshBasicMaterial color={bubbleColor} />
        </mesh>
        
        {/* Rounded corners effect - corner circles */}
        {[
          [-1, 0.3],
          [1, 0.3],
          [-1, -0.3],
          [1, -0.3],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <circleGeometry args={[0.1, 8]} />
            <meshBasicMaterial color={bubbleColor} />
          </mesh>
        ))}
        
        {/* Speech pointer/tail */}
        <mesh position={[isStudent ? -0.3 : 0.3, -0.5, -0.01]} rotation={[0, 0, isStudent ? 0.3 : -0.3]}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={3}
              array={new Float32Array([
                0, 0.2, 0,
                -0.15, -0.2, 0,
                0.15, -0.2, 0,
              ])}
              itemSize={3}
            />
          </bufferGeometry>
          <meshBasicMaterial color={bubbleColor} side={THREE.DoubleSide} />
        </mesh>
        
        {/* Text */}
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.15}
          color="#2d3748"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.9}
          textAlign="center"
          font={undefined}
        >
          {text}
        </Text>
      </group>
    </Billboard>
  );
}
